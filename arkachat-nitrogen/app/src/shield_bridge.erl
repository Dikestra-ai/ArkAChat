%% vim: ts=4 sw=4 et ft=erlang
%%
%% shield_bridge — Shield-compatible encrypted message store.
%%
%% Wire format matches Shield v2.x `quickEncrypt` exactly so ciphertexts
%% produced here are decryptable by the Android and Web Shield libraries
%% (and vice-versa).
%%
%% Shield quickEncrypt wire layout (VERSION_KEY mode, 0x13):
%%
%%   [ 0x13 | 0x01 | nonce(12) | AES-256-GCM( inner, aad=[0x13,0x01] ) ]
%%
%%   inner = timestamp_ms_le(8) || padLen(1) || padding(padLen) || plaintext
%%   AEAD key = HMAC-SHA256( masterKey, "shield/aead/v4" ++ [0x01] )[:32]
%%   padLen ∈ [32, 128]  (uniform)
%%   GCM tag (16 bytes) is appended by the AEAD — total overhead ≥ 59 bytes.
%%
%% Config (no hardcoding):
%%   $ARKACHAT_SHIELD_KEY  — 64-char hex string (256-bit master key)
%%   {arkachat, shield_key_hex}  — fallback in app.config
%%   Otherwise a per-node key is derived (dev only, not cross-platform).
%%
-module(shield_bridge).
-behaviour(gen_server).

-export([start_link/0]).
-export([encrypt/2, decrypt/2,
         store_message/3, get_messages/1,
         get_contacts/0, add_contact/2,
         get_groups/0,   add_group/2,
         group_members/1, add_group_member/2]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2,
         terminate/2, code_change/3]).

