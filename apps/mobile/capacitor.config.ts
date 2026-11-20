import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tiktokcut.mobile',
  appName: 'Klipmill',
  webDir: 'dist',
  backgroundColor: '#070910',
  android: {
    // 本地联调时云端可能是 http://局域网IP；正式环境走 https
    allowMixedContent: true,
  },
  server: { androidScheme: 'https' },
}

export default config
