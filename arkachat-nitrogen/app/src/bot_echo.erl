%% vim: ts=4 sw=4 et ft=erlang
%% Echo bot — mirrors every message back prefixed with "Echo: ".
-module(bot_echo).
-export([handle/3]).

handle(_BotId, _Sender, "/help") ->
    "Echo Bot: I repeat everything you say. Commands: /help";
handle(_BotId, _Sender, Text) ->
    "Echo: " ++ Text.
