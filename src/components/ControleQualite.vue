<script setup lang="ts">
/**
 * Liste des anomalies (informations manquantes, incohérences de dates).
 * Toucher une ligne ferme la liste et place l'individu au centre de l'arbre ;
 * une fois corrigée, l'anomalie disparaît d'elle-même (liste recalculée).
 */
import { computed } from 'vue'
import Icone from './Icone.vue'
import BulleIcone from './BulleIcone.vue'
import { useArbreStore } from '@/stores/arbre'
import { controlerDonnees, nombreProblemes } from '@/domain/controle'

defineProps<{ ouvert: boolean }>()
const emit = defineEmits<{ fermer: [] }>()
const store = useArbreStore()

const anomalies = computed(() => controlerDonnees(store.individus, store.visible))
const total = computed(() => nombreProblemes(anomalies.value))

function aller(niveau: string) {
  store.centre = niveau
  store.ecran = 'arbre'
  emit('fermer')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="controle">
      <div v-if="ouvert" class="voile-controle">
        <button class="voile" aria-label="Fermer" @click="emit('fermer')"></button>
        <article class="panneau-controle" role="dialog" aria-label="Contrôle des données">
          <header>
            <div>
              <h2>Contrôle des données</h2>
              <p>{{ total ? `${total} point${total > 1 ? 's' : ''} à vérifier · ${anomalies.length} individu${anomalies.length > 1 ? 's' : ''}` : 'Tout est en ordre' }}</p>
            </div>
            <button class="bouton-icone" aria-label="Fermer" @click="emit('fermer')"><Icone nom="fermer" /></button>
          </header>
          <p class="aide">
            Un événement sans objet (décès d'une personne vivante, pas de mariage…) se désactive avec sa pastille grise
            dans la fiche : il n'est alors plus signalé.
          </p>
          <ul v-if="anomalies.length" class="liste">
            <li v-for="a in anomalies" :key="a.id">
              <button type="button" class="anomalie" @click="aller(a.niveau)">
                <span class="avatar"><BulleIcone :niveau="a.niveau" :taille="20" /></span>
                <span class="corps">
                  <strong>{{ a.nom }} <code>{{ a.niveau }}</code></strong>
                  <span v-if="a.incoherences.length" class="pastilles">
                    <span v-for="x in a.incoherences" :key="x" class="etiquette alerte">{{ x }}</span>
                  </span>
                  <span v-if="a.manques.length" class="pastilles">
                    <span v-for="x in a.manques" :key="x" class="etiquette">{{ x }}</span>
                  </span>
                </span>
                <Icone nom="droite" :taille="18" />
              </button>
            </li>
          </ul>
          <p v-else class="bravo"><Icone nom="coche" :taille="22" /> Aucune information manquante.</p>
        </article>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.voile-controle {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  align-items: end;
}
.voile {
  position: absolute;
  inset: 0;
  background: rgb(24 48 38 / 26%);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.panneau-controle {
  position: relative;
  max-height: 88dvh;
  overflow-y: auto;
  padding: 18px 14px calc(var(--bas-sur) + 20px);
  border-radius: 24px 24px 0 0;
  background: #fbfaf6;
  box-shadow: var(--ombre-forte);
  display: grid;
  gap: 10px;
}
header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px;
}
h2 {
  font-size: 1.35rem;
  color: var(--sapin);
}
header p {
  margin: 2px 0 0;
  font-size: 0.85rem;
  color: var(--discret);
}
.aide {
  margin: 0 4px;
  line-height: 1.45;
}
.liste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.anomalie {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--bord);
  text-align: left;
  color: var(--sapin);
}
.anomalie:active {
  background: var(--accent-clair);
}
.avatar {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent-clair);
}
.corps {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px;
}
.corps strong {
  font-weight: 600;
  color: var(--texte);
}
.corps code {
  font-family: var(--mono);
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--discret);
  margin-left: 4px;
}
.pastilles {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.etiquette {
  font-size: 0.74rem;
  padding: 3px 8px;
  border-radius: 10px;
  background: #f1f5f2;
  color: #5e7a6b;
}
.etiquette.alerte {
  background: #fbeee0;
  color: #8a4b00;
}
.bravo {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 4px;
  color: var(--sapin);
  font-weight: 500;
}
.controle-enter-active,
.controle-leave-active {
  transition: opacity 0.2s ease;
}
.controle-enter-active .panneau-controle,
.controle-leave-active .panneau-controle {
  transition: transform 0.26s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.controle-enter-from,
.controle-leave-to {
  opacity: 0;
}
.controle-enter-from .panneau-controle,
.controle-leave-to .panneau-controle {
  transform: translateY(40%);
}
</style>
