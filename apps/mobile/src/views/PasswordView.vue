<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import { cloud, errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

const router = useRouter()
const form = reactive({ old: '', next: '', confirm: '' })
const saving = ref(false)
const error = ref('')

async function save() {
  error.value = ''
  if (form.next.length < 8) return (error.value = '新密码至少 8 位')
  if (form.next !== form.confirm) return (error.value = '两次输入的新密码不一样')
  saving.value = true
  try {
    await cloud.changePassword(form.old, form.next)
    toast('密码已修改')
    router.back()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PageHeader title="修改密码" back />
  <main class="m-page m-page--no-tabs">
    <form class="m-card m-card--pad form" @submit.prevent="save">
      <label class="m-field"><span class="m-field__label">当前密码</span><input v-model="form.old" class="m-input" type="password" autocomplete="current-password" /></label>
      <label class="m-field"><span class="m-field__label">新密码</span><input v-model="form.next" class="m-input" type="password" autocomplete="new-password" placeholder="至少 8 位" /></label>
      <label class="m-field"><span class="m-field__label">再输入一次</span><input v-model="form.confirm" class="m-input" type="password" autocomplete="new-password" /></label>
      <p v-if="error" class="m-notice m-notice--red">{{ error }}</p>
      <button type="submit" class="m-btn m-btn--primary m-btn--block" :disabled="saving || !form.old || !form.next">保存</button>
    </form>
    <p class="m-muted note">修改后，其它已登录的电脑和手机需要用新密码重新登录。</p>
  </main>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 14px; }
.note { margin: 12px 4px 0; font-size: 12px; }
</style>
