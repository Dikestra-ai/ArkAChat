%% vim: ts=4 sw=4 et ft=erlang
%% Status bot — reports system info on /status, /uptime, /nodes.
-module(bot_status).
-export([handle/3]).

handle(_BotId, _Sender, "/status") ->
    Mem = erlang:memory(total),
    io_lib:format("Node: ~s | Memory: ~.1f MB | Procs: ~w",
        [node(), Mem / 1048576, erlang:system_info(process_count)]);
handle(_BotId, _Sender, "/uptime") ->
    {Uptime, _} = erlang:statistics(wall_clock),
    Secs = Uptime div 1000,
    io_lib:format("Uptime: ~w d ~w h ~w m ~w s",
        [Secs div 86400, (Secs rem 86400) div 3600,
         (Secs rem 3600) div 60, Secs rem 60]);
handle(_BotId, _Sender, "/nodes") ->
    Nodes = [node() | nodes()],
    "Nodes: " ++ string:join([atom_to_list(N) || N <- Nodes], ", ");
handle(_BotId, _Sender, "/help") ->
    "Status Bot commands: /status /uptime /nodes";
handle(_BotId, _Sender, _Text) ->
    "Unknown command. Try /help".
