<script setup lang="ts">
import { Check } from 'lucide-vue-next'

/** One image in a product-material gallery: thumbnail, select box, hover tools and a body slot. */
defineProps<{
  src: string
  title: string
  selected: boolean
  flag?: string
  flagTone?: 'ok' | 'warn' | 'muted'
}>()

defineEmits<{
  toggle: []
  preview: []
}>()
</script>

<template>
  <article class="pm-tile" :class="{ 'is-on': selected }">
    <div class="pm-tile__media">
      <button class="pm-tile__img" type="button" @click="$emit('preview')">
        <img :src="src" alt="" loading="lazy" decoding="async" />
      </button>
      <button class="pm-tile__check" type="button" :aria-pressed="selected" @click.stop="$emit('toggle')">
        <Check v-if="selected" :size="12" :stroke-width="3" />
      </button>
      <span v-if="flag" class="pm-tile__flag" :class="`pm-tile__flag--${flagTone || 'ok'}`">{{ flag }}</span>
      <div class="pm-tile__tools"><slot name="tools" /></div>
    </div>
    <div class="pm-tile__body">
      <div class="pm-tile__title">
        <strong>{{ title }}</strong>
        <slot name="aside" />
      </div>
      <slot />
    </div>
  </article>
</template>
