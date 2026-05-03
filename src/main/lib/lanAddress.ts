import { networkInterfaces } from 'node:os'

/** 取本机第一个非回环 IPv4（手机同 Wi‑Fi 扫码预览用） */
export function getLanIPv4(): string | null {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      const fam = net.family
      const isV4 = fam === 'IPv4' || String(fam) === '4'
      if (isV4 && !net.internal) return net.address
    }
  }
  return null
}
