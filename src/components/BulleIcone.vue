<script setup lang="ts">
/** Silhouette homme / femme selon le dernier chiffre du niveau (0 = homme, 1 = femme). */
import { computed } from 'vue'
import { CHEMINS } from './Icone.vue'

const props = defineProps<{ niveau: string; taille?: number }>()
const chemin = computed(() => (props.niveau.endsWith('1') ? CHEMINS.femme : CHEMINS.homme))
</script>

<template>
  <svg
    :width="taille ?? 24"
    :height="taille ?? 24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="chemin" />
  </svg>
</template>
