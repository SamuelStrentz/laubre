<script setup lang="ts">
/**
 * Première ouverture, en trois étapes :
 *   1. la base de données : créer un nouvel arbre ou ouvrir un .db existant ;
 *   2. son emplacement : le dossier du téléphone où l'arbre est copié (sous-dossier « db ») ;
 *   3. le premier individu : la souche (vous).
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icone from './Icone.vue'
import { useArbreStore } from '@/stores/arbre'
import { useDossierStore } from '@/stores/dossier'
import { useUiStore } from '@/stores/ui'

const store = useArbreStore()
const dossier = useDossierStore()
const ui = useUiStore()
const router = useRouter()
const logo = `${import.meta.env.BASE_URL}icons/icon.svg`

const nom = ref('arbre')
const occupe = ref(false)
const fichier = ref<HTMLInputElement>()
const dossierPasse = ref(false)

const baseFaite = computed(() => store.prete)
const dossierFait = computed(() => dossier.etat === 'pret' || dossier.etat === 'non-supporte' || dossierPasse.value)
/** Bases du dossier qu'on peut ouvrir directement. */
const basesDuDossier = computed(() => (dossier.etat === 'pret' ? dossier.fichiers : []))

async function agir(fn: () => Promise<unknown>, ok?: string) {
  occupe.value = true
  try {
    await fn()
    if (ok) ui.toast(ok)
  } catch (e) {
    if ((e as Error).name !== 'AbortError') ui.erreur(e)
  } finally {
    occupe.value = false
  }
}

const creer = () => agir(() => store.creer(nom.value || 'arbre'), 'Base créée')

async function importer(e: Event) {
  const champ = e.target as HTMLInputElement
  const f = champ.files?.[0]
  champ.value = ''
  if (f) await agir(() => store.importer(f), `Base « ${f.name} » ouverte`)
}

function creerSouche() {
  router.push({ path: '/individu/nouveau', query: { niveau: '0' } })
}
</script>

<template>
  <main class="initialisation">
    <div class="intro">
      <img :src="logo" alt="" width="88" height="88" />
      <h1>Laubre</h1>
      <p>Votre arbre généalogique, dans votre poche. Trois étapes pour le planter.</p>
    </div>

    <!-- 1. Base -->
    <section class="carte etape" :class="{ faite: baseFaite }">
      <header>
        <span class="numero">{{ baseFaite ? '✓' : '1' }}</span>
        <h2>La base de données</h2>
      </header>
      <template v-if="baseFaite">
        <p class="aide">Base « {{ store.nomBase }} » ouverte{{ store.stockage?.persistant ? '' : ' (stockage temporaire)' }}.</p>
      </template>
      <template v-else>
        <p class="aide">Même structure que le logiciel PC : la base s'ouvre aussi dans DB Browser for SQLite.</p>
        <label class="champ">
          <span>Nom de l'arbre</span>
          <input v-model="nom" autocapitalize="off" autocomplete="off" />
        </label>
        <button class="btn btn-principal btn-large" :disabled="occupe" @click="creer">
          <Icone nom="plus" :taille="20" /> Créer un nouvel arbre
        </button>
        <button v-for="f in basesDuDossier" :key="f.nom" class="btn btn-large" :disabled="occupe" @click="agir(() => dossier.ouvrirDepuisDossier(f.nom), `Arbre « ${f.nom} » ouvert`)">
          <Icone nom="base" :taille="20" /> Ouvrir « {{ f.nom }} » (dossier)
        </button>
        <button class="btn btn-large" :disabled="occupe" @click="fichier?.click()">
          <Icone nom="importer" :taille="20" /> Ouvrir une base existante (.db)
        </button>
        <input ref="fichier" type="file" accept=".db,.sqlite,.sqlite3,application/octet-stream,application/vnd.sqlite3,application/x-sqlite3" hidden @change="importer" />
      </template>
    </section>

    <!-- 2. Emplacement -->
    <section class="carte etape" :class="{ faite: dossier.etat === 'pret' }">
      <header>
        <span class="numero">{{ dossier.etat === 'pret' ? '✓' : '2' }}</span>
        <h2>Son emplacement</h2>
      </header>
      <template v-if="dossier.etat === 'non-supporte'">
        <p class="aide">Ce navigateur ne permet pas de lier un dossier : l'arbre reste rangé dans l'appli. Utilise Chrome à jour sur Android pour le copier dans un dossier.</p>
      </template>
      <template v-else-if="dossier.etat === 'pret'">
        <p class="aide">Dossier <code>{{ dossier.nom }}/db</code> : l'arbre y est copié automatiquement à chaque modification.</p>
      </template>
      <template v-else-if="dossier.etat === 'a-autoriser'">
        <p class="aide">Autorise de nouveau l'accès au dossier « {{ dossier.nom }} ».</p>
        <button class="btn btn-principal btn-large" @click="agir(dossier.autoriser)">Autoriser</button>
      </template>
      <template v-else>
        <p class="aide">Choisis (ou crée) un dossier, par exemple <em>Documents/Laubre</em>. La base y sera enregistrée en <code>.db</code>, dans « db ».</p>
        <button class="btn btn-large" :class="baseFaite ? 'btn-principal' : ''" :disabled="occupe" @click="agir(dossier.choisir, 'Dossier lié')">
          <Icone nom="dossier" :taille="20" /> Choisir le dossier
        </button>
        <button v-if="baseFaite && !dossierPasse" class="lien" @click="dossierPasse = true">Plus tard (depuis le Profil)</button>
      </template>
    </section>

    <!-- 3. Souche -->
    <section class="carte etape" :class="{ inactive: !baseFaite }">
      <header>
        <span class="numero">3</span>
        <h2>Le premier individu</h2>
      </header>
      <p class="aide">La souche, c'est vous : tout l'arbre partira de votre bulle.</p>
      <button class="btn btn-principal btn-large" :disabled="!baseFaite || !dossierFait" @click="creerSouche">
        <Icone nom="plus" :taille="20" /> Créer la souche
      </button>
    </section>
  </main>
</template>

<style scoped>
.initialisation {
  min-height: 100dvh;
  padding: calc(var(--haut-sur) + 28px) 16px calc(var(--bas-sur) + 32px);
  display: grid;
  align-content: start;
  gap: 14px;
  max-width: 520px;
  margin: 0 auto;
}
.intro {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 6px;
  margin-bottom: 8px;
}
.intro img {
  border-radius: 22px;
  box-shadow: var(--ombre);
}
.intro h1 {
  font-size: 2.2rem;
  color: var(--sapin);
  margin-top: 6px;
}
.intro p {
  margin: 0;
  color: var(--discret);
  max-width: 300px;
  line-height: 1.45;
}
.etape {
  display: grid;
  gap: 10px;
  transition: opacity 0.2s;
}
.etape header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.etape h2 {
  font-size: 1.15rem;
  color: var(--sapin);
}
.numero {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent-clair);
  color: var(--sapin);
  font-weight: 600;
  font-size: 0.9rem;
}
.faite .numero {
  background: var(--sapin);
  color: var(--nacre);
}
.inactive {
  opacity: 0.55;
}
.aide {
  margin: 0;
  line-height: 1.45;
}
.champ {
  margin-bottom: 2px;
}
.lien {
  min-height: 40px;
  color: var(--discret);
  font-size: 0.85rem;
  text-decoration: underline;
}
code {
  font-family: var(--mono);
  font-size: 0.85em;
}
</style>
