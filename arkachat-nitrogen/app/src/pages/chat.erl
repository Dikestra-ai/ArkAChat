%% vim: ts=4 sw=4 et ft=erlang
%%
%% chat — 1-to-1 DM page with live WebSocket updates.
%% URL: /chat?id=<contact_id>
%%
-module(chat).
-compile(export_all).
-include_lib("nitrogen_core/include/wf.hrl").

main() -> #template{file = "./priv/templates/app.html"}.

title() ->
    Id   = contact_id(),
    Name = contact_name(Id),
    "ArkAChat — " ++ Name.

body() ->
    Id      = contact_id(),
    Name    = contact_name(Id),
    IsBot   = is_bot(Id),
    ConvId  = conv_id(Id),
    %% Subscribe this Nitrogen process to the conversation channel
    wf:comet_global(fun() -> comet_loop(ConvId) end, ConvId),
    [
        #panel{class = "chat-header", body = [
            #link{text = "← Back", url = "/chats", class = "back-link"},
            #span{class = "chat-title", text = Name},
            case IsBot of
                true  -> #span{class = "bot-badge", text = "Bot"};
                false -> #span{class = "shield-badge", text = "🔒"}
            end
        ]},
        #panel{id = messages, class = "messages-panel",
               body = render_messages(ConvId)},
        message_input(Id, IsBot)
    ].

%% ── Input bar ─────────────────────────────────────────────────────────────

message_input(ContactId, IsBot) ->
    Placeholder = case IsBot of
        true  -> "Send a command (e.g. /help)…";
        false -> "Message (Shield-encrypted)…"
    end,
    #panel{class = "input-bar", body = [
        #textbox{id = msg_input, class = "msg-input",
                 placeholder = Placeholder,
                 next = send_btn},
        #button{id = send_btn, class = "btn-send", text = "Send",
                postback = {send, ContactId}}
    ]}.

%% ── Render message history ────────────────────────────────────────────────

render_messages(ConvId) ->
    Msgs = shield_bridge:get_messages(ConvId),
    Me   = wf:user(),
    [ message_bubble(M, Me) || M <- Msgs ].

message_bubble(#{sender := Sender, text := Text, ts := Ts}, Me) ->
    Class = case Sender of
        Me -> "bubble bubble-me";
        _  -> "bubble bubble-them"
    end,
    #panel{class = Class, body = [
        #span{class = "bubble-sender", text = Sender},
        #span{class = "bubble-text",   text = Text},
        #span{class = "bubble-ts",     text = format_ts(Ts)}
    ]}.

%% ── Events ────────────────────────────────────────────────────────────────

event({send, ContactId}) ->
    Text   = wf:q(msg_input),
    Me     = me(),
    ConvId = conv_id(ContactId),
    %% Store encrypted in shield_bridge
    shield_bridge:store_message(ConvId, Me, Text),
    %% If talking to a bot, get its reply and store too
    case is_bot(ContactId) of
        true ->
            Reply = bot:send(ContactId, Me, Text),
            case Reply of
                noreply -> ok;
                R -> shield_bridge:store_message(ConvId, ContactId, R)
            end;
        false -> ok
    end,
    %% Broadcast refresh to all subscribers of this conversation
    wf:comet_global(fun() -> refresh end, ConvId),
    wf:set(msg_input, ""),
    wf:replace(messages, #panel{id = messages, class = "messages-panel",
                                body = render_messages(ConvId)});

event(_) -> ok.

%% ── Comet loop (pushes refreshes to all connected browsers) ───────────────

comet_loop(ConvId) ->
    receive
        refresh ->
            wf:replace(messages, #panel{id = messages, class = "messages-panel",
                                        body = render_messages(ConvId)}),
            wf:flush(),
            comet_loop(ConvId);
        _ ->
            comet_loop(ConvId)
    end.

%% ── Helpers ───────────────────────────────────────────────────────────────

contact_id() ->
    wf:q(id).

contact_name(Id) ->
    Contacts = shield_bridge:get_contacts(),
    case lists:filter(fun(#{id := CId}) -> CId =:= Id end, Contacts) of
        [#{name := N} | _] -> N;
        _                  -> Id
    end.

is_bot(Id) ->
    Contacts = shield_bridge:get_contacts(),
    case lists:filter(fun(#{id := CId}) -> CId =:= Id end, Contacts) of
        [#{type := bot} | _] -> true;
        _                    -> false
    end.

conv_id(ContactId) ->
    Me = me(),
    %% Deterministic conversation key: sorted pair
    Pair = lists:sort([Me, ContactId]),
    "dm_" ++ string:join(Pair, "_").

me() ->
    case wf:user() of
        undefined -> "guest";
        U         -> U
    end.

format_ts(Ts) ->
    {{_, _, _}, {H, M, S}} = calendar:system_time_to_local_time(Ts, millisecond),
    io_lib:format("~2..0w:~2..0w:~2..0w", [H, M, S]).
