import type { NextConfig } from 'next'

/**
 * web-next 只做「官网 + 用户中心 + 后台」。旧的网页工作台已删除（2026-11），
 * 旧链接改去云服务上的网页版 /app/（未配置云服务地址时去用户中心）。
 */
const CLOUD_BASE = (process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL || '').trim().replace(/\/+$/, '')
const LEGACY_DESTINATION = CLOUD_BASE ? `${CLOUD_BASE}/app/` : '/account'
const LEGACY_WORKSPACE_ROUTES = ['workspace', 'clone', 'models', 'materials', 'live-clips', 'production', 'templates', 'plugins', 'my-plugins', 'settings']

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  devIndicators: false,
  async redirects() {
    return [
      { source: '/billing', destination: '/account/buy', permanent: false },
      { source: '/product', destination: '/#features', permanent: false },
      ...LEGACY_WORKSPACE_ROUTES.flatMap((route) => [
        { source: `/${route}`, destination: LEGACY_DESTINATION, permanent: false },
        { source: `/${route}/:path*`, destination: LEGACY_DESTINATION, permanent: false },
      ]),
    ]
  },
}

export default nextConfig
