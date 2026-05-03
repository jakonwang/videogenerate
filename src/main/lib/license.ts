import { ipcMain } from 'electron'
import { machineIdSync } from 'node-machine-id'
import { getLicenseVerifyUrl } from '../../shared/licenseApi'

export type VerifyLicenseResponse = {
  code: number
  msg: string
  data?: { valid?: boolean; expire_time?: string }
}

export function registerLicenseIpc() {
  ipcMain.handle('license:getMachineId', async () => {
    try {
      const id = machineIdSync(true)
      const trimmed = id.length > 128 ? id.slice(0, 128) : id
      return { ok: true, machineId: trimmed }
    } catch (e: any) {
      return { ok: false, machineId: '', error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('license:verify', async (_e, licenseKey: string) => {
    const key = String(licenseKey ?? '').trim()
    if (!key) {
      return { code: -1, msg: '缺少 license_key', data: { valid: false } } satisfies VerifyLicenseResponse
    }
    let machineId: string
    try {
      machineId = machineIdSync(true)
      if (machineId.length > 128) machineId = machineId.slice(0, 128)
    } catch (e: any) {
      return {
        code: -1,
        msg: `无法读取机器码：${e?.message ?? String(e)}`,
        data: { valid: false },
      } satisfies VerifyLicenseResponse
    }

    const url = getLicenseVerifyUrl()
    const body = new URLSearchParams({
      license_key: key,
      machine_id: machineId,
    })

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: body.toString(),
      })
      const text = await res.text()
      let json: VerifyLicenseResponse
      try {
        json = JSON.parse(text) as VerifyLicenseResponse
      } catch {
        return {
          code: -1,
          msg: `服务器返回非 JSON（HTTP ${res.status}）`,
          data: { valid: false },
        }
      }
      return json
    } catch (e: any) {
      return {
        code: -1,
        msg: e?.message ?? String(e),
        data: { valid: false },
      } satisfies VerifyLicenseResponse
    }
  })
}
