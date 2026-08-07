%% vim: ts=4 sw=4 et ft=erlang
-module(arkachat_app).
-behaviour(application).
-export([start/2, stop/1]).

start(_StartType, _StartArgs) ->
    arkachat_sup:start_link().

stop(_State) ->
    ok.
