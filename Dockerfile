FROM alpine:3.20

RUN apk add --no-cache wget curl bash ca-certificates tzdata && \
    wget -q -O /tmp/sb.tar.gz https://github.com/SagerNet/sing-box/releases/download/v1.13.18/sing-box-1.13.18-linux-amd64-musl.tar.gz && \
    tar -xzf /tmp/sb.tar.gz -C /tmp && \
    cp /tmp/sing-box-1.13.18-linux-amd64-musl/sing-box /usr/local/bin/sing-box && \
    rm -rf /tmp/sb.tar.gz /tmp/sing-box-1.13.18-linux-amd64-musl && \
    chmod +x /usr/local/bin/sing-box

COPY config.json /etc/sing-box/config.json
COPY start.sh /usr/local/bin/start.sh
COPY traffic-watchdog.sh /usr/local/bin/traffic-watchdog.sh
RUN chmod +x /usr/local/bin/start.sh /usr/local/bin/traffic-watchdog.sh

EXPOSE 8443

CMD ["/usr/local/bin/start.sh"]