%% Shield wire-format constants (must match Shield.kt exactly)
-define(VERSION_KEY,   16#13).
-define(SUITE_AES_GCM, 16#01).
-define(AAD,           <<?VERSION_KEY, ?SUITE_AES_GCM>>).
-define(NONCE_SIZE,    12).
-define(TAG_SIZE,      16).
-define(INNER_TS_SIZE,  8).   %% timestamp: 8-byte little-endian int64
-define(INNER_HDR_SIZE, 9).   %% ts(8) + padLen(1)
-define(MIN_PAD,       32).
-define(MAX_PAD,       128).
-define(HKDF_INFO,     <<"shield/aead/v4">>).

%% ETS table names
-define(T_MSGS,     arkachat_msgs).
-define(T_CONTACTS, arkachat_contacts).
-define(T_GROUPS,   arkachat_groups).
-define(T_MEMBERS,  arkachat_members).

-record(state, {key :: binary()}).

%% ── Public API ────────────────────────────────────────────────────────────────

start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

encrypt(MasterKey, Plaintext) ->
    gen_server:call(?MODULE, {encrypt, MasterKey, Plaintext}).

decrypt(MasterKey, Blob) ->
    gen_server:call(?MODULE, {decrypt, MasterKey, Blob}).

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

%% ── gen_server callbacks ──────────────────────────────────────────────────────

init([]) ->
    Key = load_key(),
    ets:new(?T_MSGS,     [named_table, public, bag]),
    ets:new(?T_CONTACTS, [named_table, public, set]),
    ets:new(?T_GROUPS,   [named_table, public, set]),
    ets:new(?T_MEMBERS,  [named_table, public, bag]),
    %% Seed built-in bot contacts so the UI is non-empty on first run
    ets:insert(?T_CONTACTS, {"bot-echo",   "Echo Bot",   bot}),
    ets:insert(?T_CONTACTS, {"bot-status", "Status Bot", bot}),
    {ok, #state{key = Key}}.

handle_call({encrypt, MasterKey, Plaintext}, _From, S) ->
    {reply, shield_encrypt(MasterKey, Plaintext), S};

handle_call({decrypt, MasterKey, Blob}, _From, S) ->
    {reply, shield_decrypt(MasterKey, Blob), S};

handle_call({store_msg, ConvId, Sender, Text}, _From, #state{key = K} = S) ->
    Blob = shield_encrypt(K, unicode:characters_to_binary(Text)),
    Ts   = erlang:system_time(millisecond),
    ets:insert(?T_MSGS, {ConvId, Ts, Sender, Blob}),
    {reply, ok, S};

handle_call({get_msgs, ConvId}, _From, #state{key = K} = S) ->
    Rows = lists:sort(ets:lookup(?T_MSGS, ConvId)),
    Msgs = [ begin
                 Plain = shield_decrypt(K, Blob),
                 #{ts => Ts, sender => Sender,
                   text => unicode:characters_to_list(Plain)}
             end || {_, Ts, Sender, Blob} <- Rows ],
    {reply, Msgs, S};

handle_call(get_contacts, _From, S) ->
    Cs = [ #{id => Id, name => Name, type => Type}
           || {Id, Name, Type} <- ets:tab2list(?T_CONTACTS) ],
    {reply, Cs, S};

handle_call({add_contact, Id, Name}, _From, S) ->
    ets:insert(?T_CONTACTS, {Id, Name, human}),
    {reply, ok, S};

handle_call(get_groups, _From, S) ->
    Gs = [ #{id => Id, name => Name}
           || {Id, Name} <- ets:tab2list(?T_GROUPS) ],
    {reply, Gs, S};

handle_call({add_group, Id, Name}, _From, S) ->
    ets:insert(?T_GROUPS, {Id, Name}),
    {reply, ok, S};

handle_call({group_members, GroupId}, _From, S) ->
    Members = [ M || {G, M} <- ets:lookup(?T_MEMBERS, GroupId), G =:= GroupId ],
    {reply, Members, S};

handle_call({add_member, GroupId, ContactId}, _From, S) ->
    ets:insert(?T_MEMBERS, {GroupId, ContactId}),
    {reply, ok, S};

handle_call(_Req, _From, S) ->
    {reply, {error, unknown}, S}.

handle_cast(_Msg, S) -> {noreply, S}.
handle_info(_Msg, S) -> {noreply, S}.
terminate(_Reason, _S) -> ok.
code_change(_Vsn, S, _Extra) -> {ok, S}.

%% ── Shield wire format ────────────────────────────────────────────────────────
%%
%% These two functions implement Shield v2.x quickEncrypt / quickDecrypt in
%% Erlang so ciphertexts are cross-platform compatible with Android and Web.

%% Encrypt plaintext with masterKey using Shield's quickEncrypt wire format.
shield_encrypt(MasterKey, Plaintext) ->
    AeadKey = derive_aead_key(MasterKey),
    Nonce   = crypto:strong_rand_bytes(?NONCE_SIZE),
    TsMs    = erlang:system_time(millisecond),
    PadLen  = sample_pad_len(),
    Padding = crypto:strong_rand_bytes(PadLen),
    Inner   = build_inner(TsMs, PadLen, Padding, Plaintext),
    {Cipher, Tag} = crypto:crypto_one_time_aead(
                        aes_256_gcm, AeadKey, Nonce, Inner, ?AAD, true),
    %% Wire: AAD(2) || nonce(12) || cipher || tag(16)
    <<?AAD/binary, Nonce/binary, Cipher/binary, Tag/binary>>.

%% Decrypt a Shield-format ciphertext.  Returns error on auth failure.
shield_decrypt(MasterKey, <<?VERSION_KEY, ?SUITE_AES_GCM,
                             Nonce:?NONCE_SIZE/binary, Rest/binary>>) ->
    AeadKey  = derive_aead_key(MasterKey),
    TagStart = byte_size(Rest) - ?TAG_SIZE,
    if TagStart < 0 -> error;
       true ->
           <<Cipher:TagStart/binary, Tag:?TAG_SIZE/binary>> = Rest,
           case crypto:crypto_one_time_aead(
                    aes_256_gcm, AeadKey, Nonce, Cipher, ?AAD, Tag, false) of
               error -> error;
               Inner -> unpack_inner(Inner)
           end
    end;
shield_decrypt(_Key, _Bad) -> error.

%% ── Shield inner-layout helpers ───────────────────────────────────────────────

build_inner(TsMs, PadLen, Padding, Plaintext) ->
    TsBin = <<TsMs:64/little>>,
    <<TsBin/binary, PadLen:8, Padding/binary, Plaintext/binary>>.

unpack_inner(Inner) when byte_size(Inner) >= ?INNER_HDR_SIZE ->
    <<_TsBin:?INNER_TS_SIZE/binary, PadLen:8, Rest/binary>> = Inner,
    if PadLen < ?MIN_PAD orelse PadLen > ?MAX_PAD -> error;
       byte_size(Rest) < PadLen                   -> error;
       true ->
           <<_Padding:PadLen/binary, Plaintext/binary>> = Rest,
           Plaintext
    end;
unpack_inner(_) -> error.

%% Uniform random padLen in [MIN_PAD, MAX_PAD] — matches Shield's samplePadLen.
sample_pad_len() ->
    Range  = ?MAX_PAD - ?MIN_PAD + 1,
    <<V:32/unsigned>> = crypto:strong_rand_bytes(4),
    (V rem Range) + ?MIN_PAD.

%% ── AEAD key derivation (matches Shield.kt deriveAeadKey) ────────────────────
%%
%% aeadKey = HMAC-SHA256( masterKey, "shield/aead/v4" ++ [0x01] )[:32]
derive_aead_key(MasterKey) ->
    Info = <<?HKDF_INFO/binary, 1>>,
    crypto:mac(hmac, sha256, MasterKey, Info).

%% ── Key loading — never hardcoded ────────────────────────────────────────────

load_key() ->
    case os:getenv("ARKACHAT_SHIELD_KEY") of
        false ->
            case application:get_env(arkachat, shield_key_hex) of
                {ok, Hex} -> hex_to_bin(Hex);
                undefined  -> derive_dev_key()
            end;
        Hex ->
            hex_to_bin(Hex)
    end.

%% Dev-only: derive a per-node key. NOT cross-platform compatible.
%% In production always set $ARKACHAT_SHIELD_KEY.
derive_dev_key() ->
    NodeBin = atom_to_binary(node(), utf8),
    crypto:hash(sha256, <<"arkachat-dev-v1", NodeBin/binary>>).

hex_to_bin(Hex) when is_list(Hex) ->
    hex_to_bin(list_to_binary(Hex));
hex_to_bin(Hex) ->
    << <<(binary_to_integer(<<A,B>>, 16))>>
       || <<A,B>> <= Hex >>.
