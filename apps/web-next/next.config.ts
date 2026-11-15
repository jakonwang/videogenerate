import type { NextConfig } from 'next'

/**
 * Web 端定位为「官网 + 用户中心」。旧的网页工作台页面依赖本地服务、无法在线使用，
 * 统一引导到用户中心（代码暂时保留，后续确认不再需要后删除）。
 */
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
        { source: `/${route}`, destination: '/account', permanent: false },
        { source: `/${route}/:path*`, destination: '/account', permanent: false },
      ]),
    ]
  },
}

export default nextConfig
