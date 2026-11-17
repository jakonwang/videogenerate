<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LoaderCircle, Sparkles, Trash2 } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncModel } from '@shared/cloud/sync'
import GenerationTile from '@/components/GenerationTile.vue'
import ImageGrid from '@/components/ImageGrid.vue'
import PageHeader from '@/components/PageHeader.vue'
import { approve, generateModelImage, useGenerations } from '@/lib/generate'
import { errorMessage } from '@/lib/session'
import { deleteRecord, getRecord, newId, saveRecord } from '@/lib/sync'
import { toast } from '@/lib/toast'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const id = isNew ? newId('model') : String(route.params.id)

const form = reactive<SyncModel>({ name: '', gender: '', ageRange: '', style: '', description: '', tags: [], images: [], coverFileId: undefined, createdAt: Date.now() })
const tagsText = ref('')
const loaded = ref(isNew)
const missing = ref(false)
const canSave = computed(() => form.name.trim().length > 0)
const genders = ['女', '男']
const ages = ['18-24', '25-30', '31-40', '40+']

onMounted(async () => {
  if (isNew) return
  const record = await getRecord<SyncModel>(SYNC_COLLECTIONS.models, id)
  if (!record?.data || record.deleted) {
    missing.value = true
  } else {
    Object.assign(form, { tags: [], ...record.data, images: record.data.images || [] })
    tagsText.value = (record.data.tags || []).join(' ')
  }
  loaded.value = true
})

const aiResults = useGenerations((item) => item.purpose === 'model' && item.modelId === id && item.review !== 'rejected')
const generating = ref(false)

async function generateAi() {
  if (!form.gender) return toast('先选性别')
  generating.value = true
  try {
    // 先把当前资料存下来，结果通过后要加进这个模特
    await saveRecord(SYNC_COLLECTIONS.models, id, buildData())
    await generateModelImage({ modelId: id, model: { ...form, name: form.name.trim() || '新模特' } })
    toast('已开始生成，约 1 分钟，点结果可审核')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    generating.value = false
  }
}

async function useResult(item: (typeof aiResults.value)[number]) {
  if (item.status !== 'succeeded' || !item.outputFileId) return router.push(`/review?focus=${item.id}`)
  if (item.review === 'approved') return
  await approve(item)
  if (!form.images.some((image) => image.fileId === item.outputFileId)) form.images.push({ fileId: item.outputFileId, mime: item.outputMime || 'image/png' })
  form.coverFileId ||= item.outputFileId
  toast('已加进形象照片')
}

