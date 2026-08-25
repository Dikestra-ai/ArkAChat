# ArkAChat Shield Proxy
# Extends Shield proxy with ArkAChat-specific config
#
# Base images pinned by digest (F7, supply chain). Digests resolved 2026-08-12
# for the multi-arch manifest lists:
#   docker.io/library/rust:1.82
#   docker.io/library/debian:12-slim
FROM rust:1.82@sha256:d9c3c6f1264a547d84560e06ffd79ed7a799ce0bff0980b26cf10d29af888377 AS builder
WORKDIR /build
COPY Shield/shield-core/ shield-core/
COPY Shield/shield-proxy/ shield-proxy/
WORKDIR /build/shield-proxy
# --locked (F7): refuse to build if Cargo.lock is missing or out of date so the
# dependency graph is reproducible. The vendored Shield checkout must commit a
# Cargo.lock (cargo generate-lockfile) or this build fails — intentionally.
RUN cargo build --release --locked

# Runtime: debian:12-slim instead of distroless so the entrypoint can run
# envsubst (gettext-base) to render ${VAR} secrets into the config — the
# shield-proxy binary performs no env interpolation itself (F1) — and so the
# compose healthcheck has a shell for a real TCP probe (F7).
FROM debian:12-slim@sha256:abd67ffcfa541b485a3dff59865ab629aa048a6c613e639d36e7456b0b229241
RUN apt-get update \
    && apt-get install -y --no-install-recommends gettext-base \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/shield-proxy/target/release/shield-proxy /usr/local/bin/shield-proxy
COPY --chmod=0755 arkachat-proxy/entrypoint.sh /usr/local/bin/shield-proxy-entrypoint.sh
# The template is bind-mounted read-only by compose; the rendered config (with
# real secrets) is written to a tmpfs and never touches disk or the image.
ENV SHIELD_PROXY_TEMPLATE=/etc/shield-proxy/config.toml.template
ENV SHIELD_PROXY_CONFIG=/run/shield-proxy/config.toml
ENV RUST_LOG=info
# F7: run as nonroot. 65532:65532 matches the distroless "nonroot" convention.
USER 65532:65532
# Only the client entrypoint is advertised: metrics binds loopback inside the
# container (F2) and the DNS forwarder is disabled (F3/F4).
EXPOSE 8443
ENTRYPOINT ["/usr/local/bin/shield-proxy-entrypoint.sh"]
