FROM oven/bun:1.3 AS dashboard-builder
WORKDIR /dashboard
COPY packages/dashboard/package.json packages/dashboard/bun.lock* ./
RUN bun install --frozen-lockfile
COPY packages/dashboard/ ./
RUN bun run build

FROM oven/bun:1.3 AS base
WORKDIR /app

# --- Typst CLI binary ---
COPY --from=ghcr.io/typst/typst:0.14.2 /bin/typst /usr/local/bin/typst

# --- Fonts ---
# apt: free/metric-compatible equivalents for common fonts
# Montserrat downloaded separately (not in standard apt)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       wget \
       ca-certificates \
       fontconfig \
       fonts-dejavu-core \
       fonts-liberation \
       fonts-crosextra-carlito \
       fonts-crosextra-caladea \
       fonts-ebgaramond \
       fonts-cabin \
  && mkdir -p /usr/local/share/fonts/montserrat \
  && wget -q \
       "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf" \
       -O /usr/local/share/fonts/montserrat/Montserrat.ttf \
  && fc-cache -f \
  && apt-get purge -y --auto-remove wget \
  && rm -rf /var/lib/apt/lists/*

# --- API dependencies ---
COPY packages/api/package.json packages/api/bun.lock* ./
RUN bun install --frozen-lockfile --production

# --- Application source ---
COPY packages/api/tsconfig.json ./
COPY packages/api/src ./src
COPY templates ./templates
COPY fonts ./fonts

# --- Vendored Typst packages ---
COPY vendor/preview /data/.typst-cache/preview

# --- Dashboard static build ---
COPY --from=dashboard-builder /dashboard/build ./dashboard/build

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    TEMPLATES_DIR=/app/templates \
    TYPST_PACKAGE_CACHE_PATH=/data/.typst-cache \
    TYPST_FONT_PATHS=/app/fonts:/usr/share/fonts:/usr/local/share/fonts \
    DASHBOARD_DIR=/app/dashboard/build

EXPOSE 3000
VOLUME ["/data", "/app/templates"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
