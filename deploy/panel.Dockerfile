FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY apps/panel/package.json ./
RUN npm install --ignore-scripts
COPY apps/panel .
RUN npm run prisma:generate && npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push --accept-data-loss --schema prisma/schema.prisma && if [ -n \"$ADMIN_EMAIL\" ] && [ -n \"$ADMIN_PASSWORD\" ]; then node dist/seed.js; fi && node dist/server.js"]
