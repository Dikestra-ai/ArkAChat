# ChatGuard Shield Proxy
# Extends Shield proxy with ChatGuard-specific config
FROM rust:1.82 AS builder
WORKDIR /build
COPY Shield/shield-core/ shield-core/
COPY Shield/shield-proxy/ shield-proxy/
WORKDIR /build/shield-proxy
RUN cargo build --release

FROM gcr.io/distroless/cc-debian12
COPY --from=builder /build/shield-proxy/target/release/shield-proxy /usr/local/bin/shield-proxy
ENV SHIELD_PROXY_CONFIG=/etc/shield-proxy/config.toml
ENV RUST_LOG=info
EXPOSE 8443 5353/udp 9090
ENTRYPOINT ["/usr/local/bin/shield-proxy"]
