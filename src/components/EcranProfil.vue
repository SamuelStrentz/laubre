<script setup lang="ts">
/** Profil : chiffres de l'arbre, complétude, base de données, dossier local, installation. */
import { computed, onBeforeUnmount, ref } from 'vue'
import Icone from './Icone.vue'
import ImportGedcom from './ImportGedcom.vue'
import { useArbreStore } from '@/stores/arbre'
import { useDossierStore } from '@/stores/dossier'
import { useUiStore } from '@/stores/ui'
import { nomComplet } from '@/domain/individu'
import { nomFichier, partagerOuTelecharger } from '@/utils/fichiers'
import { analyserGedcom, decoderGedcom, exporterGedcom, type Gedcom } from '@/domain/gedcom'

const store = useArbreStore()
const dossier = useDossierStore()
const ui = useUiStore()
const fichier = ref<HTMLInputElement>()
const logo = `${import.meta.env.BASE_URL}icons/icon.svg`
const version = __APP_VERSION__

async function agir(fn: () => Promise<unknown>, ok?: string) {
  try {
    await fn()
    if (ok) ui.toast(ok)
  } catch (e) {
    if ((e as Error).name !== 'AbortError') ui.erreur(e)
  }
}

const heureCopie = computed(() =>
  dossier.derniereCopie ? dossier.derniereCopie.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null,
)

/** Bases présentes dans le dossier mais pas encore sur le téléphone. */
const basesDuDossier = computed(() => {
  const internes = new Set(store.stockage?.bases.map((b) => b.nom) ?? [])
  return dossier.fichiers.filter((f) => !internes.has(f.nom))
})
const autresBases = computed(() => store.stockage?.bases.filter((b) => b.fichier !== store.stockage?.base?.fichier) ?? [])

async function exporter() {
  await agir(async () => {
    const blob = await store.exporter()
    const jour = new Date().toISOString().slice(0, 10)
    await partagerOuTelecharger(blob, `${nomFichier(store.nomBase)}_${jour}.db`, `Arbre ${store.nomBase}`)
  })
}

async function importer(e: Event) {
  const champ = e.target as HTMLInputElement
  const f = champ.files?.[0]
  champ.value = ''
  if (!f) return
  await agir(() => store.importer(f), `Base « ${f.name} » ouverte`)
}

// ------------------------------------------------------------------ GEDCOM
const fichierGed = ref<HTMLInputElement>()
const ged = ref<Gedcom | null>(null)
const nomGed = ref('')

async function exporterGed() {
  await agir(async () => {
    const texte = exporterGedcom(store.individus, version)
    const jour = new Date().toISOString().slice(0, 10)
    await partagerOuTelecharger(new Blob([texte], { type: 'text/plain' }), `${nomFichier(store.nomBase)}_${jour}.ged`, `Arbre ${store.nomBase} (GEDCOM)`)
  })
}

async function lireGed(e: Event) {
  const champ = e.target as HTMLInputElement
  const f = champ.files?.[0]
  champ.value = ''
  if (!f) return
  await agir(async () => {
    ged.value = analyserGedcom(decoderGedcom(new Uint8Array(await f.arrayBuffer())))
    nomGed.value = f.name
  })
}

// ------------------------------------------------------------ installation
interface EvenementInstallation extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
const invite = ref<EvenementInstallation | null>((window as unknown as { __invite?: EvenementInstallation }).__invite ?? null)
const installee = ref(window.matchMedia('(display-mode: standalone)').matches)
function surInvite(e: Event) {
  e.preventDefault()
  invite.value = e as EvenementInstallation
}
window.addEventListener('beforeinstallprompt', surInvite)
onBeforeUnmount(() => window.removeEventListener('beforeinstallprompt', surInvite))

async function installer() {
  if (!invite.value) {
    ui.toast("Menu ⋮ de Chrome › « Installer l'application »")
    return
  }
  await invite.value.prompt()
  const { outcome } = await invite.value.userChoice
  if (outcome === 'accepted') installee.value = true
  invite.value = null
}
</script>

