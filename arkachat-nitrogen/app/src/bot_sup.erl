%% vim: ts=4 sw=4 et ft=erlang
%%
%% bot_sup — supervisor for all registered bots.
%% Bots are defined in app config (arkachat, bots); new entries are picked up
%% at runtime via add_bot/2.
%%
-module(bot_sup).
-behaviour(supervisor).
-export([start_link/0, add_bot/2, remove_bot/1, list_bots/0]).
-export([init/1]).

start_link() ->
    supervisor:start_link({local, ?MODULE}, ?MODULE, []).

%% Start a new bot worker at runtime.
add_bot(BotId, Module) ->
    Child = bot_child_spec(BotId, Module),
    supervisor:start_child(?MODULE, Child).

%% Stop and remove a bot at runtime.
remove_bot(BotId) ->
    supervisor:terminate_child(?MODULE, BotId),
    supervisor:delete_child(?MODULE, BotId).

list_bots() ->
    [ Id || {Id, _, _, _} <- supervisor:which_children(?MODULE) ].

init([]) ->
    Bots     = application:get_env(arkachat, bots, []),
    Children = [ bot_child_spec(Id, Mod) || {Id, Mod} <- Bots ],
    BuiltIns = [
        bot_child_spec("bot-echo",   bot_echo),
        bot_child_spec("bot-status", bot_status)
    ],
    {ok, {{one_for_one, 5, 10}, BuiltIns ++ Children}}.

bot_child_spec(Id, Module) ->
    {Id, {bot, start_link, [Id, Module]},
     permanent, 5000, worker, [bot]}.
