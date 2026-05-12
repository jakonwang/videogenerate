import type { SafeStorage } from 'electron'

function resolveSafeStorage(): SafeStorage | null {
  if (typeof require !== 'function') return null
  try {
    const electron = require('electron') as typeof import('electron')
    return electron?.safeStorage ?? null
  } catch {
    return null
  }
}

export function isRuntimeEncryptionAvailable() {
  try {
    return Boolean(resolveSafeStorage()?.isEncryptionAvailable())
  } catch {
    return false
  }
}

export function encryptRuntimeString(value: string) {
  const storage = resolveSafeStorage()
  if (!storage || !storage.isEncryptionAvailable()) {
    return null
  }
  return storage.encryptString(value).toString('base64')
}

export function decryptRuntimeString(value: string) {
  const storage = resolveSafeStorage()
  if (!storage || !storage.isEncryptionAvailable()) {
    return null
  }
  return storage.decryptString(Buffer.from(value, 'base64'))
}
