<script setup lang="ts">
/**
 * Import GEDCOM en deux temps : on choisit qui est la souche dans le fichier,
 * on voit ce qui sera ajouté (seulement les nouveaux), puis on confirme.
 * La version de l'appli prévaut toujours ; les écarts de dates sont ignorés.
 */
import { computed, ref, watch } from 'vue'
import Icone from './Icone.vue'
import { useArbreStore } from '@/stores/arbre'
import { useUiStore } from '@/stores/ui'
import { normaliserTexte } from '@/domain/departements'
import { nomPersonne, planifierImport, trouverSouche, type Gedcom, type ImportPlan } from '@/domain/gedcom'

const props = defineProps<{ ged: Gedcom | null; nomFichier: string }>()
const emit = defineEmits<{ fermer: [] }>()
const store = useArbreStore()
const ui = useUiStore()

const souche = ref<string | null>(null)
const recherche = ref('')
const enCours = ref(false)
const voirDetail = ref(false)

watch(
  () => props.ged,
  (g) => {
    souche.value = g ? trouverSouche(g, store.souche) : null
    recherche.value = ''
    voirDetail.value = false
  },
  { immediate: true },
)

const personnes = computed(() => (props.ged ? [...props.ged.personnes.values()] : []))
const candidats = computed(() => {
  const mots = normaliserTexte(recherche.value).split(' ').filter(Boolean)
  if (!mots.length) return []
  return personnes.value.filter((p) => mots.every((m) => normaliserTexte(nomPersonne(p)).includes(m))).slice(0, 6)
})
const personneSouche = computed(() => (souche.value ? props.ged?.personnes.get(souche.value) ?? null : null))

const plan = computed<ImportPlan | null>(() => {
  if (!props.ged || !souche.value) return null
  try {
    return planifierImport(props.ged, souche.value, store.individus, store.niveauSouche)
  } catch {
    return null
  }
})
const conflits = computed(() => plan.value?.dejaPresents.filter((d) => !d.memeNom) ?? [])

async function importer() {
  if (!plan.value?.aAjouter.length) return
  enCours.value = true
  try {
    const n = await store.ajouterLot(plan.value.aAjouter.map((a) => ({ saisie: a.saisie })))
    ui.toast(`${n} individu${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} depuis le GEDCOM`)
    emit('fermer')
  } catch (e) {
    ui.erreur(e)
  } finally {
    enCours.value = false
  }
}
</script>

