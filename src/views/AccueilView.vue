<script setup lang="ts">
/**
 * Écran principal : trois écrans côte à côte (Générations · Arbre · Profil),
 * changés depuis la zone de swipe du bas. L'arbre s'ouvre toujours sur la souche.
 * Tant que l'arbre n'est pas prêt (pas de base, pas de souche) : initialisation.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icone from '@/components/Icone.vue'
import BarreEcrans from '@/components/BarreEcrans.vue'
import EcranArbre from '@/components/EcranArbre.vue'
import EcranGenerations from '@/components/EcranGenerations.vue'
import EcranProfil from '@/components/EcranProfil.vue'
import EcranStats from '@/components/EcranStats.vue'
import Recherche from '@/components/Recherche.vue'
import FicheIndividu from '@/components/FicheIndividu.vue'
import OptionsIndividu from '@/components/OptionsIndividu.vue'
import Initialisation from '@/components/Initialisation.vue'
import { useArbreStore, type Ecran } from '@/stores/arbre'
import { apresPanneau, retourHistorique } from '@/utils/panneaux'

const store = useArbreStore()
const router = useRouter()
const logo = `${import.meta.env.BASE_URL}icons/icon.svg`

const pret = computed(() => store.prete && store.aSouche)
const ecran = computed<Ecran>({ get: () => store.ecran, set: (e) => (store.ecran = e) })
const position = computed(() => ['generations', 'arbre', 'profil', 'stats'].indexOf(store.ecran))
const rechercheOuverte = ref(false)
const horsSouche = computed(() => !!store.centre && store.centre !== store.niveauSouche && store.parNiveau.has(store.centre))

// ------------------------------------------------------------ fiche flottante
const fiche = ref<string | null>(null)
const ficheDepuis = ref<Ecran>('arbre')

function ouvrirFiche(niveau: string, depuis: Ecran) {
  fiche.value = niveau
  ficheDepuis.value = depuis
  history.pushState({ fiche: true }, '') // le bouton retour d'Android ferme la fiche
}
function fermerFiche() {
  if (!fiche.value) return
  fiche.value = null
  retourHistorique()
}
function surRetour() {
  if (fiche.value) fiche.value = null
  if (options.value) options.value = null
}

// ------------------------------------------------- options (appui long)
const options = ref<string | null>(null)
const optionsDepuis = ref<Ecran>('arbre')

function ouvrirOptions(niveau: string, depuis: Ecran) {
  options.value = niveau
  optionsDepuis.value = depuis
  history.pushState({ options: true }, '')
}
function fermerOptions() {
  if (!options.value) return
  options.value = null
  retourHistorique()
}
async function optionsVersFiche(niveau: string) {
  fermerOptions()
  await apresPanneau()
  ouvrirFiche(niveau, optionsDepuis.value)
}
async function optionsVersModifier(id: number) {
  fermerOptions()
  await apresPanneau()
  router.push({ path: `/individu/${id}`, query: { depuis: optionsDepuis.value } })
}
window.addEventListener('popstate', surRetour)
onBeforeUnmount(() => window.removeEventListener('popstate', surRetour))

async function modifier(id: number) {
  const depuis = ficheDepuis.value
  fermerFiche()
  await apresPanneau()
  router.push({ path: `/individu/${id}`, query: { depuis } })
}

async function voirDansArbre(niveau: string) {
  fermerFiche()
  store.centre = niveau
  store.ecran = 'arbre'
}

function ajouter(niveau: string, depuis: Ecran) {
  router.push({ path: '/individu/nouveau', query: { ...(niveau ? { niveau } : {}), depuis } })
}

function revenirSouche() {
  store.centre = store.niveauSouche
}

// L'arbre repart de la souche à chaque ouverture de l'appli
watch(
  pret,
  (ok) => {
    if (ok && !store.centre) store.centre = store.niveauSouche
  },
  { immediate: true },
)
</script>

<template>
  <Initialisation v-if="!pret" />
  <div v-else class="accueil">
    <header class="entete">
      <img :src="logo" alt="" width="30" height="30" />
      <span class="marque" :class="{ cachee: rechercheOuverte }">Laubre</span>
      <Recherche @ouverte="(o) => (rechercheOuverte = o)" />
      <Transition name="fondu">
        <button v-if="ecran === 'arbre' && horsSouche && !rechercheOuverte" class="souche" @click="revenirSouche">
          <Icone nom="souche" :taille="14" /> Souche
        </button>
      </Transition>
    </header>

    <div class="fenetre">
      <div class="rail" :style="{ transform: `translateX(${-position * 100}%)` }">
        <div class="panneau" :inert="ecran !== 'generations'">
          <EcranGenerations
            @fiche="(n) => ouvrirFiche(n, 'generations')"
            @ajouter="(n) => ajouter(n, 'generations')"
            @options="(n) => ouvrirOptions(n, 'generations')"
          />
        </div>
        <div class="panneau" :inert="ecran !== 'arbre'">
          <EcranArbre
            @fiche="(n) => ouvrirFiche(n, 'arbre')"
            @ajouter="(n) => ajouter(n, 'arbre')"
            @options="(n) => ouvrirOptions(n, 'arbre')"
          />
        </div>
        <div class="panneau" :inert="ecran !== 'profil'">
          <EcranProfil />
        </div>
        <div class="panneau" :inert="ecran !== 'stats'">
          <EcranStats v-if="ecran === 'stats'" />
        </div>
      </div>
    </div>

    <BarreEcrans v-model="ecran" />

    <FicheIndividu
      :niveau="fiche"
      :voir-arbre="ficheDepuis === 'generations'"
      @fermer="fermerFiche"
      @modifier="modifier"
      @arbre="voirDansArbre"
    />
    <OptionsIndividu :niveau="options" @fermer="fermerOptions" @fiche="optionsVersFiche" @modifier="optionsVersModifier" />
  </div>
</template>

<style scoped>
.accueil {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.entete {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: calc(var(--haut-sur) + 12px) 20px 6px;
}
.marque {
  flex: none;
  max-width: 120px;
  overflow: hidden;
  transition: max-width 0.25s ease, opacity 0.2s;
  font-family: var(--serif);
  font-size: 1.4rem;
  font-weight: 500;
  color: var(--sapin);
  letter-spacing: 0.01em;
}
.marque.cachee {
  max-width: 0;
  opacity: 0;
}
.souche {
  flex: none;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 18px;
  border: 1px solid #cfddd4;
  background: #fff;
  color: var(--sapin);
  font-size: 0.82rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.fenetre {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.rail {
  height: 100%;
  display: flex;
  transition: transform 0.38s cubic-bezier(0.3, 0.8, 0.3, 1);
}
.panneau {
  flex: 0 0 100%;
  height: 100%;
  min-width: 0;
}
.fondu-enter-active,
.fondu-leave-active {
  transition: opacity 0.2s;
}
.fondu-enter-from,
.fondu-leave-to {
  opacity: 0;
}
</style>
