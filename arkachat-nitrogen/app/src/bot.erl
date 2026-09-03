%% vim: ts=4 sw=4 et ft=erlang
%%
%% bot — generic bot gen_server.
%% Each bot runs as a named process {bot, BotId}.
%% Send a message: bot:send(BotId, Sender, Text) -> Reply | noreply
%%
-module(bot).
-behaviour(gen_server).
-export([start_link/2, send/3]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2,
         terminate/2, code_change/3]).

-record(state, {id :: string(), mod :: module()}).

%% bot_name/1 — map a BotId string to its registered process atom.
%%
%% SECURITY (backend-031): list_to_atom/1 allocates a new atom for every
%% unique string, and atoms are never garbage-collected. An attacker who can
%% supply an arbitrary BotId (e.g. via HTTP) could exhaust the atom table
%% (default limit: 1 048 576), crashing the node.
%%
%% During start_link/2 we must create the atom so we use list_to_atom there.
%% For the lookup path (send/3) we use list_to_existing_atom/1 so that only
%% atoms that were registered at startup can be used — any other string raises
%% badarg (caught below), preventing atom-table exhaustion.
bot_name_new(BotId) ->
    list_to_atom("bot_" ++ BotId).

bot_name_lookup(BotId) ->
    try list_to_existing_atom("bot_" ++ BotId)
    catch error:badarg -> undefined
    end.

start_link(BotId, Module) ->
    gen_server:start_link({local, bot_name_new(BotId)}, ?MODULE, {BotId, Module}, []).

%% Send a text from Sender to bot BotId. Returns the bot's reply string.
%% Returns {error, unknown_bot} if BotId does not correspond to a registered bot.
send(BotId, Sender, Text) ->
    case bot_name_lookup(BotId) of
        undefined ->
            {error, unknown_bot};
        Name ->
            gen_server:call(Name, {message, Sender, Text})
    end.

init({BotId, Module}) ->
    {ok, #state{id = BotId, mod = Module}}.

handle_call({message, Sender, Text}, _From, #state{mod = Mod} = S) ->
    Reply = Mod:handle(S#state.id, Sender, Text),
    %% Store the reply in shield_bridge so chat history works
    case Reply of
        noreply -> ok;
        ReplyText ->
            ConvId = "dm_" ++ S#state.id ++ "_" ++ Sender,
            shield_bridge:store_message(ConvId, S#state.id, ReplyText)
    end,
    {reply, Reply, S}.

handle_cast(_Msg, S) -> {noreply, S}.
handle_info(_Msg, S) -> {noreply, S}.
terminate(_Reason, _S) -> ok.
code_change(_Vsn, S, _Extra) -> {ok, S}.
