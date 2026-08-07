#!/usr/bin/env bash
set -e

APP_EBIN="_build/test/lib/arkachat/ebin"
NITROGEN_EBIN="_build/default/lib/nitrogen_core/ebin"
BEAM_OUT="/tmp/arkachat_test_beams"

mkdir -p "$BEAM_OUT"

erlc -pa "$APP_EBIN" -pa "$NITROGEN_EBIN" \
  -o "$BEAM_OUT" \
  test/shield_bridge_tests.erl test/bot_tests.erl

PA_ARGS=""
for d in $(find _build/default/lib -name "ebin" -type d); do
  PA_ARGS="$PA_ARGS -pa $d"
done
PA_ARGS="$PA_ARGS -pa $APP_EBIN -pa $BEAM_OUT"

erl -noshell $PA_ARGS \
  -eval '
    application:ensure_all_started(crypto),
    Results = eunit:test([shield_bridge_tests, bot_tests], [verbose]),
    case Results of
        ok    -> halt(0);
        error -> halt(1)
    end.
  '
