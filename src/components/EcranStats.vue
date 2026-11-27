<script setup lang="ts">
/** Statistiques en graphiques (requêtes du logiciel PC) : lieux, âges, générations, prénoms… */
import { onMounted, ref, watch } from 'vue'
import GraphBarres from './GraphBarres.vue'
import GraphColonnes from './GraphColonnes.vue'
import { api } from '@/db/client'
import { useUiStore } from '@/stores/ui'
import { useArbreStore } from '@/stores/arbre'
import type { StatsDetaillees } from '@/domain/individu'

const ui = useUiStore()
const store = useArbreStore()
const s = ref<StatsDetaillees | null>(null)

async function charger() {
  try {
    s.value = await api.statsDetaillees(store.belleFamille)
  } catch (e) {
    ui.erreur(e)
  }
}
onMounted(charger)
watch(() => store.belleFamille, charger)
</script>

<template>
  <section class="ecran-stats">
    <h1>Statistiques</h1>
    <p class="portee">{{ store.belleFamille ? 'Avec la belle-famille' : 'Sans la belle-famille (réglage dans Générations)' }}</p>
    <template v-if="s">
      <div class="tuiles">
        <div class="carte"><strong>{{ s.hommes }}</strong><span>hommes</span></div>
        <div class="carte"><strong>{{ s.femmes }}</strong><span>femmes</span></div>
      </div>
      <GraphBarres titre="Individus par génération" :barres="s.parGeneration" />
      <GraphBarres titre="Âge moyen au décès, par génération" :barres="s.ageDeces" unite="ans" :decimales="1" />
      <GraphBarres titre="Âge moyen au mariage" :barres="s.ageMariage" unite="ans" :decimales="1" />
      <GraphColonnes titre="Naissances par décennie" :barres="s.decennies" />
      <h2 class="section-titre">Lieux de naissance</h2>
      <GraphBarres titre="Par département" :barres="s.departements" />
      <GraphBarres titre="Par région (anciennes régions)" :barres="s.regions" />
      <GraphBarres titre="Par pays" :barres="s.pays" />
      <GraphBarres titre="Villes les plus fréquentes" :barres="s.villes" />
      <h2 class="section-titre">Noms</h2>
      <GraphBarres titre="Prénoms les plus fréquents" :barres="s.prenoms" />
      <GraphBarres titre="Noms de famille" :barres="s.noms" />
      <p class="astuce">Touchez une barre pour la mettre en avant.</p>
    </template>
  </section>
</template>

<style scoped>
.ecran-stats {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 32px;
  display: grid;
  align-content: start;
  gap: 12px;
}
h1 {
  font-size: 1.5rem;
  color: var(--sapin);
  margin: 4px 4px 0;
}
.portee {
  margin: -8px 4px 2px;
  font-size: 0.8rem;
  color: var(--discret);
}
.section-titre {
  font-family: var(--sans);
  color: var(--sapin);
  margin: 10px 4px 0;
}
.tuiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.tuiles .carte {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 14px 8px;
}
.tuiles strong {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 1.6rem;
  color: var(--sapin);
}
.tuiles span {
  font-size: 0.8rem;
  color: var(--discret);
}
.astuce {
  text-align: center;
  font-size: 0.78rem;
  color: var(--discret);
}
</style>
