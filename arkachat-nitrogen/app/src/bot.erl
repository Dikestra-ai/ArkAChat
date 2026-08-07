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

start_link(BotId, Module) ->
    gen_server:start_link({local, {bot, BotId}}, ?MODULE, {BotId, Module}, []).

%% Send a text from Sender to bot BotId. Returns the bot's reply string.
send(BotId, Sender, Text) ->
    gen_server:call({bot, BotId}, {message, Sender, Text}).

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
