# videogenerate 服务端镜像：云服务和 Next.js 共用一个镜像，启动命令不同
# 构建上下文：videogenerate 仓库根目录（不进镜像的内容见同目录 Dockerfile.dockerignore）
#
# 分三段：base（系统软件）→ build（装全部依赖、构建前端、裁剪依赖）→ 最终镜像（只拷运行要用的）。
# 最终镜像里变化少的层放前面：依赖没变时，发版只新增源码和前端产物。

FROM node:22-bookworm-slim AS base
# ffmpeg：云端合成/水印/字幕；中文字体：渲染字幕兜底
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
# 根目录依赖里有 Electron、Playwright 等桌面端用的包：跳过它们的二进制下载和安装脚本
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    npm_config_fund=false \
    npm_config_audit=false \
    NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --include=optional
COPY apps/mobile/package.json apps/mobile/package-lock.json ./apps/mobile/
RUN cd apps/mobile && npm ci --ignore-scripts --include=optional

# 运行时依赖单独裁剪一份到 /runtime（不影响下面的前端构建）
COPY .makeserver/docker/prune-runtime.mjs /tmp/prune-runtime.mjs
RUN mkdir /runtime && cp -a package.json package-lock.json node_modules /runtime/ \
 && node /tmp/prune-runtime.mjs /runtime

COPY . .

# 浏览器端要用的云服务地址，构建时写死
ARG NEXT_PUBLIC_CLOUD_API_BASE_URL
ENV NEXT_PUBLIC_CLOUD_API_BASE_URL=${NEXT_PUBLIC_CLOUD_API_BASE_URL}

# 网页版 /app/（apps/mobile/dist-web）+ 官网/后台（apps/web-next/.next）
RUN cd apps/mobile && npm run build:web
RUN npm run build:web-next && rm -rf apps/web-next/.next/cache

FROM base
# ffmpeg-static 没跑安装脚本，改用系统的 ffmpeg
ENV FFMPEG_BIN=/usr/bin/ffmpeg \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
ARG NEXT_PUBLIC_CLOUD_API_BASE_URL
ENV NEXT_PUBLIC_CLOUD_API_BASE_URL=${NEXT_PUBLIC_CLOUD_API_BASE_URL}

COPY --from=build /runtime/node_modules ./node_modules
COPY resources ./resources
COPY package.json tsconfig.json ./
COPY services ./services
# 复刻引擎直接跑电脑端的 TypeScript 源码，Remotion 字幕也从 src 打包
COPY src ./src
COPY --from=build /app/apps/mobile/dist-web ./apps/mobile/dist-web
COPY apps/web-next/next.config.ts apps/web-next/tsconfig.json ./apps/web-next/
COPY apps/web-next/public ./apps/web-next/public
COPY --from=build /app/apps/web-next/.next ./apps/web-next/.next

EXPOSE 18300 18280
