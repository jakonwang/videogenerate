<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ClipboardList, FolderOpen, Loader, Rocket, Settings2 } from 'lucide-vue-next'

type Product = { id: string; name: string }
type Template = { id: string; name: string }

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const products = ref<Product[]>([])
const templates = ref<Template[]>([])
const submitting = ref(false)
const feedback = ref('')
const form = reactive({
  productId: '',
  templateId: '',
  count: 5,
  outDir: '',
})

const selectedProduct = computed(() => products.value.find((item) => item.id === form.productId) ?? null)
const selectedTemplate = computed(() => templates.value.find((item) => item.id === form.templateId) ?? null)

function normalizeOutputDirFromDataDir(dataDir: string) {
  const base = String(dataDir ?? '').trim().replace(/[\\/]+$/, '')
  if (!base) return ''
  const sep = base.includes('\\') ? '\\' : '/'
  return `${base}${sep}exports`
}

async function refresh() {
  products.value = (await window.api.products.list()) as Product[]
  templates.value = (await window.api.templates.list()) as Template[]
  if (!form.productId) form.productId = products.value[0]?.id ?? ''
  // 从模板库「用此模板混剪」进来时带 templateId
  const fromQuery = String(route.query.templateId ?? '')
  if (fromQuery && templates.value.some((x) => x.id === fromQuery)) form.templateId = fromQuery
  if (!form.templateId) form.templateId = templates.value[0]?.id ?? ''
  if (!form.outDir) {
    try {
      const paths = await window.api.getPaths()
      form.outDir = normalizeOutputDirFromDataDir((paths as any)?.dataDir ?? '')
    } catch {
      // ignore local path probe failures
    }
  }
}

async function pickOutDir() {
  const outDir = await window.api.pickDir({ title: t('production.create.pickOutputDir') })
  if (outDir) form.outDir = outDir
}

async function submit() {
  feedback.value = ''
  if (!form.productId || !form.templateId || !String(form.outDir || '').trim()) {
    feedback.value = t('production.create.validation')
    return
  }

  submitting.value = true
  try {
    const meta = await window.api.tasks.enqueueBatch({
      productId: form.productId,
      templateId: form.templateId,
      count: Math.max(1, Math.floor(Number(form.count) || 1)),
      outDir: String(form.outDir || '').trim(),
    })
    feedback.value = t('production.create.created', { count: meta?.enqueued ?? 0 })
    void router.push('/production/tasks')
  } catch (error: any) {
    feedback.value = String(error?.message ?? error ?? t('production.create.failed'))
  } finally {
    submitting.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="vg-scope vg-page prod-create">
    <header class="vg-page-head">
      <button class="vg-icon-btn" type="button" :title="t('production.create.viewTasks')" @click="router.push('/production/tasks')">
        <ArrowLeft :size="18" />
      </button>
      <div class="vg-page-head__text">
        <h1>{{ t('production.create.title') }}</h1>
        <p>{{ t('production.create.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <span class="vg-pill vg-pill--accent">{{ t('production.create.kicker') }}</span>
      </div>
    </header>

    <div class="vg-split prod-create__layout">
      <section class="vg-card">
        <div class="vg-card__head">
          <span class="vg-card__title"><Settings2 :size="16" /> {{ t('production.create.title') }}</span>
        </div>
        <div class="vg-form-grid">
          <div class="vg-field">
            <label for="pc-product">{{ t('production.create.product') }}<span class="vg-req">*</span></label>
            <select id="pc-product" v-model="form.productId" class="vg-select">
              <option v-for="item in products" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
          </div>
          <div class="vg-field">
            <label for="pc-template">{{ t('production.create.template') }}<span class="vg-req">*</span></label>
            <select id="pc-template" v-model="form.templateId" class="vg-select">
              <option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
          </div>
          <div class="vg-field">
            <label for="pc-count">{{ t('production.create.quantity') }}</label>
            <input id="pc-count" v-model.number="form.count" class="vg-input" type="number" min="1" max="100" />
          </div>
          <div class="vg-field span-all">
            <label for="pc-outdir">{{ t('production.create.outputDir') }}<span class="vg-req">*</span></label>
            <div class="vg-row prod-create__outdir">
              <input id="pc-outdir" v-model="form.outDir" class="vg-input" />
              <button class="vg-btn" type="button" @click="pickOutDir"><FolderOpen :size="15" /> {{ t('production.create.chooseDir') }}</button>
            </div>
          </div>
        </div>
        <div class="vg-card__foot">
          <p v-if="feedback" class="prod-create__feedback">{{ feedback }}</p>
          <div class="vg-row prod-create__actions">
            <button class="vg-btn" type="button" @click="router.push('/production/tasks')">{{ t('production.create.viewTasks') }}</button>
            <button class="vg-btn vg-btn--primary" type="button" :disabled="submitting" @click="submit">
              <Loader v-if="submitting" :size="15" class="vg-spin" /><Rocket v-else :size="15" />
              {{ submitting ? t('production.create.creating') : t('production.create.submit') }}
            </button>
          </div>
        </div>
      </section>

      <aside class="vg-card vg-card--soft">
        <div class="vg-card__head">
          <span class="vg-card__title"><ClipboardList :size="16" /> {{ t('production.create.currentProduct') }}</span>
        </div>
        <dl class="vg-kv">
          <dt>{{ t('production.create.currentProduct') }}</dt>
          <dd>{{ selectedProduct?.name || t('production.create.noProduct') }}</dd>
          <dt>{{ t('production.create.currentTemplate') }}</dt>
          <dd>{{ selectedTemplate?.name || '-' }}</dd>
          <dt>{{ t('production.create.quantity') }}</dt>
          <dd class="vg-num">{{ form.count }}</dd>
          <dt>{{ t('production.create.outputDir') }}</dt>
          <dd class="vg-secondary">{{ form.outDir || '-' }}</dd>
        </dl>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.prod-create { width: min(1180px, 100%); margin: 0 auto; }
.prod-create__outdir { flex-wrap: nowrap; }
.prod-create__outdir .vg-input { flex: 1; }
.prod-create__feedback { font-size: 12px; color: var(--theme-text-secondary); }
.prod-create__actions { margin-left: auto; }
</style>
