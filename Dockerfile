FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json .env.example ./
RUN npm install --omit=dev
COPY . .

ENV PORT=8787 \
    SKYCLIP_DATA_FILE=/data/skyclip-data.json \
    SKYCLIP_UPLOAD_DIR=/data/uploads \
    SKYCLIP_RENDER_DIR=/data/renders
RUN mkdir -p /data/uploads /data/renders
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8787/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
