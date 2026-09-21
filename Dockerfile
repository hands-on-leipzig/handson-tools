# syntax=docker/dockerfile:1
FROM node:22-alpine
RUN apk add --no-cache ca-certificates
WORKDIR /app

# package.json uses file:../glass → /glass from WORKDIR /app
COPY --from=glass package.json /glass/package.json
COPY --from=glass styles /glass/styles
COPY --from=glass fonts /glass/fonts
COPY --from=glass theme /glass/theme
COPY --from=glass components /glass/components
COPY --from=glass venues /glass/venues
COPY --from=glass documents /glass/documents
COPY --from=glass scripts /glass/scripts
COPY --from=glass README.md /glass/README.md

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY src ./src
COPY public ./public
COPY data ./data
COPY favicon.ico hot.png ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
