<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TitleBar from '../components/TitleBar.vue'
import { LICENSE_STORAGE_KEY } from '../../../../shared/licenseApi'
import { markLicensedAfterActivate, resetLicenseSession } from '@/lib/licenseSession'

const { t } = useI18n()
const router = useRouter()

const machineId = ref('')
const machineLoading = ref(true)
const licenseKey = ref('')
const activating = ref(false)
const errorMsg = ref('')
const copyHint = ref(false)

onMounted(async () => {
  machineLoading.value = true
  try {
    const res = await window.api.license.getMachineId()
    machineId.value = res.ok ? res.machineId : ''
    if (!res.ok && res.error) errorMsg.value = res.error
  } catch (e: any) {
    errorMsg.value = e?.message ?? String(e)
  } finally {
    machineLoading.value = false
  }
})

async function copyMachineId() {
  const text = machineId.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copyHint.value = true
    setTimeout(() => {
      copyHint.value = false
    }, 2000)
  } catch {
    errorMsg.value = t('auth.copyFailed')
  }
}

async function activate() {
  errorMsg.value = ''
  const key = licenseKey.value.trim()
  if (!key) {
    errorMsg.value = t('auth.keyRequired')
    return
  }
  activating.value = true
  try {
    const res = await window.api.license.verify(key)
    if (res && res.code === 0 && res.data?.valid === true) {
      localStorage.setItem(LICENSE_STORAGE_KEY, key)
      resetLicenseSession()
      markLicensedAfterActivate()
      await router.replace({ name: 'products' })
      return
    }
    errorMsg.value = res?.msg?.trim() || t('auth.verifyFailed')
  } catch (e: any) {
    errorMsg.value = e?.message ?? String(e)
  } finally {
    activating.value = false
  }
}
</script>

<template>
  <div class="ui-app relative flex h-screen w-screen flex-col overflow-hidden bg-[#0E0E11]">
    <div
      class="pointer-events-none absolute inset-0"
      style="
        background:
          radial-gradient(70% 50% at 50% 0%, rgba(99, 102, 241, 0.12), rgba(14, 14, 17, 0));
      "
    ></div>
    <TitleBar />
    <div class="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
      <div class="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-xl shadow-black/50">
        <h1 class="text-center text-lg font-semibold text-white/90">{{ t('auth.title') }}</h1>
        <p class="mt-1 text-center text-xs text-white/50">{{ t('auth.subtitle') }}</p>

        <div class="mt-6">
          <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/45">{{
            t('auth.machineId')
          }}</label>
          <div class="flex gap-2">
            <input
              class="ui-input flex-1 cursor-default font-mono text-xs text-white/80"
              type="text"
              readonly
              :value="machineLoading ? t('auth.loading') : machineId || '—'"
            />
            <button
              type="button"
              class="shrink-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-white/80 outline-none transition hover:bg-white/[0.06] focus:border-white/20 focus:ring-1 focus:ring-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!machineId || machineLoading"
              @click="copyMachineId"
            >
              {{ copyHint ? t('auth.copied') : t('auth.copy') }}
            </button>
          </div>
        </div>

        <div class="mt-5">
          <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/45">{{
            t('auth.licenseKey')
          }}</label>
          <input
            v-model="licenseKey"
            class="ui-input w-full"
            type="password"
            autocomplete="off"
            :placeholder="t('auth.licensePlaceholder')"
            @keyup.enter="activate"
          />
        </div>

        <p v-if="errorMsg" class="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {{ errorMsg }}
        </p>

        <button
          type="button"
          class="mt-6 w-full rounded-lg bg-gradient-to-b from-indigo-500 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition hover:from-indigo-400 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="activating || machineLoading"
          @click="activate"
        >
          {{ activating ? t('auth.activating') : t('auth.activate') }}
        </button>
      </div>
    </div>
  </div>
</template>
