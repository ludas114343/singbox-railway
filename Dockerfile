FROM node:20-alpine

RUN apk add --no-cache curl ca-certificates tar

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY singbox.json.tpl ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh \
 && SB_VER=1.14.4 \
 && curl -fsSL -o /tmp/sb.tar.gz "https://github.com/SagerNet/sing-box/releases/download/v${SB_VER}/sing-box-${SB_VER}-linux-amd64.tar.gz" \
 && tar -xzf /tmp/sb.tar.gz -C /tmp \
 && mv /tmp/sing-box-${SB_VER}-linux-amd64/sing-box /app/sing-box \
 && rm -rf /tmp/sb.tar.gz /tmp/sing-box-* \
 && /app/sing-box version

EXPOSE 8443 8080

CMD ["/app/entrypoint.sh"]