import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'web-next',
    env: String(process.env.VG_APP_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase(),
    timestamp: Date.now(),
    webApiBaseUrl:
      String(process.env.WEB_API_BASE_URL || process.env.NEXT_PUBLIC_WEB_API_BASE_URL || '').trim() || undefined,
  })
}
