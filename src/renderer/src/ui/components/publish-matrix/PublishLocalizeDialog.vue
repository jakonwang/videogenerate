<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, Languages, LoaderCircle, X } from "lucide-vue-next";
import { LOCALIZE_LANGUAGES, LOCALIZE_LANGUAGE_CODES, type LocalizeLanguage } from "../../../../../shared/localize";

const props = defineProps<{ open: boolean; taskIds: string[] }>();
const emit = defineEmits<{ (e: "close"): void; (e: "done", result: { tasks: any[]; languages: LocalizeLanguage[] }): void }>();

const picked = ref<LocalizeLanguage[]>([]);
const voice = ref<"female" | "male">("female");
const originalAudio = ref<"duck" | "mute">("duck");
const coverOldSubtitles = ref(true);
const showAdvanced = ref(false);
const busy = ref(false);
const error = ref("");

watch(() => props.open, (open) => {
  if (!open) return;
  error.value = "";
  if (!picked.value.length) picked.value = ["vi"];
}, { immediate: true });

function toggle(code: LocalizeLanguage) {
  picked.value = picked.value.includes(code) ? picked.value.filter((item) => item !== code) : [...picked.value, code];
}
const total = computed(() => props.taskIds.length * picked.value.length);

async function confirm() {
  if (!picked.value.length) { error.value = "请至少选一种语言"; return; }
  busy.value = true;
  error.value = "";
  try {
    const result = await window.api.tiktokPublisher.localizeCreate({
      taskIds: [...props.taskIds],
      languages: [...picked.value],
      voice: voice.value,
      originalAudio: originalAudio.value,
      coverOldSubtitles: coverOldSubtitles.value,
    });
    emit("done", { tasks: result.tasks, languages: [...picked.value] });
    emit("close");
  } catch (e: any) {
    error.value = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="vg-scope vg-backdrop" @click.self="emit('close')">
    <section class="vg-dialog pld" role="dialog" aria-modal="true" aria-labelledby="pld-title" data-testid="publish-localize">
      <header class="vg-dialog__head">
        <div class="vg-dialog__title">
          <span class="vg-dialog__title-icon"><Languages :size="20" /></span>
          <div>
            <h2 id="pld-title">出其他语言版</h2>
            <p>已选 <b>{{ taskIds.length }}</b> 个视频：AI 按当地说法重写配音和字幕，标题、描述也一起换</p>
          </div>
        </div>
        <button type="button" class="vg-icon-btn" aria-label="关闭" @click="emit('close')"><X :size="18" /></button>
      </header>

      <div class="vg-dialog__body pld__body">
        <section class="pld__section">
          <h3>1. 选语言</h3>
          <div class="pld__langs">
            <button
              v-for="code in LOCALIZE_LANGUAGE_CODES"
              :key="code"
              type="button"
              class="pld__lang"
              :class="{ 'is-on': picked.includes(code) }"
              :data-testid="`localize-lang-${code}`"
              @click="toggle(code)"
            >
              <span class="pld__check"><Check v-if="picked.includes(code)" :size="12" /></span>
              {{ LOCALIZE_LANGUAGES[code].label }}
            </button>
          </div>
        </section>

        <section class="pld__section">
          <h3>2. 配音</h3>
          <div class="pld__seg" role="radiogroup">
            <button type="button" :class="{ 'is-on': voice === 'female' }" @click="voice = 'female'">女声</button>
            <button type="button" :class="{ 'is-on': voice === 'male' }" @click="voice = 'male'">男声</button>
          </div>
        </section>

        <button type="button" class="vg-link vg-link--muted pld__adv" @click="showAdvanced = !showAdvanced">{{ showAdvanced ? "收起高级设置" : "高级设置：原声、原字幕" }}</button>
        <div v-if="showAdvanced" class="pld__adv-body">
          <div class="pld__row">
            <span>原来的声音</span>
            <div class="pld__seg" role="radiogroup">
              <button type="button" :class="{ 'is-on': originalAudio === 'duck' }" @click="originalAudio = 'duck'">压低当背景</button>
              <button type="button" :class="{ 'is-on': originalAudio === 'mute' }" @click="originalAudio = 'mute'">完全去掉</button>
            </div>
          </div>
          <label class="pld__check-line"><input v-model="coverOldSubtitles" type="checkbox" />模糊掉画面底部的原字幕（原片烧了中文字幕时建议打开）</label>
        </div>

        <p class="vg-muted pld__hint">
          将生成 <b>{{ total }}</b> 条外语版草稿，在后台逐条处理，每条约 1 分钟。外语版一般发到当地的号，账号和商品要重新选。
          原片没人说话时只翻译标题和描述。
        </p>
        <p v-if="error" class="vg-notice vg-notice--danger">{{ error }}</p>
      </div>

      <footer class="vg-dialog__foot">
        <span class="vg-muted">已选 {{ picked.length }} 种语言</span>
        <div class="vg-dialog__foot-actions">
          <button type="button" class="vg-btn" @click="emit('close')">取消</button>
          <button type="button" class="vg-btn vg-btn--primary" :disabled="busy || !picked.length" data-testid="localize-confirm" @click="confirm">
            <LoaderCircle v-if="busy" :size="14" class="vg-spin" />开始生成
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.pld { width: min(560px, 100%); }
.pld__body { display: flex; flex-direction: column; gap: 14px; }
.pld__section { display: flex; flex-direction: column; gap: 8px; }
.pld__section h3 { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--theme-text); }
.pld__langs { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px; }
.pld__lang { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); color: var(--theme-text); font-size: 13px; font-weight: 600; cursor: pointer; }
.pld__lang.is-on { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
.pld__check { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--theme-border-control); border-radius: 4px; color: var(--vg-accent); }
.pld__seg { display: inline-flex; padding: 2px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); align-self: flex-start; }
.pld__seg button { padding: 5px 14px; border: 0; border-radius: calc(var(--vg-radius-sm) - 2px); background: transparent; color: var(--theme-text-muted); font-size: 12.5px; cursor: pointer; }
.pld__seg button.is-on { background: var(--vg-accent-soft); color: var(--theme-text); font-weight: 600; }
.pld__adv { align-self: flex-start; font-size: 12px; }
.pld__adv-body { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); font-size: 12.5px; color: var(--theme-text); }
.pld__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pld__check-line { display: flex; align-items: center; gap: 8px; }
.pld__hint { margin: 0; font-size: 12px; line-height: 1.6; }
</style>
