%% vim: ts=4 sw=4 et ft=erlang
%% Redirect / → /chats
-module(index).
-compile(export_all).
-include_lib("nitrogen_core/include/wf.hrl").

main() ->
    wf:redirect("/chats"),
    #template{file = "./priv/templates/bare.html"}.

title() -> "ArkAChat".
body() -> [].
event(_) -> ok.
