# ─────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --frozen-lockfile

COPY . .
RUN npx prisma generate
RUN npm run build

# ─────────────────────────────────
# Stage 2: Production
# ─────────────────────────────────
FROM node:20-alpine AS production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /app

# Sadece production bağımlılıkları
COPY package*.json ./
RUN npm ci --frozen-lockfile --only=production && npm cache clean --force

# Build output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

USER nestjs

EXPOSE 3000

# Migration çalıştır, sonra uygulamayı başlat
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
