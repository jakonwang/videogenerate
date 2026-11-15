/**
 * 必须作为 src/main/index.ts 的第一个 import：在任何模块注册 ipcMain.handle 之前装上授权守卫。
 */
import { installIpcLicenseGuard } from './cloudLicense'

installIpcLicenseGuard()
