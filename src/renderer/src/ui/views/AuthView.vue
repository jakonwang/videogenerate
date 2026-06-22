<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

onMounted(() => {
  void router.replace({ name: 'home' })
})
</script>

<template>
  <div class="auth-redirect"></div>
</template>

<style scoped>
.auth-redirect {
  width: 100%;
  height: 100%;
}
</style>
