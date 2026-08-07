APP      ?= arkachat
PORT     ?= 8000
REBAR3   := rebar3

.PHONY: all deps compile shell run clean test docker-build docker-run

all: compile

deps:
	$(REBAR3) get-deps

compile:
	$(REBAR3) compile

shell:
	ARKACHAT_PORT=$(PORT) $(REBAR3) shell

run:
	ARKACHAT_PORT=$(PORT) $(REBAR3) run

release:
	$(REBAR3) release

clean:
	$(REBAR3) clean
	rm -rf _build scratch

test:
	$(REBAR3) eunit

docker-build:
	docker build -t arkachat-nitrogen .

docker-run:
	docker run --rm -p $(PORT):$(PORT) \
		-e ARKACHAT_PORT=$(PORT) \
		-e ARKACHAT_SHIELD_KEY=$(ARKACHAT_SHIELD_KEY) \
		arkachat-nitrogen
