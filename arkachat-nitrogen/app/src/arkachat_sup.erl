%% vim: ts=4 sw=4 et ft=erlang
-module(arkachat_sup).
-behaviour(supervisor).
-export([start_link/0, init/1]).

start_link() ->
    supervisor:start_link({local, ?MODULE}, ?MODULE, []).

init([]) ->
    application:ensure_all_started(nitrogen_core),
    application:ensure_all_started(nitro_cache),
    application:ensure_all_started(crypto),
    application:ensure_all_started(nprocreg),
    application:ensure_all_started(simple_bridge),

    Children = [
        {shield_bridge, {shield_bridge, start_link, []},
            permanent, 5000, worker, [shield_bridge]},
        {bot_sup, {bot_sup, start_link, []},
            permanent, 5000, supervisor, [bot_sup]}
    ],
    {ok, {{one_for_one, 5, 10}, Children}}.
