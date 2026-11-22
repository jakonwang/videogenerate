<script setup lang="ts">
import { ref, watch } from "vue";
import { Check, Cloud, LoaderCircle, X } from "lucide-vue-next";
import { GEELARK_PLATFORMS, GEELARK_PLATFORM_KEYS, type GeelarkPlatform } from "../../../../../shared/geelark";

type Status = { configured: boolean; baseUrl: string; appId: string; maskedKey: string; maskedToken: string; platforms: GeelarkPlatform[] };
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void; (e: "changed", status: Status): void }>();

const status = ref<Status | null>(null);
const appId = ref("");
const apiKey = ref("");
const accessToken = ref("");
const baseUrl = ref("");
const platforms = ref<GeelarkPlatform[]>(["tiktok"]);
const showAdvanced = ref(false);
const busy = ref(false);
const message = ref("");
const error = ref("");

const clean = (e: any) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

watch(() => props.open, async (open) => {
  if (!open) return;
  message.value = "";
  error.value = "";
  apiKey.value = "";
  accessToken.value = "";
  status.value = await window.api.tiktokPublisher.geelarkStatus();
  appId.value = status.value.appId;
  baseUrl.value = status.value.baseUrl;
  platforms.value = [...status.value.platforms];
}, { immediate: true });

function togglePlatform(platform: GeelarkPlatform) {
  platforms.value = platforms.value.includes(platform) ? platforms.value.filter((p) => p !== platform) : [...platforms.value, platform];
}

async function save() {
  if (!platforms.value.length) { error.value = "至少开启一个平台"; return; }
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    status.value = await window.api.tiktokPublisher.geelarkSave({ appId: appId.value, apiKey: apiKey.value, accessToken: accessToken.value, baseUrl: baseUrl.value, platforms: [...platforms.value] });
    apiKey.value = "";
    accessToken.value = "";
    if (status.value.configured) {
      const result = await window.api.tiktokPublisher.geelarkTest();
      message.value = `已连接，读到 ${result.phones} 台云手机`;
    }
    emit("changed", status.value);
  } catch (e) {
    error.value = clean(e);
  } finally {
    busy.value = false;
  }
}

async function disconnect() {
  status.value = await window.api.tiktokPublisher.geelarkClear();
  appId.value = "";
  emit("changed", status.value);
}
</script>

<template>
  <div v-if="open" class="vg-scope vg-backdrop" @click.self="emit('close')">
    <section class="vg-dialog glc" role="dialog" aria-modal="true" aria-labelledby="glc-title" data-testid="geelark-connect">
      <header class="vg-dialog__head">
        <div class="vg-dialog__title">
          <span class="vg-dialog__title-icon"><Cloud :size="20" /></span>
          <div>
            <h2 id="glc-title">连接 GeeLark 云手机</h2>
            <p>每台云手机会变成发布账号，可以发 TikTok、YouTube、Instagram、Facebook</p>
          </div>
        </div>
        <button type="button" class="vg-icon-btn" aria-label="关闭" @click="emit('close')"><X :size="18" /></button>
      </header>

      <div class="vg-dialog__body glc__body">
        <div class="glc__status" :class="{ 'is-on': status?.configured }">
          <span class="glc__dot" />{{ status?.configured ? `已连接 · ${status.maskedToken || status.maskedKey}` : "未连接" }}
        </div>
        <label class="vg-field">
          <span class="vg-field__label">App ID</span>
          <input v-model="appId" class="vg-input" placeholder="GeeLark 后台 → API 里的 App ID" data-testid="geelark-app-id" />
        </label>
        <label class="vg-field">
          <span class="vg-field__label">API Key</span>
          <input v-model="apiKey" class="vg-input" type="password" :placeholder="status?.maskedKey ? `已保存 ${status.maskedKey}，留空不改` : 'GeeLark 后台 → API 里的 API Key'" data-testid="geelark-api-key" />
        </label>

        <div class="glc__platforms">
          <span class="vg-field__label">云手机上要发的平台</span>
          <div class="glc__chips">
            <button v-for="key in GEELARK_PLATFORM_KEYS" :key="key" type="button" class="glc__chip" :class="{ 'is-on': platforms.includes(key) }" :data-testid="`geelark-platform-${key}`" @click="togglePlatform(key)">
              <span class="glc__check"><Check v-if="platforms.includes(key)" :size="12" /></span>{{ GEELARK_PLATFORMS[key].label }}
            </button>
          </div>
          <small class="vg-muted">每台云手机在每个平台上算一个发布账号。手机上要先登录好对应 App。</small>
        </div>

        <button type="button" class="vg-link vg-link--muted glc__adv" @click="showAdvanced = !showAdvanced">{{ showAdvanced ? "收起高级设置" : "高级设置：Access Token、接口地址" }}</button>
        <template v-if="showAdvanced">
          <label class="vg-field">
            <span class="vg-field__label">Access Token（可选，填了就不用 App ID / API Key）</span>
            <input v-model="accessToken" class="vg-input" type="password" :placeholder="status?.maskedToken ? `已保存 ${status.maskedToken}，留空不改` : ''" />
          </label>
          <label class="vg-field">
            <span class="vg-field__label">接口地址</span>
            <input v-model="baseUrl" class="vg-input" placeholder="https://openapi.geelark.com" data-testid="geelark-base-url" />
          </label>
        </template>
        <p class="vg-muted glc__hint">密钥只保存在本机安全存储里。云手机执行发布会消耗 GeeLark 的时长。</p>
        <p v-if="message" class="vg-notice" data-testid="geelark-message">{{ message }}</p>
        <p v-if="error" class="vg-notice vg-notice--danger">{{ error }}</p>
      </div>

      <footer class="vg-dialog__foot">
        <button v-if="status?.configured" type="button" class="vg-btn vg-btn--ghost" @click="disconnect">断开</button>
        <span v-else />
        <div class="vg-dialog__foot-actions">
          <button type="button" class="vg-btn" @click="emit('close')">关闭</button>
          <button type="button" class="vg-btn vg-btn--primary" :disabled="busy" data-testid="geelark-save" @click="save">
            <LoaderCircle v-if="busy" :size="14" class="vg-spin" />保存并测试
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.glc { width: min(560px, 100%); }
.glc__body { display: flex; flex-direction: column; gap: 12px; }
.glc__status { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); font-size: 12.5px; color: var(--theme-text-muted); }
.glc__status.is-on { color: var(--vg-green); }
.glc__dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.glc__platforms { display: flex; flex-direction: column; gap: 6px; }
.glc__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.glc__chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); color: var(--theme-text); font-size: 12.5px; cursor: pointer; }
.glc__chip.is-on { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
.glc__check { width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--theme-border-control); border-radius: 3px; color: var(--vg-accent); }
.glc__adv { align-self: flex-start; font-size: 12px; }
.glc__hint { margin: 0; font-size: 11.5px; }
</style>
