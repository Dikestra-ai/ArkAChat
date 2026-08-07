%% vim: ts=4 sw=4 et ft=erlang
%%
%% chats — unified conversation list (Telegram-like main screen).
%% Shows DMs, groups, and bot contacts in one sorted list.
%%
-module(chats).
-compile(export_all).
-include_lib("nitrogen_core/include/wf.hrl").

main() -> #template{file = "./priv/templates/app.html"}.

title() -> "ArkAChat".

body() ->
    [
        %% ── Sidebar ──────────────────────────────────────────────────────
        #panel{class = "sidebar", body = [
            sidebar_header(),
            search_box(),
            chat_list()
        ]},

        %% ── Main area (welcome until a chat is selected) ─────────────────
        #panel{id = main_panel, class = "main-panel", body = welcome_panel()}
    ].

%% ── Sidebar header with ArkAChat logo + New-chat button ──────────────────
sidebar_header() ->
    #panel{class = "sidebar-header", body = [
        #span{class = "logo-text", text = "ArkAChat"},
        #span{class = "shield-badge", text = "🔒 Shield"},
        #button{class = "btn-new-chat", text = "+",
                postback = new_chat_dialog,
                title = "New chat / group"}
    ]}.

search_box() ->
    #textbox{id = search_box, class = "search-box",
             placeholder = "Search conversations…",
             next = search_box,
             postback = {search, search_box}}.

%% ── Render DMs + groups merged and sorted by name ────────────────────────
chat_list() ->
    Contacts = shield_bridge:get_contacts(),
    Groups   = shield_bridge:get_groups(),
    DmItems  = [ chat_item(dm,    C)  || C <- Contacts ],
    GrpItems = [ chat_item(group, G)  || G <- Groups   ],
    #panel{class = "chat-list", body = DmItems ++ GrpItems}.

chat_item(dm, #{id := Id, name := Name, type := Type}) ->
    {Icon, Extra} = case Type of
        bot   -> {"🤖 ", "bot-badge"};
        human -> {"👤 ", ""}
    end,
    #panel{class = "chat-item " ++ Extra,
           click = {open_chat, dm, Id},
           postback = {open_chat, dm, Id},
           body = [
               #span{class = "chat-icon",  text = Icon},
               #span{class = "chat-name",  text = Name},
               #span{class = "chat-sub",   text = "Tap to chat"}
           ]};

chat_item(group, #{id := Id, name := Name}) ->
    #panel{class = "chat-item group-item",
           postback = {open_chat, group, Id},
           body = [
               #span{class = "chat-icon",  text = "👥 "},
               #span{class = "chat-name",  text = Name},
               #span{class = "chat-sub",   text = "Group"}
           ]}.

welcome_panel() ->
    #panel{class = "welcome-panel", body = [
        #h2{text = "Welcome to ArkAChat"},
        #p{text = "Select a conversation from the sidebar, or start a new one."},
        #p{body = #span{class = "shield-info",
            text = "All messages are Shield-encrypted (AES-256-GCM)"}}
    ]}.

%% ── Events ───────────────────────────────────────────────────────────────

event({open_chat, dm, ContactId}) ->
    wf:redirect("/chat?id=" ++ ContactId);

event({open_chat, group, GroupId}) ->
    wf:redirect("/group?id=" ++ GroupId);

event(new_chat_dialog) ->
    wf:wire(#dialog{
        title = "New Conversation",
        body  = new_chat_form(),
        buttons = [
            #button{text = "Start DM",    postback = {create_dm}},
            #button{text = "Create Group", postback = {create_group}}
        ]
    });

event({create_dm}) ->
    Name = wf:q(new_chat_name),
    Id   = "dm_" ++ integer_to_list(erlang:unique_integer([positive])),
    shield_bridge:add_contact(Id, Name),
    wf:replace(chat_list, chat_list()),
    wf:wire(#hide{target = dialog});

event({create_group}) ->
    Name = wf:q(new_chat_name),
    Id   = "grp_" ++ integer_to_list(erlang:unique_integer([positive])),
    shield_bridge:add_group(Id, Name),
    wf:replace(chat_list, chat_list()),
    wf:wire(#hide{target = dialog});

event({search, _}) ->
    Query = string:to_lower(wf:q(search_box)),
    All   = shield_bridge:get_contacts() ++ shield_bridge:get_groups(),
    Filtered = lists:filter(
        fun(#{name := N}) -> string:str(string:to_lower(N), Query) > 0 end,
        All),
    Items = [ chat_item(type_of(C), C) || C <- Filtered ],
    wf:replace(chat_list, #panel{class = "chat-list", body = Items});

event(_) -> ok.

type_of(#{type := _}) -> dm;
type_of(_)            -> group.

new_chat_form() ->
    #panel{body = [
        #label{text = "Name:"},
        #textbox{id = new_chat_name, placeholder = "Contact or group name…"}
    ]}.
