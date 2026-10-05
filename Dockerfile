FROM node:20-slim AS base

# --- deps ---
FROM base AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev=false

# --- build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data

# Utente non-root
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 arpac

COPY --from=builder /app/public ./public
COPY --from=builder --chown=arpac:nodejs /app/.next/standalone ./
COPY --from=builder --chown=arpac:nodejs /app/.next/static ./.next/static

RUN mkdir -p /data && chown -R arpac:nodejs /data

USER arpac
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
