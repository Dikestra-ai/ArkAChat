%% vim: ts=4 sw=4 et ft=erlang
%% Status bot — reports system info on /status, /uptime, /nodes.
%%
%% SECURITY: node names are deliberately never disclosed here. A node name
%% identifies the Erlang distribution endpoint, which is a remote-code-
%% execution surface; leaking it to unauthenticated chat users aids attack.
-module(bot_status).
-export([handle/3]).

handle(_BotId, _Sender, "/status") ->
    Mem = erlang:memory(total),
    io_lib:format("Memory: ~.1f MB | Procs: ~w",
        [Mem / 1048576, erlang:system_info(process_count)]);
handle(_BotId, _Sender, "/uptime") ->
    {Uptime, _} = erlang:statistics(wall_clock),
    Secs = Uptime div 1000,
    io_lib:format("Uptime: ~w d ~w h ~w m ~w s",
        [Secs div 86400, (Secs rem 86400) div 3600,
         (Secs rem 3600) div 60, Secs rem 60]);
handle(_BotId, _Sender, "/nodes") ->
    %% Report only the cluster size, never node names.
    io_lib:format("Connected nodes: ~w", [length(nodes()) + 1]);
handle(_BotId, _Sender, "/help") ->
    "Status Bot commands: /status /uptime /nodes";
handle(_BotId, _Sender, _Text) ->
    "Unknown command. Try /help".
