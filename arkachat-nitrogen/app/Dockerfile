FROM erlang:27-alpine AS builder
WORKDIR /build
COPY . .
RUN apk add --no-cache make curl git && \
    curl -fsSL https://s3.amazonaws.com/rebar3/rebar3 -o /usr/local/bin/rebar3 && \
    chmod +x /usr/local/bin/rebar3 && \
    rebar3 release

FROM erlang:27-alpine
WORKDIR /app
COPY --from=builder /build/_build/default/rel/arkachat /app

ENV ARKACHAT_PORT=8000
ENV ARKACHAT_BIND_ADDR=0.0.0.0

EXPOSE 8000

CMD ["/app/bin/arkachat", "foreground"]
