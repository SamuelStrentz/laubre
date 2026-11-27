/** État de l'arbre côté interface (Pinia). Toute écriture passe par le worker. */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/db/client'
import { useDossierStore } from './dossier'
import type { InfoStockage, Individu, Saisie, Statistiques } from '@/domain/individu'

const CLE_BASE = 'laubre.base'

export type Ecran = 'generations' | 'arbre' | 'profil'

export const useArbreStore = defineStore('arbre', () => {
  const chargement = ref(true)
  const erreur = ref<string | null>(null)
  const stockage = ref<InfoStockage | null>(null)
  const individus = ref<Individu[]>([])
  const noms = ref<string[]>([])
  const stats = ref<Statistiques | null>(null)

  /** Navigation de l'écran principal (gardée quand on revient d'une fiche). */
  const ecran = ref<Ecran>('arbre')
  const centre = ref<string | null>(null)

  const prete = computed(() => stockage.value?.etat === 'prete')
  const aSouche = computed(() => !!stockage.value?.souche)
  const nomBase = computed(() => stockage.value?.base?.nom ?? 'arbre')

  /** Niveau -> individu (le premier enregistré, comme le logiciel PC). */
  const parNiveau = computed(() => {
    const m = new Map<string, Individu>()
    for (const i of [...individus.value].sort((a, b) => a.id - b.id)) if (!m.has(i.niveau)) m.set(i.niveau, i)
    return m
  })
  const souche = computed(() => individus.value.find((i) => i.souche) ?? parNiveau.value.get('0') ?? null)
  const niveauSouche = computed(() => souche.value?.niveau ?? '0')

  // ------------------------------------------------------------- bases
  async function demarrer() {
    chargement.value = true
    try {
      appliquer(await api.demarrer(lireBaseMemorisee()))
      if (prete.value) await recharger()
    } catch (e) {
      erreur.value = (e as Error).message
    } finally {
      chargement.value = false
    }
  }

  function appliquer(info: InfoStockage) {
    stockage.value = info
    try {
      if (info.base) localStorage.setItem(CLE_BASE, info.base.fichier)
    } catch {
      /* stockage local indisponible : sans importance */
    }
  }

  async function changerDeBase(info: InfoStockage) {
    appliquer(info)
    centre.value = null
    ecran.value = 'arbre'
    if (prete.value) {
      await demanderPersistance()
      await recharger()
      await useDossierStore().verifierBaseCourante()
    } else {
      individus.value = []
      noms.value = []
      stats.value = null
    }
  }

  async function recharger() {
    const [i, n, s, info] = await Promise.all([api.individus(), api.noms(), api.stats(), api.info()])
    individus.value = i
    noms.value = n
    stats.value = s
    stockage.value = info
  }

  const creer = async (nom: string) => changerDeBase(await api.creerBase(nom))
  const ouvrir = async (fichier: string) => changerDeBase(await api.ouvrirBase(fichier))

  async function importer(fichier: File) {
    const octets = new Uint8Array(await fichier.arrayBuffer())
    const nom = fichier.name.replace(/\.(db|sqlite3?)$/i, '') || 'arbre'
    await importerOctets(octets, nom)
  }
  const importerOctets = async (octets: Uint8Array, nom: string) => changerDeBase(await api.importerBase(octets, nom))

  /** Remplace le contenu de la base ouverte (version du dossier local). */
  async function remplacer(octets: Uint8Array) {
    appliquer(await api.remplacerBase(octets))
    await recharger()
  }

  async function exporter(): Promise<Blob> {
    const octets = await api.exporterBase()
    return new Blob([octets as BlobPart], { type: 'application/vnd.sqlite3' })
  }

  /** Après chaque écriture : copie différée dans le dossier local. */
  const apresEcriture = () => useDossierStore().planifier()

  // --------------------------------------------------------- individus
  async function ajouter(d: Partial<Saisie>, estSouche = false) {
    const { id, info } = await api.ajouter(d, estSouche)
    appliquer(info)
    await recharger()
    apresEcriture()
    return id
  }

  async function modifier(id: number, d: Partial<Saisie>) {
    await api.modifier(id, d)
    await recharger()
    apresEcriture()
  }

  async function supprimer(id: number) {
    await api.supprimer(id)
    await recharger()
    apresEcriture()
  }

  return {
    chargement, erreur, stockage, individus, noms, stats, ecran, centre,
    prete, aSouche, nomBase, parNiveau, souche, niveauSouche,
    demarrer, recharger, creer, ouvrir, importer, importerOctets, remplacer, exporter,
    ajouter, modifier, supprimer,
  }
})

function lireBaseMemorisee(): string | null {
  try {
    return localStorage.getItem(CLE_BASE)
  } catch {
    return null
  }
}

/** Demande au navigateur de ne pas effacer la base en cas de manque de place. */
async function demanderPersistance() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    /* sans importance */
  }
}
