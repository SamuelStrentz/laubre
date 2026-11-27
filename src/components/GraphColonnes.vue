<script setup lang="ts">
/** Colonnes verticales (évolution : naissances par décennie). Appui sur une colonne = sa valeur. */
import { computed, ref } from 'vue'
import type { Barre } from '@/domain/individu'

const props = defineProps<{ titre: string; barres: Barre[] }>()
const choisie = ref<number | null>(null)
const max = computed(() => Math.max(1, ...props.barres.map((b) => b.valeur)))
/** Un libellé sur n pour éviter les chevauchements. */
const pas = computed(() => Math.max(1, Math.ceil(props.barres.length / 6)))
</script>

<template>
  <section class="carte graphe">
    <h3>{{ titre }}</h3>
    <p v-if="!barres.length" class="sans-donnees">Pas encore de données.</p>
    <template v-else>
      <p class="info">
        <template v-if="choisie !== null">{{ barres[choisie].libelle }} : <strong>{{ barres[choisie].valeur }}</strong></template>
        <template v-else>Touchez une colonne</template>
      </p>
      <div class="colonnes" :style="{ gridTemplateColumns: `repeat(${barres.length}, minmax(0, 1fr))` }">
        <button
          v-for="(b, i) in barres"
          :key="b.libelle"
          type="button"
          :aria-label="`${b.libelle} : ${b.valeur}`"
          :class="{ choisie: choisie === i, estompee: choisie !== null && choisie !== i }"
          @click="choisie = choisie === i ? null : i"
        >
          <span class="col" :style="{ height: `${(b.valeur / max) * 100}%` }"></span>
        </button>
      </div>
      <div class="axe" :style="{ gridTemplateColumns: `repeat(${barres.length}, minmax(0, 1fr))` }">
        <span v-for="(b, i) in barres" :key="b.libelle">{{ i % pas === 0 ? b.libelle : '' }}</span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.graphe h3 {
  margin: 0 0 4px;
  font-size: 1.02rem;
  color: var(--sapin);
}
.info {
  margin: 0 0 8px;
  min-height: 1.2em;
  font-size: 0.8rem;
  color: var(--discret);
}
.info strong {
  color: var(--sapin);
}
.colonnes {
  height: 120px;
  display: grid;
  gap: 2px;
  align-items: end;
  border-bottom: 1px solid var(--bord);
}
.colonnes button {
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  transition: opacity 0.15s;
}
.colonnes button.estompee {
  opacity: 0.5;
}
.col {
  width: min(100%, 22px);
  min-height: 3px;
  border-radius: 4px 4px 0 0;
  background: var(--sapin);
}
.choisie .col {
  background: #2d6a4f;
}
.axe {
  display: grid;
  gap: 2px;
  margin-top: 4px;
}
.axe span {
  font-size: 0.66rem;
  color: var(--discret);
  white-space: nowrap;
  overflow: visible;
}
.sans-donnees {
  margin: 0;
  font-size: 0.85rem;
  color: var(--discret);
}
</style>
