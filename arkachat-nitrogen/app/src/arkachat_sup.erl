%% vim: ts=4 sw=4 et ft=erlang
-module(arkachat_sup).
-behaviour(supervisor).
-export([start_link/0, init/1]).

start_link() ->
    supervisor:start_link({local, ?MODULE}, ?MODULE, []).

init([]) ->
    application:ensure_all_started(nitrogen_core),
    application:ensure_all_started(nitro_cache),
    application:ensure_all_started(crypto),
    application:ensure_all_started(nprocreg),

    %% SECURITY (backend-022): inject TLS options before simple_bridge starts.
    %% If ARKACHAT_TLS_CERT + ARKACHAT_TLS_KEY are set, enable HTTPS.
    %% If not set, the server binds to 127.0.0.1 only (see simple_bridge.config)
    %% and TLS termination must be handled by a reverse proxy.
    maybe_enable_tls(),
    maybe_override_bind(),

    application:ensure_all_started(simple_bridge),

    %% SECURITY (deployment-006): only start the sync hot-reloader in dev mode.
    %% sync watches source directories and hot-loads changed .beam files at
    %% runtime — in production that turns any file-write into code execution.
    %% dev_mode defaults to false so it is never active in a release build.
    case application:get_env(arkachat, dev_mode, false) of
        true  -> application:ensure_all_started(sync);
        false -> ok
    end,

    Children = [
        {shield_bridge, {shield_bridge, start_link, []},
            permanent, 5000, worker, [shield_bridge]},
        {bot_sup, {bot_sup, start_link, []},
            permanent, 5000, supervisor, [bot_sup]}
    ],
    {ok, {{one_for_one, 5, 10}, Children}}.

%% ── TLS helpers ───────────────────────────────────────────────────────────────

%% Inject ssl_opts + change port to 8443 when the operator has provided certs.
maybe_enable_tls() ->
    CertFile = os:getenv("ARKACHAT_TLS_CERT"),
    KeyFile  = os:getenv("ARKACHAT_TLS_KEY"),
    case {CertFile, KeyFile} of
        {false, _}    -> ok;
        {_, false}    -> ok;
        {Cert, Key}   ->
            SslOpts0 = [{certfile, Cert}, {keyfile, Key},
                        {secure_renegotiate, true},
                        {versions, ['tlsv1.2', 'tlsv1.3']},
                        {ciphers, tls_ciphers()}],
            SslOpts = case os:getenv("ARKACHAT_TLS_CA") of
                false -> SslOpts0;
                CA    -> [{cacertfile, CA} | SslOpts0]
            end,
            application:set_env(simple_bridge, ssl_opts, SslOpts),
            %% Only change the port if the operator has not already set it.
            case application:get_env(simple_bridge, port) of
                {ok, 8000} -> application:set_env(simple_bridge, port, 8443);
                _          -> ok
            end,
            error_logger:info_msg("arkachat: TLS enabled (cert=~s, port=~p)~n",
                [Cert, application:get_env(simple_bridge, port, 8443)])
    end.

%% Let ARKACHAT_BIND_ADDR override the default 127.0.0.1.
maybe_override_bind() ->
    case os:getenv("ARKACHAT_BIND_ADDR") of
        false -> ok;
        Addr  -> application:set_env(simple_bridge, address, Addr)
    end,
    case os:getenv("ARKACHAT_PORT") of
        false -> ok;
        Port  ->
            case string:to_integer(Port) of
                {P, []} when P > 0, P < 65536 ->
                    application:set_env(simple_bridge, port, P);
                _ ->
                    error_logger:error_msg("arkachat: invalid ARKACHAT_PORT=~s, ignored~n", [Port])
            end
    end.

%% Curated cipher list: AEAD-only, forward-secret, no RC4/DES/3DES/CBC-SHA.
tls_ciphers() ->
    case ssl:cipher_suites(default, 'tlsv1.3') of
        [_|_] = V13 ->
            V12 = [C || C <- ssl:cipher_suites(default, 'tlsv1.2'),
                        string:str(atom_to_list(element(2, C)), "GCM") > 0
                            orelse
                        string:str(atom_to_list(element(2, C)), "CHACHA20") > 0],
            V13 ++ V12;
        _ ->
            []  % let OTP pick defaults if the above fails
    end.
