%% vim: ts=4 sw=4 et ft=erlang
%%
%% chat — 1-to-1 DM page with live Comet push.
%% URL: /chat?id=<contact_id>
%%
-module(chat).
-compile(export_all).
-include_lib("nitrogen_core/include/wf.hrl").

main() -> #template{file = "./priv/templates/app.html"}.

title() ->
    "ArkAChat \226\128\148 " ++ contact_name(contact_id()).

body() ->
    Id     = contact_id(),
    Name   = contact_name(Id),
    IsBot  = is_bot(Id),
    ConvId = conv_id(Id),
    wf:comet_global(fun() -> comet_loop(ConvId) end, ConvId),
    [
        #panel{class = "chat-header", body = [
            #link{url = "/chats", text = "\226\134\144 Back", class = "back-link"},
            #span{class = "chat-title", text = Name},
            case IsBot of
                true  -> #span{class = "bot-badge",    text = "Bot"};
                false -> #span{class = "shield-badge",  text = "\360\237\224\222"}
            end
        ]},
        #panel{id = messages, class = "messages-panel",
               body = render_messages(ConvId)},
        message_input(Id, IsBot)
    ].

message_input(ContactId, IsBot) ->
    Ph = case IsBot of
        true  -> "Send a command (e.g. /help)\226\128\166";
        false -> "Message (Shield-encrypted)\226\128\166"
    end,
    #panel{class = "input-bar", body = [
        #textbox{id = msg_input, class = "msg-input",
                 placeholder = Ph, next = send_btn},
        #button{id = send_btn, class = "btn-send", text = "Send",
                postback = {send, ContactId}}
    ]}.

render_messages(ConvId) ->
    Me   = me(),
    Msgs = shield_bridge:get_messages(ConvId),
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

%% ── Events ───────────────────────────────────────────────────────────────────

event({send, ContactId}) ->
    Text   = wf:q(msg_input),
    Me     = me(),
    ConvId = conv_id(ContactId),
    shield_bridge:store_message(ConvId, Me, Text),
    case is_bot(ContactId) of
        true ->
            case bot:send(ContactId, Me, Text) of
                noreply -> ok;
                Reply   -> shield_bridge:store_message(ConvId, ContactId, Reply)
            end;
        false -> ok
    end,
    wf:comet_global(fun() -> refresh end, ConvId),
    wf:set(msg_input, ""),
    wf:replace(messages, #panel{id = messages, class = "messages-panel",
                                body = render_messages(ConvId)});

event(_) -> ok.

%% ── Comet ─────────────────────────────────────────────────────────────────────

comet_loop(ConvId) ->
    receive
        refresh ->
            wf:replace(messages,
                #panel{id = messages, class = "messages-panel",
                       body = render_messages(ConvId)}),
            wf:flush(),
            comet_loop(ConvId);
        _ ->
            comet_loop(ConvId)
    end.

%% ── Helpers ──────────────────────────────────────────────────────────────────

contact_id() -> wf:q(id).

contact_name(Id) ->
    case [ maps:get(name, C)
           || C <- shield_bridge:get_contacts(),
              maps:get(id, C) =:= Id ] of
        [N|_] -> N;
        _     -> Id
    end.

is_bot(Id) ->
    case [ maps:get(type, C)
           || C <- shield_bridge:get_contacts(),
              maps:get(id, C) =:= Id ] of
        [bot|_] -> true;
        _        -> false
    end.

conv_id(ContactId) ->
    Me   = me(),
    Pair = lists:sort([Me, ContactId]),
    "dm_" ++ string:join(Pair, "_").

me() ->
    case wf:user() of
        undefined -> "guest";
        U         -> U
    end.

format_ts(Ts) ->
    {{_,_,_},{H,M,S}} = calendar:system_time_to_local_time(Ts, millisecond),
    io_lib:format("~2..0w:~2..0w:~2..0w", [H, M, S]).
