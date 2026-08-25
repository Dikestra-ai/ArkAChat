%% vim: ts=4 sw=4 et ft=erlang
-module(nitrogen_main_handler).
-export([run/0, ws_init/0]).

handlers() ->
    %% SECURITY: use Nitrogen's default crash handler — a generic error page
    %% for the client, details logged server-side only. Do NOT install
    %% debug_crash_handler here: it renders stack traces, function arguments
    %% and internal paths to the browser on any page/event crash.
    ok.

ws_init() ->
    handlers().

run() ->
    handlers(),
    wf:header('cache-control', "no-cache, no-store, private, max-age=0"),
    wf_core:run().
