<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLink } from 'lucide-vue-next'

type InlineToken = {
  type: 'code' | 'link' | 'strong' | 'text'
  text: string
  href?: string
}

const props = defineProps<{
  text: string
  openLinkLabel: string
}>()

const emit = defineEmits<{
  openLink: [url: string]
}>()

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function trimBareUrl(value: string) {
  let url = value
  let suffix = ''
  while (/[.,;:!?)]$/.test(url)) {
    suffix = url.slice(-1) + suffix
    url = url.slice(0, -1)
  }
  return { url, suffix }
}

function parseInline(value: string) {
  const tokens: InlineToken[] = []
  const pattern = /(`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*\n]+\*\*|https?:\/\/[^\s<]+)/g
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ type: 'text', text: value.slice(cursor, index) })
    const raw = match[0]
    if (raw.startsWith('`')) {
      tokens.push({ type: 'code', text: raw.slice(1, -1) })
    } else if (raw.startsWith('**')) {
      tokens.push({ type: 'strong', text: raw.slice(2, -2) })
    } else if (raw.startsWith('[')) {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(raw)
      const href = safeHttpUrl(link?.[2] || '')
      tokens.push(href ? { type: 'link', text: link?.[1] || href, href } : { type: 'text', text: raw })
    } else {
      const { url, suffix } = trimBareUrl(raw)
      const href = safeHttpUrl(url)
      tokens.push(href ? { type: 'link', text: url, href } : { type: 'text', text: raw })
      if (suffix) tokens.push({ type: 'text', text: suffix })
    }
    cursor = index + raw.length
  }
  if (cursor < value.length) tokens.push({ type: 'text', text: value.slice(cursor) })
  return tokens
}

const tokens = computed(() => parseInline(String(props.text || '')))
</script>

<template>
  <template v-for="(token, index) in tokens" :key="`${index}-${token.type}`">
    <code v-if="token.type === 'code'" class="inline-code">{{ token.text }}</code>
    <strong v-else-if="token.type === 'strong'">{{ token.text }}</strong>
    <button
      v-else-if="token.type === 'link' && token.href"
      class="inline-link"
      type="button"
      :title="openLinkLabel"
      @click="emit('openLink', token.href)"
    >
      <span>{{ token.text }}</span><ExternalLink />
    </button>
    <template v-else>{{ token.text }}</template>
  </template>
</template>

<style scoped>
.inline-code {
  padding: 1px 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-soft);
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: .92em;
}

.inline-link {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 3px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
  vertical-align: baseline;
}

.inline-link span {
  overflow-wrap: anywhere;
}

.inline-link svg {
  width: 11px;
  height: 11px;
  flex: 0 0 auto;
}
</style>
