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

    %% SECURITY (deployment-006): only start the sync hot-reloader in dev mode.
    %% sync watches source directories and hot-loads changed .beam files at
    %% runtime — in production that turns any file-write into code execution.
    %% dev_mode defaults to false so it is never active in a release build.
    case application:get_env(arkachat, dev_mode, false) of
        true  -> application:ensure_all_started(sync);
        false -> ok
    end,

    Children = [
        {shield_bridge, {shield_bridge, start_link, []},
            permanent, 5000, worker, [shield_bridge]},
        {bot_sup, {bot_sup, start_link, []},
            permanent, 5000, supervisor, [bot_sup]}
    ],
    {ok, {{one_for_one, 5, 10}, Children}}.
