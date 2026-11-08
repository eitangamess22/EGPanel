FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY web/package.json ./
RUN npm install --ignore-scripts
COPY web .
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