<template>
  <!-- hors du rail des écrans (transformé) pour que « position: fixed » vise bien l'écran -->
  <Teleport to="body">
  <Transition name="fiche">
    <div v-if="ged" class="voile-import">
      <button class="voile" aria-label="Fermer" @click="emit('fermer')"></button>
      <article class="panneau-import" role="dialog" aria-label="Import GEDCOM">
        <header>
          <h2>Import GEDCOM</h2>
          <button class="bouton-icone" aria-label="Fermer" @click="emit('fermer')"><Icone nom="fermer" /></button>
        </header>
        <p class="aide">{{ nomFichier }} · {{ ged.personnes.size }} individus{{ ged.logiciel ? ` · ${ged.logiciel}` : '' }}</p>

        <h3>1. Vous, dans ce fichier</h3>
        <p v-if="personneSouche" class="choisi">
          <Icone nom="coche" :taille="18" /> {{ nomPersonne(personneSouche) }}
          <small v-if="personneSouche.naissance?.date">· {{ personneSouche.naissance.date }}</small>
        </p>
        <p v-else class="aide">Souche introuvable automatiquement : cherchez-vous dans la liste.</p>
        <label class="champ">
          <span>{{ personneSouche ? 'Ce n\'est pas vous ? Chercher' : 'Chercher' }}</span>
          <input v-model="recherche" type="search" placeholder="Prénom, nom" autocomplete="off" />
        </label>
        <ul v-if="candidats.length" class="candidats">
          <li v-for="p in candidats" :key="p.id">
            <button type="button" @click="(souche = p.id), (recherche = '')">
              <strong>{{ nomPersonne(p) }}</strong><small>{{ p.naissance?.date || '' }}</small>
            </button>
          </li>
        </ul>

        <template v-if="plan">
          <h3>2. Ce qui va se passer</h3>
          <ul class="bilan">
            <li><strong>{{ plan.aAjouter.length }}</strong> nouveaux individus ajoutés</li>
            <li><strong>{{ plan.dejaPresents.length }}</strong> déjà dans l'appli : gardés tels quels (dates du fichier ignorées)</li>
            <li v-if="conflits.length" class="attention">
              <strong>{{ conflits.length }}</strong> place{{ conflits.length > 1 ? 's' : '' }} déjà occupée{{ conflits.length > 1 ? 's' : '' }} par un autre nom : la version de l'appli est gardée
            </li>
            <li><strong>{{ plan.horsLignee }}</strong> hors de votre lignée (frères, enfants, cousins…) : non importés</li>
          </ul>
          <button v-if="plan.aAjouter.length" type="button" class="lien" @click="voirDetail = !voirDetail">
            {{ voirDetail ? 'Masquer le détail' : 'Voir le détail' }}
          </button>
          <ul v-if="voirDetail" class="detail">
            <li v-for="a in plan.aAjouter" :key="a.niveau"><code>{{ a.niveau }}</code> {{ a.nom }}</li>
            <li v-for="c in conflits" :key="'c' + c.niveau" class="attention">
              <code>{{ c.niveau }}</code> fichier : {{ c.nomFichier }} · appli : {{ c.nomAppli }} (gardé)
            </li>
          </ul>
          <button class="btn btn-principal btn-large" :disabled="enCours || !plan.aAjouter.length" @click="importer">
            <Icone nom="importer" :taille="20" />
            {{ plan.aAjouter.length ? `Ajouter ${plan.aAjouter.length} individu${plan.aAjouter.length > 1 ? 's' : ''}` : 'Rien de nouveau à ajouter' }}
          </button>
        </template>
      </article>
    </div>
  </Transition>
  </Teleport>
</template>

<style scoped>
.voile-import {
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
.panneau-import {
  position: relative;
  max-height: 90dvh;
  overflow-y: auto;
  padding: 18px 18px calc(var(--bas-sur) + 20px);
  border-radius: 24px 24px 0 0;
  background: #fbfaf6;
  box-shadow: var(--ombre-forte);
  display: grid;
  gap: 10px;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h2 {
  font-size: 1.35rem;
  color: var(--sapin);
}
h3 {
  margin: 8px 0 0;
  font-family: var(--sans);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sapin);
}
.aide {
  margin: 0;
}
.choisi {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--sapin);
}
.choisi small {
  font-weight: 400;
  color: var(--discret);
}
.champ {
  margin-bottom: 0;
}
.candidats,
.bilan,
.detail {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.candidats button {
  width: 100%;
  min-height: 44px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  padding: 0 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--bord);
  text-align: left;
}
.candidats small {
  color: var(--discret);
}
.bilan li {
  font-size: 0.9rem;
  line-height: 1.4;
}
.bilan strong {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 1.1rem;
  color: var(--sapin);
}
.attention {
  color: #8a5a00;
}
.detail {
  max-height: 200px;
  overflow-y: auto;
  padding: 10px;
  border-radius: 12px;
  background: var(--accent-clair);
  font-size: 0.82rem;
}
.detail code {
  font-family: var(--mono);
  color: var(--sapin);
  margin-right: 6px;
}
.lien {
  justify-self: start;
  min-height: 36px;
  color: var(--sapin);
  font-size: 0.85rem;
  text-decoration: underline;
}
.fiche-enter-active,
.fiche-leave-active {
  transition: opacity 0.2s ease;
}
.fiche-enter-active .panneau-import {
  animation: monte 0.28s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.fiche-enter-from,
.fiche-leave-to {
  opacity: 0;
}
@keyframes monte {
  from {
    transform: translateY(40%);
  }
}
</style>
