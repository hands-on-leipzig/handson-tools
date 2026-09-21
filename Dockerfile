FROM node:22-alpine
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY src ./src
COPY data ./data
COPY favicon.ico hot.png ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
