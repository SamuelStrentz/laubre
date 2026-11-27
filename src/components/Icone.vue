<script setup lang="ts">
/** Icônes au trait (SVG inline, aucune dépendance). */
defineProps<{ nom: keyof typeof CHEMINS; taille?: number }>()
</script>

<script lang="ts">
export const CHEMINS = {
  plus: 'M12 5v14M5 12h14',
  retour: 'M15 18l-6-6 6-6',
  fermer: 'M6 6l12 12M18 6L6 18',
  bas: 'M12 5v14M6 13l6 6 6-6',
  souche: 'M12 3v14M7 21h10M9 17h6',
  homme: 'M12 11.6a3.6 3.6 0 100-7.2 3.6 3.6 0 000 7.2zM5 20c0-3.9 3.1-6.4 7-6.4s7 2.5 7 6.4',
  femme: 'M12 11.6a3.6 3.6 0 100-7.2 3.6 3.6 0 000 7.2zM8.2 9.5c-.4 2.6-1.3 3.6-2.2 4.3M15.8 9.5c.4 2.6 1.3 3.6 2.2 4.3M5 20c0-3.6 2.6-5.9 7-5.9s7 2.3 7 5.9',
  importer: 'M12 15V4M7 9l5-5 5 5M5 20h14',
  telecharger: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  corbeille: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  installer: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  coche: 'M5 12l5 5 9-10',
  chevron: 'M6 9l6 6 6-6',
  dossier: 'M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1z',
  synchro: 'M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5',
  crayon: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  arbre: 'M12 3l5 6h-3l4 5h-3l4 5H5l4-5H6l4-5H7zM12 19v3',
  partager: 'M12 3v13M7 8l5-5 5 5M5 14v6h14v-6',
  base: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
} as const
</script>

<template>
  <svg
    :width="taille ?? 24"
    :height="taille ?? 24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="CHEMINS[nom]" />
  </svg>
</template>
