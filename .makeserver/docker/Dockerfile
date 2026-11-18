# videogenerate 服务端镜像：云服务和 Next.js 共用一个镜像，启动命令不同
# 构建上下文：videogenerate 仓库根目录
FROM node:22-bookworm-slim

# ffmpeg：云端合成/水印/字幕；中文字体：渲染字幕兜底
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 根目录依赖里有 Electron、Playwright 等桌面端用的包：跳过它们的二进制下载和安装脚本
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    npm_config_fund=false \
    npm_config_audit=false \
    # ffmpeg-static 没跑安装脚本，改用系统的 ffmpeg
    FFMPEG_BIN=/usr/bin/ffmpeg \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --include=optional
COPY apps/mobile/package.json apps/mobile/package-lock.json ./apps/mobile/
RUN cd apps/mobile && npm ci --ignore-scripts --include=optional

COPY . .

# 浏览器端要用的云服务地址，构建时写死
ARG NEXT_PUBLIC_CLOUD_API_BASE_URL
ENV NEXT_PUBLIC_CLOUD_API_BASE_URL=${NEXT_PUBLIC_CLOUD_API_BASE_URL}

# 网页版 /app/（apps/mobile/dist-web）+ 官网/后台（apps/web-next/.next）
RUN cd apps/mobile && npm run build:web
RUN npm run build:web-next

ENV NODE_ENV=production
EXPOSE 18300 18280
