# syntax=docker/dockerfile:1

# --- Build-Stage: Frontend (Vite) bauen -------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime-Stage: nur Server + fertiges dist/ -----------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Nur Produktionsabhängigkeiten installieren.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Servercode und gebautes Frontend übernehmen.
COPY server ./server
COPY --from=build /app/dist ./dist

# Log-Verzeichnis (wird per Volume persistiert).
RUN mkdir -p server/logs

EXPOSE 3001
CMD ["node", "server/index.js"]
