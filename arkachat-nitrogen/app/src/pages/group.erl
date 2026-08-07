%% vim: ts=4 sw=4 et ft=erlang
%%
%% group — group chat page with member list panel.
%% URL: /group?id=<group_id>
%%
-module(group).
-compile(export_all).
-include_lib("nitrogen_core/include/wf.hrl").

main() -> #template{file = "./priv/templates/app.html"}.

title() ->
    Id   = group_id(),
    Name = group_name(Id),
    "ArkAChat — " ++ Name.

body() ->
    Id     = group_id(),
    Name   = group_name(Id),
    ConvId = "grp_" ++ Id,
    wf:comet_global(fun() -> comet_loop(ConvId) end, ConvId),
    [
        #panel{class = "chat-header", body = [
            #link{text = "← Back", url = "/chats", class = "back-link"},
            #span{class = "chat-title", text = Name},
            #span{class = "shield-badge", text = "🔒 Group"},
            #button{text = "Members", class = "btn-members",
                    postback = toggle_members}
        ]},

        #panel{class = "group-layout", body = [
            %% Messages pane
            #panel{id = messages, class = "messages-panel",
                   body = render_messages(ConvId)},
            %% Member sidebar (collapsible)
            #panel{id = member_panel, class = "member-panel",
                   body = render_members(Id)}
        ]},

        message_input(Id)
    ].

message_input(GroupId) ->
    #panel{class = "input-bar", body = [
        #textbox{id = msg_input, class = "msg-input",
                 placeholder = "Group message (Shield-encrypted)…",
                 next = send_btn},
        #button{id = send_btn, class = "btn-send", text = "Send",
                postback = {send, GroupId}}
    ]}.

render_messages(ConvId) ->
    Msgs = shield_bridge:get_messages(ConvId),
    Me   = me(),
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

render_members(GroupId) ->
    Members = shield_bridge:group_members(GroupId),
    Contacts = shield_bridge:get_contacts(),
    Items = [ member_item(M, Contacts) || M <- Members ],
    [
        #h3{text = "Members"},
        #panel{class = "member-list", body = Items},
        #panel{class = "add-member", body = [
            #textbox{id = new_member_id, placeholder = "Contact ID…"},
            #button{text = "Add", postback = {add_member, GroupId}}
        ]}
    ].

member_item(MemberId, Contacts) ->
    Name = case lists:filter(fun(#{id := Id}) -> Id =:= MemberId end, Contacts) of
        [#{name := N} | _] -> N;
        _                  -> MemberId
    end,
    #panel{class = "member-item", body = [
        #span{class = "chat-icon", text = "👤 "},
        #span{text = Name}
    ]}.

%% ── Events ────────────────────────────────────────────────────────────────

event({send, GroupId}) ->
    Text   = wf:q(msg_input),
    Me     = me(),
    ConvId = "grp_" ++ GroupId,
    shield_bridge:store_message(ConvId, Me, Text),
    wf:comet_global(fun() -> refresh end, ConvId),
    wf:set(msg_input, ""),
    wf:replace(messages, #panel{id = messages, class = "messages-panel",
                                body = render_messages(ConvId)});

event({add_member, GroupId}) ->
    ContactId = wf:q(new_member_id),
    shield_bridge:add_group_member(GroupId, ContactId),
    wf:replace(member_panel, #panel{id = member_panel, class = "member-panel",
                                    body = render_members(GroupId)}),
    wf:set(new_member_id, "");

event(toggle_members) ->
    wf:wire(#toggle{target = member_panel});

event(_) -> ok.

%% ── Comet ────────────────────────────────────────────────────────────────

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

group_id() -> wf:q(id).

group_name(Id) ->
    Groups = shield_bridge:get_groups(),
    case lists:filter(fun(#{id := GId}) -> GId =:= Id end, Groups) of
        [#{name := N} | _] -> N;
        _                  -> Id
    end.

me() ->
    case wf:user() of
        undefined -> "guest";
        U         -> U
    end.

format_ts(Ts) ->
    {{_, _, _}, {H, M, S}} = calendar:system_time_to_local_time(Ts, millisecond),
    io_lib:format("~2..0w:~2..0w:~2..0w", [H, M, S]).
