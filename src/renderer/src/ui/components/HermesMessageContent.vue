<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy } from 'lucide-vue-next'
import HermesInlineContent from './HermesInlineContent.vue'

type MessageBlock =
  | { type: 'code'; language: string; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'rule' }
  | { type: 'table'; headers: string[]; rows: string[][] }

const props = defineProps<{
  text: string
  copyLabel: string
  copiedLabel: string
  openLinkLabel: string
}>()

const emit = defineEmits<{
  error: [message: string]
  openLink: [url: string]
}>()

const copiedBlock = ref(-1)

function splitTableRow(value: string) {
  return value.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isTableDivider(value: string) {
  const cells = splitTableRow(value)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
}

function isBlockStart(lines: string[], index: number) {
  const line = lines[index] || ''
  return /^\s*```/.test(line)
    || /^\s{0,3}#{1,4}\s+/.test(line)
    || /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)
    || /^\s*>\s?/.test(line)
    || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
    || (line.includes('|') && isTableDivider(lines[index + 1] || ''))
}

function parseBlocks(value: string) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n')
  const blocks: MessageBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = /^\s*```([^\s`]*)\s*$/.exec(line)
    if (fence) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language: fence[1] || '', text: code.join('\n') })
      continue
    }

    const heading = /^\s{0,3}(#{1,4})\s+(.+)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() })
      index += 1
      continue
    }

    if (line.includes('|') && isTableDivider(lines[index + 1] || '')) {
      const headers = splitTableRow(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    const listItem = /^\s*(?:(\d+)[.)]|[-*+])\s+(.+)$/.exec(line)
    if (listItem) {
      const ordered = Boolean(listItem[1])
      const items: string[] = []
      while (index < lines.length) {
        const match = /^\s*(?:(\d+)[.)]|[-*+])\s+(.+)$/.exec(lines[index])
        if (!match || Boolean(match[1]) !== ordered) break
        items.push(match[2].trim())
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', text: quote.join('\n') })
      continue
    }

    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') })
  }
  return blocks
}

async function copyCode(index: number, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedBlock.value = index
    window.setTimeout(() => {
      if (copiedBlock.value === index) copiedBlock.value = -1
    }, 1500)
  } catch (error) {
    emit('error', String((error as Error)?.message || error))
  }
}

const blocks = computed(() => parseBlocks(props.text))
</script>

<template>
  <div class="hermes-message-content">
    <template v-for="(block, index) in blocks" :key="index">
      <component :is="`h${Math.min(4, Math.max(2, block.level + 1))}`" v-if="block.type === 'heading'">
        <HermesInlineContent :text="block.text" :open-link-label="openLinkLabel" @open-link="emit('openLink', $event)" />
      </component>
      <component :is="block.ordered ? 'ol' : 'ul'" v-else-if="block.type === 'list'">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          <HermesInlineContent :text="item" :open-link-label="openLinkLabel" @open-link="emit('openLink', $event)" />
        </li>
      </component>
      <blockquote v-else-if="block.type === 'quote'">
        <HermesInlineContent :text="block.text" :open-link-label="openLinkLabel" @open-link="emit('openLink', $event)" />
      </blockquote>
      <hr v-else-if="block.type === 'rule'" />
      <div v-else-if="block.type === 'table'" class="message-table-wrap">
        <table>
          <thead><tr><th v-for="(cell, cellIndex) in block.headers" :key="cellIndex"><HermesInlineContent :text="cell" :open-link-label="openLinkLabel" @open-link="emit('openLink', $event)" /></th></tr></thead>
          <tbody><tr v-for="(row, rowIndex) in block.rows" :key="rowIndex"><td v-for="(cell, cellIndex) in row" :key="cellIndex"><HermesInlineContent :text="cell" :open-link-label="openLinkLabel" @open-link="emit('openLink', $event)" /></td></tr></tbody>
        </table>
      </div>
      <section v-else-if="block.type === 'code'" class="message-code-block">
        <header><span>{{ block.language || 'text' }}</span><button type="button" :title="copiedBlock === index ? copiedLabel : copyLabel" @click="copyCode(index, block.text)"><Check v-if="copiedBlock === index" /><Copy v-else />{{ copiedBlock === index ? copiedLabel : copyLabel }}</button></header>
        <pre><code>{{ block.text }}</code></pre>
      </section>
      <p v-else>
        <HermesInlineContent :text="block.text" :open-link-label="openLinkLabel" @open-link="emit('openLink', $event)" />
      </p>
    </template>
  </div>
</template>

<style scoped>
.hermes-message-content {
  display: grid;
  min-width: 0;
  gap: 8px;
  margin-top: 3px;
  color: inherit;
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.hermes-message-content :is(p, h2, h3, h4, h5, blockquote, ul, ol) {
  margin: 0;
}

.hermes-message-content :is(h2, h3, h4, h5) {
  font-size: 13px;
  line-height: 1.45;
  letter-spacing: 0;
}

.hermes-message-content :is(ul, ol) {
  display: grid;
  gap: 3px;
  padding-left: 20px;
}

.hermes-message-content ul {
  list-style: disc;
}

.hermes-message-content ol {
  list-style: decimal;
}

.hermes-message-content blockquote {
  padding: 6px 9px;
  border-left: 2px solid var(--accent);
  background: var(--surface-soft);
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.hermes-message-content hr {
  width: 100%;
  margin: 2px 0;
  border: 0;
  border-top: 1px solid var(--border);
}

.message-code-block {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-soft) 72%, black 4%);
}

.message-code-block > header {
  display: flex;
  min-height: 30px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 7px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 10px;
}

.message-code-block button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 5px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
}

.message-code-block button:hover {
  background: var(--theme-control-hover);
}

.message-code-block button svg {
  width: 12px;
  height: 12px;
}

.message-code-block pre {
  max-width: 100%;
  margin: 0;
  overflow: auto;
  padding: 10px;
}

.message-code-block code {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre;
}

.message-table-wrap {
  max-width: 100%;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.message-table-wrap table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.message-table-wrap :is(th, td) {
  padding: 6px 8px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.message-table-wrap th {
  background: var(--surface-soft);
  color: var(--text-secondary);
}
</style>
