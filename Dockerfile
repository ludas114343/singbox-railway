FROM node:20-alpine

RUN apk add --no-cache curl ca-certificates tar

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY singbox.json.tpl ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8443 8080

CMD ["/app/entrypoint.sh"]