%% vim: ts=4 sw=4 et ft=erlang
-module(nitrogen_main_handler).
-export([run/0, ws_init/0]).

handlers() ->
    nitrogen:handler(debug_crash_handler, []),
    ok.

ws_init() ->
    handlers().

run() ->
    handlers(),
    wf:header('cache-control', "no-cache, no-store, private, max-age=0"),
    wf_core:run().
