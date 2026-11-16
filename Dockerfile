# Multi-stage production build for ShopDeck (100% Free Docker deployment)
# Stage 1: Build React Frontend Assets
FROM node:22-slim AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Runtime Service
FROM node:22-slim
WORKDIR /app

# Install native build tools for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install server dependencies
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev

# Copy server code
COPY server/ ./

# Copy built frontend from Stage 1 into server client path
COPY --from=client-builder /app/client/dist /app/client/dist

# Persistent directory for SQLite
RUN mkdir -p /app/server/data
ENV DB_PATH=/app/server/data/products.db
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "index.js"]
