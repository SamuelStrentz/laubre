<script setup lang="ts">
/**
 * Barres horizontales (une seule série, vert sapin) : libellé, barre, valeur.
 * Un appui sur une ligne la met en avant et affiche son détail.
 */
import { computed, ref } from 'vue'
import type { Barre } from '@/domain/individu'

const props = defineProps<{ titre: string; barres: Barre[]; unite?: string; decimales?: number }>()
const choisie = ref<number | null>(null)
const max = computed(() => Math.max(1, ...props.barres.map((b) => b.valeur)))
const format = (v: number) =>
  `${v.toLocaleString('fr-FR', { maximumFractionDigits: props.decimales ?? 0 })}${props.unite ? ` ${props.unite}` : ''}`
</script>

<template>
  <section class="carte graphe">
    <h3>{{ titre }}</h3>
    <p v-if="!barres.length" class="sans-donnees">Pas encore de données.</p>
    <ul v-else>
      <li
        v-for="(b, i) in barres"
        :key="b.libelle"
        :class="{ choisie: choisie === i, estompee: choisie !== null && choisie !== i }"
        @click="choisie = choisie === i ? null : i"
      >
        <span class="libelle">{{ b.libelle }}</span>
        <span class="g-piste" aria-hidden="true"><span class="g-barre" :style="{ width: `${(b.valeur / max) * 100}%` }"></span></span>
        <span class="valeur">{{ format(b.valeur) }}</span>
        <small v-if="b.detail && choisie === i" class="detail">{{ b.detail }}</small>
      </li>
    </ul>
    <table class="lecteur">
      <caption>{{ titre }}</caption>
      <tr v-for="b in barres" :key="b.libelle"><th>{{ b.libelle }}</th><td>{{ format(b.valeur) }}{{ b.detail ? ` (${b.detail})` : '' }}</td></tr>
    </table>
  </section>
</template>

<style scoped>
.graphe h3 {
  margin: 0 0 12px;
  font-size: 1.02rem;
  color: var(--sapin);
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}
li {
  display: grid;
  grid-template-columns: minmax(0, 38%) minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 30px;
  padding: 2px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
}
li.choisie {
  background: var(--accent-clair);
}
li.estompee {
  opacity: 0.55;
}
.libelle {
  font-size: 0.82rem;
  color: var(--texte);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.g-piste {
  height: 14px;
  display: flex;
  align-items: center;
}
.g-barre {
  display: block;
  height: 14px;
  min-width: 3px;
  border-radius: 0 4px 4px 0;
  background: var(--sapin);
  transition: width 0.4s ease;
}
.valeur {
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  color: #5e7a6b;
  white-space: nowrap;
}
.detail {
  grid-column: 1 / -1;
  font-size: 0.75rem;
  color: var(--discret);
  padding-bottom: 2px;
}
.sans-donnees {
  margin: 0;
  font-size: 0.85rem;
  color: var(--discret);
}
.lecteur {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
