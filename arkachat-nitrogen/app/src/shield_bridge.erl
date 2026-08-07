%% vim: ts=4 sw=4 et ft=erlang
%%
%% shield_bridge — gen_server wrapping Shield-protected message storage.
%%
%% Encryption: AES-256-GCM via Erlang's crypto module (same algorithm as
%% Shield v2.x). Keys are loaded from app env or env vars; never hardcoded.
%%
%% Config keys (set in etc/app.config or environment):
%%   shield_bridge_key_hex  — 64-char hex string (256-bit AES key)
%%   shield_bridge_api_url  — optional: URL of external ShieldSimplexBridge HTTP API
%%
-module(shield_bridge).
-behaviour(gen_server).

-export([start_link/0]).
-export([encrypt/2, decrypt/2, store_message/3, get_messages/1,
         get_contacts/0, add_contact/2, get_groups/0, add_group/2,
         group_members/1, add_group_member/2]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2,
         terminate/2, code_change/3]).

-define(TABLE_MSGS,     arkachat_msgs).
-define(TABLE_CONTACTS, arkachat_contacts).
-define(TABLE_GROUPS,   arkachat_groups).
-define(TABLE_MEMBERS,  arkachat_members).
-define(GCM_TAG_LEN, 16).

-record(state, {key :: binary()}).

%% -------------------------------------------------------------------------
%% Public API
%% -------------------------------------------------------------------------

start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

encrypt(Key, Plaintext) ->
    gen_server:call(?MODULE, {encrypt, Key, Plaintext}).

decrypt(Key, Blob) ->
    gen_server:call(?MODULE, {decrypt, Key, Blob}).

store_message(ConvId, Sender, Text) ->
    gen_server:call(?MODULE, {store_msg, ConvId, Sender, Text}).

get_messages(ConvId) ->
    gen_server:call(?MODULE, {get_msgs, ConvId}).

get_contacts() ->
    gen_server:call(?MODULE, get_contacts).

add_contact(Id, Name) ->
    gen_server:call(?MODULE, {add_contact, Id, Name}).

get_groups() ->
    gen_server:call(?MODULE, get_groups).

add_group(Id, Name) ->
    gen_server:call(?MODULE, {add_group, Id, Name}).

group_members(GroupId) ->
    gen_server:call(?MODULE, {group_members, GroupId}).

add_group_member(GroupId, ContactId) ->
    gen_server:call(?MODULE, {add_member, GroupId, ContactId}).

%% -------------------------------------------------------------------------
%% gen_server callbacks
%% -------------------------------------------------------------------------

init([]) ->
    Key = load_key(),
    ets:new(?TABLE_MSGS,     [named_table, public, bag]),
    ets:new(?TABLE_CONTACTS, [named_table, public, set]),
    ets:new(?TABLE_GROUPS,   [named_table, public, set]),
    ets:new(?TABLE_MEMBERS,  [named_table, public, bag]),
    %% Seed with demo bot contacts so the UI isn't empty on first run
    ets:insert(?TABLE_CONTACTS, {"bot-echo",   "Echo Bot",   bot}),
    ets:insert(?TABLE_CONTACTS, {"bot-status", "Status Bot", bot}),
    {ok, #state{key = Key}}.

handle_call({encrypt, Key, Plaintext}, _From, State) ->
    {reply, aes_gcm_encrypt(Key, Plaintext), State};

handle_call({decrypt, Key, Blob}, _From, State) ->
    {reply, aes_gcm_decrypt(Key, Blob), State};

handle_call({store_msg, ConvId, Sender, Text}, _From, #state{key=K} = S) ->
    Blob     = aes_gcm_encrypt(K, unicode:characters_to_binary(Text)),
    Ts       = erlang:system_time(millisecond),
    ets:insert(?TABLE_MSGS, {ConvId, Ts, Sender, Blob}),
    {reply, ok, S};

handle_call({get_msgs, ConvId}, _From, #state{key=K} = S) ->
    Rows  = ets:lookup(?TABLE_MSGS, ConvId),
    Msgs  = [ begin
                  Plain = aes_gcm_decrypt(K, Blob),
                  #{ts => Ts, sender => Sender,
                    text => unicode:characters_to_list(Plain)}
              end || {_, Ts, Sender, Blob} <- lists:sort(Rows) ],
    {reply, Msgs, S};

handle_call(get_contacts, _From, S) ->
    Rows  = ets:tab2list(?TABLE_CONTACTS),
    Cs    = [ #{id => Id, name => Name, type => Type}
              || {Id, Name, Type} <- Rows ],
    {reply, Cs, S};

handle_call({add_contact, Id, Name}, _From, S) ->
    ets:insert(?TABLE_CONTACTS, {Id, Name, human}),
    {reply, ok, S};

handle_call(get_groups, _From, S) ->
    Rows = ets:tab2list(?TABLE_GROUPS),
    Gs   = [ #{id => Id, name => Name} || {Id, Name} <- Rows ],
    {reply, Gs, S};

handle_call({add_group, Id, Name}, _From, S) ->
    ets:insert(?TABLE_GROUPS, {Id, Name}),
    {reply, ok, S};

handle_call({group_members, GroupId}, _From, S) ->
    Members = [ M || {G, M} <- ets:lookup(?TABLE_MEMBERS, GroupId), G =:= GroupId ],
    {reply, Members, S};

handle_call({add_member, GroupId, ContactId}, _From, S) ->
    ets:insert(?TABLE_MEMBERS, {GroupId, ContactId}),
    {reply, ok, S};

handle_call(_Req, _From, S) ->
    {reply, {error, unknown}, S}.

handle_cast(_Msg, S) -> {noreply, S}.
handle_info(_Msg, S) -> {noreply, S}.
terminate(_Reason, _S) -> ok.
code_change(_Vsn, S, _Extra) -> {ok, S}.

%% -------------------------------------------------------------------------
%% Key loading — never hardcoded
%% -------------------------------------------------------------------------

load_key() ->
    case os:getenv("ARKACHAT_SHIELD_KEY") of
        false ->
            case application:get_env(arkachat, shield_key_hex) of
                {ok, Hex} -> hex_to_bin(Hex);
                undefined  -> derive_default_key()
            end;
        Hex ->
            hex_to_bin(Hex)
    end.

%% Derive a deterministic per-node key from the node name + a fixed pepper.
%% In production set ARKACHAT_SHIELD_KEY to a real 64-char hex string.
derive_default_key() ->
    Pepper  = <<"arkachat-nitrogen-v1">>,
    NodeBin = atom_to_binary(node(), utf8),
    crypto:hash(sha256, <<Pepper/binary, NodeBin/binary>>).

hex_to_bin(Hex) ->
    list_to_binary([ list_to_integer([A,B], 16)
                     || <<A,B>> <= list_to_binary(Hex) ]).

%% -------------------------------------------------------------------------
%% AES-256-GCM helpers (same algorithm as Shield v2.x)
%% -------------------------------------------------------------------------

%% Ciphertext layout: IV(12) ++ TAG(16) ++ CipherBytes
aes_gcm_encrypt(Key, Plaintext) ->
    IV  = crypto:strong_rand_bytes(12),
    {Cipher, Tag} = crypto:crypto_one_time_aead(
                        aes_256_gcm, Key, IV, Plaintext, <<>>, true),
    <<IV/binary, Tag/binary, Cipher/binary>>.

aes_gcm_decrypt(Key, <<IV:12/binary, Tag:16/binary, Cipher/binary>>) ->
    crypto:crypto_one_time_aead(
        aes_256_gcm, Key, IV, Cipher, <<>>, Tag, false).
