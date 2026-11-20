<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CheckCircle2, Copy, Loader2, RefreshCw, Smartphone, X } from 'lucide-vue-next'
import type { ProductResearchPairing } from '../../../../../shared/productResearch'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; paired: [deviceName: string] }>()

const pairing = ref<ProductResearchPairing | null>(null)
const loading = ref(false)
const error = ref('')
const now = ref(Date.now())
const pairedName = ref('')
let knownDevices = new Set<string>()
let timer: ReturnType<typeof setInterval> | null = null

const remaining = computed(() => Math.max(0, Math.floor(((pairing.value?.expiresAt || 0) - now.value) / 1000)))
const expired = computed(() => Boolean(pairing.value) && remaining.value <= 0)
const remainingText = computed(() => `${Math.floor(remaining.value / 60)}:${String(remaining.value % 60).padStart(2, '0')}`)

async function generate() {
  loading.value = true
  error.value = ''
  pairedName.value = ''
  try {
    const snap = await window.api.productResearch.snapshot()
    knownDevices = new Set(snap.devices.filter((item) => item.connected).map((item) => item.id))
    pairing.value = await window.api.productResearch.createPairing()
    startWatch()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

function startWatch() {
  stopWatch()
  const startedAt = Date.now()
  timer = setInterval(async () => {
    now.value = Date.now()
    if (expired.value || pairedName.value) return
    try {
      const snap = await window.api.productResearch.snapshot()
      const fresh = snap.devices.find((item) => item.connected && (!knownDevices.has(item.id) || item.pairedAt >= startedAt))
      if (fresh) {
        pairedName.value = fresh.name
        emit('paired', fresh.name)
        setTimeout(() => { if (props.open) emit('close') }, 1400)
      }
    } catch {
      /* keep polling */
    }
  }, 1500)
}

function stopWatch() {
  if (timer) { clearInterval(timer); timer = null }
}

function copy(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

watch(() => props.open, (open) => {
  if (open) void generate()
  else { stopWatch(); pairing.value = null }
}, { immediate: true })

onBeforeUnmount(stopWatch)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="vg-scope prd-backdrop" @click.self="emit('close')">
      <div class="prd-dialog" role="dialog" aria-modal="true">
        <div class="prd-dialog__head">
          <div class="prd-dialog__title">
            <span class="prd-dialog__title-icon"><Smartphone :size="20" /></span>
            <div>
              <h2>连接采集手机</h2>
              <p>手机与电脑连接同一 WiFi，打开 Klipmill 手机 App，进入「选品 → 连接电脑」扫描下方二维码。</p>
            </div>
          </div>
          <button class="prd-icon-btn" aria-label="关闭" @click="emit('close')"><X :size="16" /></button>
        </div>
        <div class="prd-dialog__body pair-body">
          <div class="pair-qr">
            <div v-if="loading" class="pair-qr__state"><Loader2 :size="26" class="prd-spin" /><span>正在生成二维码…</span></div>
            <div v-else-if="error" class="pair-qr__state pair-qr__state--error"><span>{{ error }}</span><button class="prd-btn prd-btn--sm" @click="generate"><RefreshCw :size="13" />重试</button></div>
            <div v-else-if="pairedName" class="pair-qr__state pair-qr__state--ok"><CheckCircle2 :size="40" /><b>配对成功</b><span>{{ pairedName }} 已连接</span></div>
            <template v-else-if="pairing">
              <img :src="pairing.qrDataUrl" alt="配对二维码" :class="{ 'is-expired': expired }" />
              <div v-if="expired" class="pair-qr__mask"><span>二维码已过期</span><button class="prd-btn prd-btn--primary prd-btn--sm" @click="generate"><RefreshCw :size="13" />重新生成</button></div>
            </template>
          </div>
          <div class="pair-info">
            <div class="pair-row">
              <span>配对码</span>
              <b class="pair-code">{{ pairing?.pairingCode || '------' }}</b>
              <button v-if="pairing" class="prd-icon-btn" title="复制配对码" @click="copy(pairing.pairingCode)"><Copy :size="13" /></button>
            </div>
            <div class="pair-row">
              <span>服务地址</span>
              <code>{{ pairing?.endpoint || '-' }}</code>
              <button v-if="pairing" class="prd-icon-btn" title="复制服务地址" @click="copy(pairing.endpoint)"><Copy :size="13" /></button>
            </div>
            <div class="pair-row">
              <span>有效期</span>
              <span :class="expired ? 'prd-num-red' : 'prd-num-green'">{{ pairing ? (expired ? '已过期' : remainingText) : '-' }}</span>
            </div>
            <ol class="pair-steps">
              <li>手机打开 Klipmill App，进入「选品 → 连接电脑」，按提示开启无障碍服务。</li>
              <li>点击「扫描电脑二维码」扫描左侧二维码；无法扫码时点「手动输入配对码」填写服务地址和配对码。</li>
              <li>配对成功后此窗口会自动关闭，设备出现在「手机连接状态」列表中。</li>
            </ol>
            <div v-if="!pairedName && pairing && !expired" class="pair-waiting"><Loader2 :size="13" class="prd-spin" />等待手机扫码…</div>
          </div>
        </div>
        <div class="prd-dialog__foot">
          <span class="prd-dialog__tip">若长时间无响应，请检查电脑防火墙是否放行 41688 端口。</span>
          <div class="prd-dialog__foot-actions"><button class="prd-btn prd-btn--outline" @click="emit('close')">关闭</button></div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pair-body { flex-direction: row; gap: 18px; align-items: stretch; }
.pair-qr { position: relative; width: 210px; height: 210px; flex-shrink: 0; border-radius: 12px; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--theme-border); }
.pair-qr img { width: 100%; height: 100%; object-fit: contain; }
.pair-qr img.is-expired { filter: blur(3px) grayscale(1); opacity: .5; }
.pair-qr__mask { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #111; font-weight: 600; }
.pair-qr__state { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #374151; font-size: 12px; text-align: center; padding: 12px; }
.pair-qr__state--error { color: #b91c1c; }
.pair-qr__state--ok { color: #047857; }
.pair-qr__state--ok b { font-size: 16px; }
.pair-info { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pair-row { display: flex; align-items: center; gap: 10px; }
.pair-row > span:first-child { width: 60px; color: var(--theme-text-muted); font-size: 12px; flex-shrink: 0; }
.pair-row code { font-size: 12px; padding: 4px 8px; border-radius: 6px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pair-code { font-size: 22px; letter-spacing: 4px; color: var(--theme-accent); font-variant-numeric: tabular-nums; }
.pair-steps { margin: 4px 0 0; padding-left: 18px; color: var(--theme-text-secondary); font-size: 12px; line-height: 1.7; }
.pair-waiting { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--theme-accent); }
@media (max-width: 620px) { .pair-body { flex-direction: column; align-items: center; } }
</style>
