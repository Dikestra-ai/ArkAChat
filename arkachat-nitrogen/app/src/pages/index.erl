%% vim: ts=4 sw=4 et ft=erlang
%% Redirect / → /chats
-module(index).
%% Export only the Nitrogen page entry points — never export_all on page
%% modules; it exposes every internal helper as a callable RPC target.
-export([main/0, title/0, body/0, event/1]).
-include_lib("nitrogen_core/include/wf.hrl").

main() ->
    wf:redirect("/chats"),
    #template{file = "./priv/templates/bare.html"}.

title() -> "ArkAChat".
body() -> [].
event(_) -> ok.
