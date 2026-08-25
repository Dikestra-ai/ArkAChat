#!/bin/sh
# ArkAChat shield-proxy container entrypoint.
#
# WHY THIS EXISTS (security review F1 — CRITICAL):
# The shield-proxy binary performs NO environment-variable interpolation on its
# TOML config: ProxyConfig::load() reads the file and passes it straight to
# toml::from_str. If a config containing "${SHIELD_PROXY_PASSWORD}" is handed
# to the binary directly, that LITERAL STRING becomes the live Shield PSK.
# This entrypoint renders the ${VAR} placeholders in the config template with
# envsubst before launching the proxy, and FAILS CLOSED if any secret is
# missing, still a documented placeholder, or left unexpanded.
set -eu

TEMPLATE="${SHIELD_PROXY_TEMPLATE:-/etc/shield-proxy/config.toml.template}"
RENDERED="${SHIELD_PROXY_CONFIG:-/run/shield-proxy/config.toml}"

fail() {
    echo "FATAL: $1" >&2
    exit 1
}

command -v envsubst >/dev/null 2>&1 \
    || fail "envsubst not found (the image must install gettext-base)"
[ -r "$TEMPLATE" ] \
    || fail "config template not found or unreadable: $TEMPLATE"

# Every variable the templates reference. Keep in sync with the ${...}
# placeholders in shield-proxy.toml.template / shield-proxy-standby.toml.template.
REQUIRED_VARS="SHIELD_PROXY_PASSWORD SHIELD_PROXY_KEY_SMP4 SHIELD_PROXY_KEY_SMP5 SHIELD_PROXY_KEY_SMP6 SHIELD_PROXY_REDUNDANCY_PSK"

for name in $REQUIRED_VARS; do
    eval "value=\${$name:-}"
    case "$value" in
        "")
            fail "$name is unset or empty — refusing to start without a real secret"
            ;;
        change-me-in-production|change-me|changeme|password|secret|generate-with-shield-keygen|your-pre-shared-key-here)
            fail "$name is still a documented placeholder — generate a real secret (e.g. 'openssl rand -base64 48' or shield-keygen)"
            ;;
        *'${'*)
            fail "$name contains an unexpanded \${...} reference — set a literal secret value"
            ;;
    esac
done

umask 077
RENDER_DIR=$(dirname "$RENDERED")
[ -d "$RENDER_DIR" ] || mkdir -p "$RENDER_DIR" \
    || fail "cannot create $RENDER_DIR (mount a writable tmpfs there)"

# Substitute ONLY the whitelisted variables so no other '$' sequence in the
# config can be rewritten by a stray environment variable.
SUBST_SPEC=""
for name in $REQUIRED_VARS; do
    SUBST_SPEC="$SUBST_SPEC \${$name}"
done
envsubst "$SUBST_SPEC" < "$TEMPLATE" > "$RENDERED" \
    || fail "envsubst failed rendering $TEMPLATE -> $RENDERED"

# Fail closed: no ${...} may survive rendering. This catches template variables
# missing from REQUIRED_VARS as well as typos in variable names — an unexpanded
# placeholder must never be accepted as a live key (F1 aggravator).
if grep -n '\${' "$RENDERED" >/dev/null 2>&1; then
    echo "FATAL: rendered config still contains unexpanded \${...} placeholders:" >&2
    grep -n '\${' "$RENDERED" | sed 's/=.*/= <unexpanded placeholder>/' >&2
    rm -f "$RENDERED"
    exit 1
fi

exec /usr/local/bin/shield-proxy "$@"
