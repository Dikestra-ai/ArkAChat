%% vim: ts=4 sw=4 et ft=erlang
%%
%% group — group chat page with member list panel.
%% URL: /group?id=<group_id>
%%
-module(group_page).
%% Export only the Nitrogen page entry points — never export_all on page
%% modules; it exposes every internal helper as a callable RPC target.
-export([main/0, title/0, body/0, event/1]).
-include_lib("nitrogen_core/include/wf.hrl").

main() -> #template{file = "./priv/templates/app.html"}.

title() ->
    %% The [[[page:title()]]] template slot inlines this string raw (it is
    %% not an element `text` attribute, so Nitrogen's default html_encode
    %% does not apply). Encode the user-controlled name explicitly to stop
    %% </title><script> breakouts.
    "ArkAChat \226\128\148 " ++ wf:html_encode(group_name(group_id())).

body() ->
    require_auth(),
    Id     = group_id(),
    Name   = group_name(Id),
    ConvId = "grp_" ++ Id,
    wf:comet_global(fun() -> comet_loop(ConvId) end, ConvId),
    [
        #panel{class = "chat-header", body = [
            #link{url = "/chats", text = "\226\134\144 Back", class = "back-link"},
            #span{class = "chat-title", text = Name},
            #span{class = "shield-badge", text = "\360\237\224\222 Group"},
            #button{text = "Members", class = "btn-members",
                    postback = toggle_members}
        ]},
        #panel{class = "group-layout", body = [
            #panel{id = messages, class = "messages-panel",
                   body = render_messages(ConvId)},
            #panel{id = member_panel, class = "member-panel",
                   body = render_members(Id)}
        ]},
        message_input(Id)
    ].

message_input(GroupId) ->
    #panel{class = "input-bar", body = [
        #textbox{id = msg_input, class = "msg-input",
                 placeholder = "Group message (Shield-encrypted)\226\128\166",
                 next = send_btn},
        #button{id = send_btn, class = "btn-send", text = "Send",
                postback = {send, GroupId}}
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

render_members(GroupId) ->
    Members  = shield_bridge:group_members(GroupId),
    Contacts = shield_bridge:get_contacts(),
    Items    = [ member_item(M, Contacts) || M <- Members ],
    [
        #h3{text = "Members"},
        #panel{class = "member-list", body = Items},
        #panel{class = "add-member", body = [
            #textbox{id = new_member_id, placeholder = "Contact ID\226\128\166"},
            #button{text = "Add", postback = {add_member, GroupId}}
        ]}
    ].

member_item(MemberId, Contacts) ->
    Name = case [ maps:get(name, C)
                  || C <- Contacts, maps:get(id, C) =:= MemberId ] of
        [N|_] -> N;
        _     -> MemberId
    end,
    #panel{class = "member-item", body = [
        #span{class = "chat-icon", text = "\360\237\221\244 "},
        #span{text = Name}
    ]}.

%% ── Events ───────────────────────────────────────────────────────────────────

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
    wf:replace(member_panel,
               #panel{id = member_panel, class = "member-panel",
                      body = render_members(GroupId)}),
    wf:set(new_member_id, "");

event(toggle_members) ->
    wf:wire("member_panel", #toggle{});

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

group_id() -> wf:q(id).

group_name(Id) ->
    case [ maps:get(name, G)
           || G <- shield_bridge:get_groups(),
              maps:get(id, G) =:= Id ] of
        [N|_] -> N;
        _     -> Id
    end.

%% require_auth/0 — partial auth guard (auth-006, partial fix).
%% Full auth model (session tokens, user scoping) is tracked in auth-003.
require_auth() ->
    case wf:user() of
        undefined -> wf:redirect("/login");
        _User     -> ok
    end.

me() ->
    case wf:user() of
        undefined -> "guest";
        U         -> U
    end.

format_ts(Ts) ->
    {{_,_,_},{H,M,S}} = calendar:system_time_to_local_time(Ts, millisecond),
    io_lib:format("~2..0w:~2..0w:~2..0w", [H, M, S]).
