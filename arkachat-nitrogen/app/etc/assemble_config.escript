#!/usr/bin/env escript
%% Concatenate all *.config files in the etc/ directory into one file.
main([Dir, OutFile]) ->
    {ok, Files} = file:list_dir(Dir),
    Configs = lists:sort([ filename:join(Dir, F)
                           || F <- Files,
                              filename:extension(F) =:= ".config",
                              F =/= filename:basename(OutFile) ]),
    All = lists:foldl(fun(F, Acc) ->
        {ok, Bin} = file:read_file(F),
        <<Acc/binary, Bin/binary, "\n">>
    end, <<>>, Configs),
    ok = file:write_file(OutFile, All).
