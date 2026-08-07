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

        %% ── Main welcome area ─────────────────────────────────────────────
        #panel{id = main_panel, class = "main-panel", body = welcome_panel()},

        %% ── Hidden new-chat form (toggled by button) ──────────────────────
        new_chat_modal()
    ].

sidebar_header() ->
    #panel{class = "sidebar-header", body = [
        #span{class = "logo-text", text = "ArkAChat"},
        #span{class = "shield-badge", text = "Shield"},
        #link{text = "+", class = "btn-new-chat",
              title = "New chat / group",
              postback = show_new_chat}
    ]}.

search_box() ->
    #textbox{id = search_box, class = "search-box",
             placeholder = "Search conversations\226\128\166",
             next = search_box,
             postback = {search, search_box}}.

chat_list() ->
    Contacts = shield_bridge:get_contacts(),
    Groups   = shield_bridge:get_groups(),
    DmItems  = [ chat_item(dm,    C) || C <- Contacts ],
    GrpItems = [ chat_item(group, G) || G <- Groups   ],
    #panel{id = chat_list, class = "chat-list", body = DmItems ++ GrpItems}.

chat_item(dm, #{id := Id, name := Name, type := Type}) ->
    {Icon, Extra} = case Type of
        bot   -> {"\360\237\244\226 ", " bot-item"};
        human -> {"\360\237\221\244 ", ""}
    end,
    #link{url = "/chat?id=" ++ Id,
          class = "chat-item" ++ Extra,
          body = [
              #span{class = "chat-icon", text = Icon},
              #span{class = "chat-name", text = Name},
              #span{class = "chat-sub",  text = "Tap to chat"}
          ]};

chat_item(group, #{id := Id, name := Name}) ->
    #link{url = "/group_page?id=" ++ Id,
          class = "chat-item group-item",
          body = [
              #span{class = "chat-icon", text = "\360\237\221\245 "},
              #span{class = "chat-name", text = Name},
              #span{class = "chat-sub",  text = "Group"}
          ]}.

welcome_panel() ->
    #panel{class = "welcome-panel", body = [
        #h2{text = "Welcome to ArkAChat"},
        #p{text = "Select a conversation from the sidebar."},
        #p{body = #span{class = "shield-info",
               text = "All messages are Shield-encrypted (AES-256-GCM)"}}
    ]}.

new_chat_modal() ->
    #panel{id = new_chat_modal, class = "modal hidden", body = [
        #panel{class = "modal-box", body = [
            #h3{text = "New Conversation"},
            #label{text = "Name:"},
            #textbox{id = new_chat_name, placeholder = "Contact or group name\226\128\166"},
            #panel{class = "modal-actions", body = [
                #button{text = "Start DM",     postback = create_dm},
                #button{text = "Create Group", postback = create_group},
                #button{text = "Cancel",       postback = hide_new_chat,
                        class = "btn-cancel"}
            ]}
        ]}
    ]}.

%% ── Events ───────────────────────────────────────────────────────────────────

event(show_new_chat) ->
    wf:wire("new_chat_modal", #remove_class{class = "hidden"}),
    wf:wire("new_chat_modal", #add_class{class    = "visible"});

event(hide_new_chat) ->
    wf:wire("new_chat_modal", #add_class{class    = "hidden"}),
    wf:wire("new_chat_modal", #remove_class{class = "visible"});

event(create_dm) ->
    Name = wf:q(new_chat_name),
    Id   = "dm_" ++ integer_to_list(erlang:unique_integer([positive])),
    ok   = shield_bridge:add_contact(Id, Name),
    wf:replace(chat_list, chat_list()),
    event(hide_new_chat);

event(create_group) ->
    Name = wf:q(new_chat_name),
    Id   = "grp_" ++ integer_to_list(erlang:unique_integer([positive])),
    ok   = shield_bridge:add_group(Id, Name),
    wf:replace(chat_list, chat_list()),
    event(hide_new_chat);

event({search, _}) ->
    Query    = string:to_lower(wf:q(search_box)),
    Contacts = shield_bridge:get_contacts(),
    Groups   = shield_bridge:get_groups(),
    FC = [ chat_item(dm,    C) || C <- Contacts,
           string:str(string:to_lower(maps:get(name, C)), Query) > 0 ],
    FG = [ chat_item(group, G) || G <- Groups,
           string:str(string:to_lower(maps:get(name, G)), Query) > 0 ],
    wf:replace(chat_list, #panel{id = chat_list, class = "chat-list",
                                  body = FC ++ FG});

event(_) -> ok.