<template>
  <section class="ecran-profil">
    <h1>Profil</h1>

    <div class="carte identite">
      <img :src="logo" alt="" width="48" height="48" />
      <div>
        <strong>Arbre de {{ store.souche ? nomComplet(store.souche) : store.nomBase }}</strong>
        <span>{{ store.nomBase }}.db{{ dossier.etat === 'pret' ? ` · dossier ${dossier.nom}/db` : '' }}</span>
      </div>
    </div>

    <p class="portee">{{ store.belleFamille ? 'Chiffres avec la belle-famille' : 'Chiffres sans la belle-famille (réglage dans Générations)' }}</p>
    <div class="chiffres">
      <div class="carte"><strong>{{ store.stats?.individus ?? 0 }}</strong><span>individus</span></div>
      <div class="carte"><strong>{{ store.stats?.familles ?? 0 }}</strong><span>familles</span></div>
      <div class="carte"><strong>{{ store.stats?.generations ?? 0 }}</strong><span>générations</span></div>
    </div>

    <h2 class="section-titre">Complétude</h2>
    <div class="carte completude">
      <div v-for="c in store.stats?.completude ?? []" :key="c.champ" class="jauge">
        <p><span>{{ c.champ }}</span><span>{{ Math.round(c.pourcentage) }} %</span></p>
        <div class="barre-fond"><div class="barre-plein" :style="{ width: `${c.pourcentage}%` }"></div></div>
      </div>
    </div>

    <h2 class="section-titre">Actes sourcés</h2>
    <div class="carte completude">
      <p v-if="!(store.stats?.sources.length)" class="aide sans-donnees">Aucun acte renseigné pour l'instant.</p>
      <div v-for="c in store.stats?.sources ?? []" :key="c.champ" class="jauge">
        <p><span>{{ c.champ }}</span><span>{{ Math.round(c.pourcentage) }} % · {{ c.renseignes }}/{{ c.total }}</span></p>
        <div class="barre-fond"><div class="barre-plein" :style="{ width: `${c.pourcentage}%` }"></div></div>
      </div>
    </div>

    <h2 class="section-titre">Dossier local</h2>
    <div class="carte bloc">
      <template v-if="dossier.etat === 'non-supporte'">
        <p class="aide">Ce navigateur ne permet pas de lier un dossier. Utilise Chrome à jour sur Android.</p>
      </template>
      <template v-else-if="dossier.etat === 'aucun'">
        <p class="aide">Choisis un dossier (par ex. <em>Documents/Laubre</em>) : l'arbre y sera copié automatiquement en <code>.db</code>, dans « db ».</p>
        <button class="btn btn-principal btn-large" @click="agir(dossier.choisir, 'Dossier lié')">
          <Icone nom="dossier" :taille="20" /> Choisir le dossier
        </button>
      </template>
      <template v-else>
        <dl>
          <dt>Dossier</dt>
          <dd class="chemin">{{ dossier.nom }}/db</dd>
          <dt>État</dt>
          <dd>{{ dossier.etat === 'pret' ? 'Copie automatique active' : 'Autorisation à renouveler' }}</dd>
          <template v-if="heureCopie"><dt>Dernière copie</dt><dd>{{ heureCopie }}</dd></template>
          <template v-if="dossier.erreur"><dt>Erreur</dt><dd class="erreur">{{ dossier.erreur }}</dd></template>
        </dl>
        <button v-if="dossier.etat === 'a-autoriser'" class="btn btn-principal btn-large" @click="agir(dossier.autoriser)">Autoriser</button>
        <button v-else class="btn btn-large" @click="agir(dossier.copier, 'Arbre copié dans le dossier')">
          <Icone nom="synchro" :taille="20" /> Copier maintenant
        </button>
        <button class="btn btn-large" @click="agir(dossier.choisir, 'Dossier changé')">
          <Icone nom="dossier" :taille="20" /> Changer de dossier
        </button>
      </template>
    </div>

    <h2 class="section-titre">Base de données</h2>
    <div class="carte bloc">
      <button class="btn btn-principal btn-large" @click="exporter"><Icone nom="partager" :taille="20" /> Exporter la base (.db)</button>
      <button class="btn btn-large" @click="fichier?.click()"><Icone nom="importer" :taille="20" /> Ouvrir une autre base (.db)</button>
      <template v-if="autresBases.length || basesDuDossier.length">
        <p class="aide">Autres arbres :</p>
        <button v-for="b in autresBases" :key="b.fichier" class="btn btn-large" @click="agir(() => store.ouvrir(b.fichier), `Arbre « ${b.nom} » ouvert`)">
          <Icone nom="base" :taille="20" /> {{ b.nom }}
        </button>
        <button v-for="f in basesDuDossier" :key="'d-' + f.nom" class="btn btn-large" @click="agir(() => dossier.ouvrirDepuisDossier(f.nom), `Arbre « ${f.nom} » ouvert`)">
          <Icone nom="dossier" :taille="20" /> {{ f.nom }} <small>(dossier)</small>
        </button>
      </template>
      <input ref="fichier" type="file" accept=".db,.sqlite,.sqlite3,application/octet-stream,application/vnd.sqlite3,application/x-sqlite3" hidden @change="importer" />
    </div>

    <h2 class="section-titre">GEDCOM</h2>
    <div class="carte bloc">
      <p class="aide">Format standard d'échange (Geneanet, Genebase, Heredis…). À l'import, seuls les nouveaux individus de votre lignée sont ajoutés : ceux déjà présents restent tels quels.</p>
      <button class="btn btn-large" @click="exporterGed"><Icone nom="partager" :taille="20" /> Exporter en GEDCOM (.ged)</button>
      <button class="btn btn-large" @click="fichierGed?.click()"><Icone nom="importer" :taille="20" /> Importer un GEDCOM</button>
      <input ref="fichierGed" type="file" accept=".ged,.gedcom,text/plain,application/octet-stream" hidden @change="lireGed" />
    </div>
    <ImportGedcom :ged="ged" :nom-fichier="nomGed" @fermer="ged = null" />

    <button v-if="!installee" class="btn btn-large installer" @click="installer">
      <Icone nom="installer" :taille="20" /> Installer l'application
    </button>
    <p class="version">Laubre {{ version }} · SQLite {{ store.stockage?.versionSqlite }}{{ store.stockage?.persistant ? '' : ' · stockage temporaire' }}</p>
  </section>
