FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Public, non-secret settings baked into the website build and read by the tracker.
ENV VITE_CLICKPOT_ADDRESS=0xb403dff43fb2ff80dda8e3c817f3b15730be1929
RUN bun run build

# Tracker database lives here. Attach persistent storage at /data to keep it across restarts.
RUN mkdir -p /data && chown -R bun:bun /data /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    TRACKER_PORT=7860
USER bun

EXPOSE 7860
CMD ["bun", "run", "start"]
