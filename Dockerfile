FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 AIRPORT_DATABASE_PATH=/data/airport.sqlite AIRPORT_MIGRATIONS_PATH=/app/drizzle
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/database.mjs /app/scripts/serve.mjs ./scripts/
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "scripts/serve.mjs"]