</template>

<style scoped>
.ecran-profil {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 32px;
}
h1 {
  font-size: 1.5rem;
  color: var(--sapin);
  margin: 4px 4px 14px;
}
.identite {
  display: flex;
  align-items: center;
  gap: 14px;
}
.identite img {
  border-radius: 12px;
}
.identite div {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.identite strong {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 1.1rem;
  color: var(--sapin);
}
.identite span {
  font-size: 0.82rem;
  color: var(--discret);
  overflow-wrap: anywhere;
}
.portee {
  margin: 12px 4px 0;
  font-size: 0.8rem;
  color: var(--discret);
}
.chiffres {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 8px;
}
.chiffres .carte {
  padding: 12px 8px;
  display: grid;
  justify-items: center;
  gap: 2px;
}
.chiffres strong {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 1.4rem;
  color: var(--sapin);
}
.chiffres span {
  font-size: 0.78rem;
  color: var(--discret);
}
.section-titre {
  font-family: var(--sans);
  color: var(--sapin);
}
.completude {
  display: grid;
  gap: 12px;
}
.jauge p {
  display: flex;
  justify-content: space-between;
  margin: 0 0 5px;
  font-size: 0.85rem;
}
.jauge p span:last-child {
  color: #5e7a6b;
}
.barre-fond {
  height: 6px;
  border-radius: 3px;
  background: var(--accent-clair);
  overflow: hidden;
}
.barre-plein {
  height: 100%;
  border-radius: 3px;
  background: var(--sapin);
  transition: width 0.4s ease;
}
.sans-donnees {
  margin: 0;
}
.bloc {
  display: grid;
  gap: 10px;
}
.bloc .aide {
  margin: 0;
  line-height: 1.45;
}
dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 12px;
  margin: 0 0 4px;
  font-size: 0.88rem;
}
dt {
  color: var(--discret);
}
dd {
  margin: 0;
}
.chemin {
  font-family: var(--mono);
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}
.erreur {
  color: var(--danger);
}
.installer {
  margin-top: 18px;
  background: var(--accent-clair);
  border-color: var(--accent-clair);
  color: var(--sapin);
}
.version {
  text-align: center;
  font-size: 0.75rem;
  color: var(--discret);
  margin-top: 14px;
}
small {
  color: var(--discret);
  font-weight: 400;
}
</style>