function buildData(): SyncModel {
  return {
    ...form,
    name: form.name.trim() || '新模特',
    description: form.description?.trim() || '',
    tags: tagsText.value.split(/[\s,，#]+/).map((value) => value.trim()).filter(Boolean),
    coverFileId: form.coverFileId || form.images[0]?.fileId,
  }
}

async function save() {
  if (!canSave.value) {
    toast('请填写模特名称')
    return
  }
  const data: SyncModel = {
    ...form,
    name: form.name.trim(),
    description: form.description?.trim() || '',
    tags: tagsText.value.split(/[\s,，#]+/).map((value) => value.trim()).filter(Boolean),
    coverFileId: form.coverFileId || form.images[0]?.fileId,
  }
  await saveRecord(SYNC_COLLECTIONS.models, id, data)
  toast(isNew ? '模特已创建' : '已保存')
  router.back()
}

async function remove() {
  if (!window.confirm(`删除模特「${form.name}」？电脑端也会同步删除。`)) return
  await deleteRecord(SYNC_COLLECTIONS.models, id)
  toast('已删除')
  router.back()
}
</script>

<template>
  <PageHeader :title="isNew ? '新建模特' : '编辑模特'" back="/library?tab=models">
    <template v-if="!isNew && !missing" #actions>
      <button type="button" class="m-icon-btn" aria-label="删除模特" @click="remove"><Trash2 :size="20" /></button>
    </template>
  </PageHeader>

  <main v-if="loaded" class="m-page m-page--no-tabs">
    <div v-if="missing" class="m-empty">
      <span class="m-empty__title">模特不存在</span>
      <span class="m-empty__text">可能已在其他设备上删除</span>
    </div>
    <template v-else>
      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">形象照片</h2><span class="m-muted hint">{{ form.images.length }} 张</span></div>
        <ImageGrid v-model:images="form.images" v-model:cover="form.coverFileId" aspect="3 / 4" />
        <p class="m-muted hint tip">正脸、半身、全身各一张效果最好，生成视频时用来保持人物一致</p>
      </section>

      <section class="m-section ai m-card m-card--pad">
        <div class="ai__head">
          <span><strong>AI 生成形象</strong><small>按下面的性别、年龄、风格生成一张多角度形象图</small></span>
          <button type="button" class="m-btn m-btn--sm m-btn--primary" :disabled="generating" @click="generateAi">
            <LoaderCircle v-if="generating" :size="14" class="m-spin" /><Sparkles v-else :size="14" /> 生成
          </button>
        </div>
        <div v-if="aiResults.length" class="ai__grid">
          <div v-for="item in aiResults.slice(0, 6)" :key="item.id" class="ai__item">
            <GenerationTile :item="item" @click="useResult(item)" />
            <span class="ai__state">{{ item.review === 'approved' ? '已加入' : item.status === 'succeeded' ? '点击加入' : '' }}</span>
          </div>
        </div>
      </section>

      <section class="m-section">
        <label class="m-field">
          <span class="m-field__label">名称</span>
          <input v-model="form.name" class="m-input" type="text" maxlength="40" placeholder="例如：欧美金发女模 A" />
        </label>
        <div class="row">
          <div class="m-field">
            <span class="m-field__label">性别</span>
            <div class="chips">
              <button v-for="g in genders" :key="g" type="button" class="m-chip" :class="{ 'is-active': form.gender === g }" @click="form.gender = form.gender === g ? '' : g">{{ g }}</button>
            </div>
          </div>
          <div class="m-field">
            <span class="m-field__label">年龄段</span>
            <div class="chips">
              <button v-for="a in ages" :key="a" type="button" class="m-chip" :class="{ 'is-active': form.ageRange === a }" @click="form.ageRange = form.ageRange === a ? '' : a">{{ a }}</button>
            </div>
          </div>
        </div>
        <label class="m-field">
          <span class="m-field__label">风格</span>
          <input v-model="form.style" class="m-input" type="text" maxlength="40" placeholder="例如：轻奢、甜美、街头" />
        </label>
        <label class="m-field">
          <span class="m-field__label">外貌描述</span>
          <textarea v-model="form.description" class="m-textarea" maxlength="500" placeholder="发型、肤色、气质等，生成时作为参考，选填" />
        </label>
        <label class="m-field">
          <span class="m-field__label">标签</span>
          <input v-model="tagsText" class="m-input" type="text" placeholder="用空格分隔，例如：欧美 长发" />
        </label>
      </section>
    </template>
  </main>

  <div v-if="loaded && !missing" class="m-footer-bar">
    <button type="button" class="m-btn" @click="router.back()">取消</button>
    <button type="button" class="m-btn m-btn--primary" :disabled="!canSave" @click="save">{{ isNew ? '创建模特' : '保存' }}</button>
  </div>
</template>

<style scoped>
.hint { font-size: 12px; }
.tip { margin: 10px 2px 0; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.row { display: grid; gap: 0; }
.ai { display: flex; flex-direction: column; gap: 12px; }
.ai__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ai__head span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ai__head small { color: var(--theme-text-muted); font-size: 12px; }
.ai__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ai__item { display: flex; flex-direction: column; gap: 4px; }
.ai__state { color: var(--m-accent-2); font-size: 11px; text-align: center; min-height: 14px; }
</style>
