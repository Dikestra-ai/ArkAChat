%% vim: ts=4 sw=4 et ft=erlang
%%
%% bot_tests — EUnit tests for bot modules and the bot gen_server.
%%
%% Covers:
%%   - bot_echo: /help, arbitrary text, empty string
%%   - bot_status: /help, /status, /uptime, /nodes, unknown command
%%   - bot gen_server: start, send, reply stored in shield_bridge
%%   - bot_sup: list, add, remove bots at runtime
%%
-module(bot_tests).
-include_lib("eunit/include/eunit.hrl").

kill_wait(Pid) ->
    MRef = monitor(process, Pid),
    exit(Pid, kill),
    receive {'DOWN', MRef, process, Pid, _} -> ok
    after 2000 -> ok
    end.

%% ── bot_echo (pure function tests, no process needed) ────────────────────────

bot_echo_test_() ->
    [
        ?_assertEqual("Echo: hello",
            bot_echo:handle("bot-echo", "user", "hello")),
        ?_assertEqual("Echo: ",
            bot_echo:handle("bot-echo", "user", "")),
        ?_assertMatch("Echo Bot" ++ _,
            bot_echo:handle("bot-echo", "user", "/help")),
        ?_assertEqual("Echo: /unknown",
            bot_echo:handle("bot-echo", "user", "/unknown"))
    ].

%% ── bot_status (pure function tests) ─────────────────────────────────────────

bot_status_test_() ->
    [
        ?_assertMatch("Status Bot" ++ _,
            bot_status:handle("bot-status", "user", "/help")),
        ?_assertMatch("Node: " ++ _,
            bot_status:handle("bot-status", "user", "/status")),
        ?_assertMatch("Uptime: " ++ _,
            bot_status:handle("bot-status", "user", "/uptime")),
        ?_assertMatch("Nodes: " ++ _,
            bot_status:handle("bot-status", "user", "/nodes")),
        ?_assertMatch("Unknown command" ++ _,
            bot_status:handle("bot-status", "user", "/nope"))
    ].

%% ── bot gen_server + shield_bridge integration ────────────────────────────────

bot_genserver_test_() ->
    {setup,
     fun() ->
         application:ensure_all_started(crypto),
         {ok, BridgePid} = shield_bridge:start_link(),
         {ok, BotPid}    = bot:start_link("test-echo", bot_echo),
         {BridgePid, BotPid}
     end,
     fun({BridgePid, BotPid}) ->
         unlink(BotPid),    kill_wait(BotPid),
         unlink(BridgePid), kill_wait(BridgePid),
         catch ets:delete(arkachat_msgs),
         catch ets:delete(arkachat_contacts),
         catch ets:delete(arkachat_groups),
         catch ets:delete(arkachat_members)
     end,
     [
         fun test_bot_reply/0,
         fun test_bot_stores_reply_in_bridge/0,
         fun test_bot_help/0
     ]}.

test_bot_reply() ->
    Reply = bot:send("test-echo", "alice", "ping"),
    ?assertEqual("Echo: ping", Reply).

test_bot_stores_reply_in_bridge() ->
    bot:send("test-echo", "alice", "stored?"),
    ConvId = "dm_test-echo_alice",
    Msgs   = shield_bridge:get_messages(ConvId),
    Texts  = [ maps:get(text, M) || M <- Msgs ],
    ?assert(lists:member("Echo: stored?", Texts)).

test_bot_help() ->
    Reply = bot:send("test-echo", "alice", "/help"),
    ?assertMatch("Echo Bot" ++ _, Reply).

%% ── bot_sup runtime management ────────────────────────────────────────────────

bot_sup_test_() ->
    {setup,
     fun() ->
         application:ensure_all_started(crypto),
         {ok, BridgePid} = shield_bridge:start_link(),
         {ok, SupPid}    = bot_sup:start_link(),
         {BridgePid, SupPid}
     end,
     fun({BridgePid, SupPid}) ->
         unlink(SupPid),    kill_wait(SupPid),
         unlink(BridgePid), kill_wait(BridgePid),
         catch ets:delete(arkachat_msgs),
         catch ets:delete(arkachat_contacts),
         catch ets:delete(arkachat_groups),
         catch ets:delete(arkachat_members)
     end,
     [
         fun test_sup_lists_builtins/0,
         fun test_sup_add_remove_bot/0
     ]}.

test_sup_lists_builtins() ->
    Bots = bot_sup:list_bots(),
    ?assert(lists:member("bot-echo",   Bots)),
    ?assert(lists:member("bot-status", Bots)).

test_sup_add_remove_bot() ->
    {ok, _} = bot_sup:add_bot("runtime-echo", bot_echo),
    ?assert(lists:member("runtime-echo", bot_sup:list_bots())),
    %% Sending a message works after dynamic registration
    Reply = bot:send("runtime-echo", "tester", "hi"),
    ?assertEqual("Echo: hi", Reply),
    ok = bot_sup:remove_bot("runtime-echo"),
    ?assertNot(lists:member("runtime-echo", bot_sup:list_bots())).
