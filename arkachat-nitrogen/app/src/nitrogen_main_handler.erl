%% vim: ts=4 sw=4 et ft=erlang
%%
%% nitrogen_main_handler — Cowboy → Nitrogen request bridge.
%%
%% SECURITY (backend-030): crash handler selection is gated on dev_mode.
%% In production (dev_mode=false, the default), Nitrogen's default crash
%% handler returns a generic "Internal server error" page to the client
%% and logs details server-side only.
%% In dev mode (dev_mode=true), the debug_crash_handler is allowed, which
%% renders stack traces and internal state — useful for development but
%% must NEVER ship in a release.
%%
-module(nitrogen_main_handler).
-export([run/0, ws_init/0]).

handlers() ->
    case application:get_env(arkachat, dev_mode, false) of
        true ->
            %% Dev only: rich crash pages with stack traces for debugging.
            %% Never enable in production — exposes paths, args, and state.
            wf:set_header_handler(nitrogen_debug_crash_handler);
        false ->
            %% Production: generic error page; stack traces go to server logs only.
            ok  %% Nitrogen's default crash handler is already safe — no override needed.
    end.

ws_init() ->
    handlers().

run() ->
    handlers(),
    wf:header('cache-control', "no-cache, no-store, private, max-age=0"),
    wf_core:run().
