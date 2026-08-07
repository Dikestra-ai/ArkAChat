#!/usr/bin/env escript
%% Link or copy nitrogen_core static assets into priv/static/nitrogen/.
main(["link"]) ->
    NitrogenStatic = find_nitrogen_static(),
    Target = "priv/static/nitrogen",
    case filelib:is_dir(Target) of
        true  -> ok;
        false ->
            case NitrogenStatic of
                undefined -> io:format("Warning: nitrogen_core static not found~n");
                Path      -> file:make_symlink(Path, Target)
            end
    end;
main(_) -> ok.

find_nitrogen_static() ->
    Paths = filelib:wildcard("_build/*/lib/nitrogen_core/priv/static"),
    case Paths of
        [P|_] -> filename:absname(P);
        []    -> undefined
    end.
