<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import UiChip from '../components/UiChip.vue'

type Product = { id: string; name: string }
type Template = { id: string; name: string }

const router = useRouter()
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
  const outDir = await window.api.pickDir({ title: '选择输出目录' })
  if (outDir) form.outDir = outDir
}

async function submit() {
  feedback.value = ''
  if (!form.productId || !form.templateId || !String(form.outDir || '').trim()) {
    feedback.value = '请先选择商品、模板并设置输出目录。'
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
    feedback.value = `已创建 ${meta?.enqueued ?? 0} 个任务。`
    void router.push('/production/tasks')
  } catch (error: any) {
    feedback.value = String(error?.message ?? error ?? '任务创建失败')
  } finally {
    submitting.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="production-create-page">
    <section class="production-create-hero">
      <div class="production-create-hero__copy">
        <span class="production-create-hero__tag">生产 / 新建任务</span>
        <h1>从商品和模板发起任务</h1>
        <p>这里专门负责创建任务，不混入任务列表、日志和失败处理。</p>
      </div>
      <UiChip tone="neutral">{{ selectedProduct?.name || '未选择商品' }}</UiChip>
    </section>

    <section class="production-create-card">
      <div class="production-create-grid">
        <label class="production-field">
          <span>商品</span>
          <select v-model="form.productId" class="ui-select h-11">
            <option v-for="item in products" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>

        <label class="production-field">
          <span>模板</span>
          <select v-model="form.templateId" class="ui-select h-11">
            <option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>

        <label class="production-field">
          <span>数量</span>
          <input v-model.number="form.count" class="ui-input h-11" type="number" min="1" max="100" />
        </label>

        <label class="production-field production-field--outdir">
          <span>输出目录</span>
          <div class="production-outdir">
            <input v-model="form.outDir" class="ui-input h-11 min-w-0 flex-1" />
            <button class="app-ghost px-4 py-2 text-sm" @click="pickOutDir">选择目录</button>
          </div>
        </label>
      </div>

      <div class="production-summary">
        <div class="production-summary__item">
          <span>当前商品</span>
          <strong>{{ selectedProduct?.name || '-' }}</strong>
        </div>
        <div class="production-summary__item">
          <span>当前模板</span>
          <strong>{{ selectedTemplate?.name || '-' }}</strong>
        </div>
      </div>

      <div class="production-create-actions">
        <button class="app-primary px-5 py-3 text-sm" :disabled="submitting" @click="submit">
          {{ submitting ? '创建中...' : '创建任务' }}
        </button>
        <button class="app-ghost px-5 py-3 text-sm" @click="router.push('/production/tasks')">查看任务列表</button>
      </div>

      <p v-if="feedback" class="production-feedback">{{ feedback }}</p>
    </section>
  </div>
</template>

<style scoped>
.production-create-page {
  display: grid;
  gap: 14px;
}

.production-create-hero,
.production-create-card {
  border: 1px solid rgba(119, 137, 198, 0.14);
  background: rgba(10, 16, 29, 0.92);
  border-radius: 18px;
}

.production-create-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
}

.production-create-hero__copy {
  display: grid;
  gap: 6px;
}

.production-create-hero__tag {
  color: #8ea6ff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.production-create-hero__copy h1 {
  margin: 0;
  color: #f8fbff;
  font-size: 24px;
  font-weight: 800;
}

.production-create-hero__copy p,
.production-field span,
.production-summary__item span,
.production-feedback {
  margin: 0;
  color: #98a6c7;
  font-size: 12px;
}

.production-create-card {
  display: grid;
  gap: 18px;
  padding: 18px;
}

.production-create-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.production-field {
  display: grid;
  gap: 8px;
}

.production-field--outdir {
  grid-column: 1 / -1;
}

.production-outdir {
  display: flex;
  gap: 8px;
}

.production-summary {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.production-summary__item {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.025);
}

.production-summary__item strong {
  color: #eef3ff;
}

.production-create-actions {
  display: flex;
  gap: 10px;
}

@media (max-width: 860px) {
  .production-create-grid,
  .production-summary {
    grid-template-columns: 1fr;
  }

  .production-outdir,
  .production-create-actions,
  .production-create-hero {
    display: grid;
  }
}
</style>
