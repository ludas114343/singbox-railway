FROM node:20-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tar \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY singbox.json.tpl ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8443 8080

CMD ["/app/entrypoint.sh"]