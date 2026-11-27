/**
 * Dossier local : copie automatique de la base ouverte dans <dossier>/db,
 * détection d'une version plus récente (modifiée ailleurs, ex. sur PC),
 * ouverture des bases présentes dans le dossier.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/db/client'
import { useArbreStore } from './arbre'
import * as dossier from '@/services/dossier-local'
import type { EtatDossier, FichierDossier } from '@/services/dossier-local'

const DELAI_COPIE = 1200 // ms après la dernière modification
const MARGE = 2000 // ms : tolérance sur les dates de fichier
const cleSynchro = (nomBase: string) => `laubre.synchro.${nomBase}`

export const useDossierStore = defineStore('dossier', () => {
  const etat = ref<EtatDossier>('non-supporte')
  const nom = ref<string | null>(null)
  const fichiers = ref<FichierDossier[]>([])
  const derniereCopie = ref<Date | null>(null)
  const erreur = ref<string | null>(null)
  /** Le dossier contient une autre version de la base ouverte. */
  const conflit = ref<'plus-recente' | 'inconnue' | null>(null)

  let minuteur: ReturnType<typeof setTimeout> | undefined
  let copieEnAttente = false

  async function rafraichirEtat() {
    etat.value = await dossier.etat()
    nom.value = dossier.nomDossier()
  }

  async function initialiser() {
    etat.value = await dossier.chargerDossier()
    nom.value = dossier.nomDossier()
    if (etat.value === 'pret') {
      await lister()
      await verifierBaseCourante()
    }
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'hidden') {
        // Android peut fermer l'appli en arrière-plan : on copie tout de suite
        if (copieEnAttente) await copier()
      } else if (etat.value === 'pret') {
        await verifierBaseCourante() // le fichier a pu être modifié ailleurs entre-temps
      }
    })
  }

  async function choisir() {
    etat.value = await dossier.choisirDossier()
    nom.value = dossier.nomDossier()
    await lister()
    await verifierBaseCourante()
  }

  async function autoriser() {
    etat.value = await dossier.autoriser()
    if (etat.value === 'pret') {
      await lister()
      await verifierBaseCourante()
    }
  }

  async function lister() {
    try {
      fichiers.value = etat.value === 'pret' ? await dossier.listerFichiers() : []
    } catch (e) {
      erreur.value = (e as Error).message
      await rafraichirEtat()
    }
  }

  /** À appeler après chaque modification de la base : copie différée de quelques instants. */
  function planifier() {
    if (etat.value !== 'pret') return
    copieEnAttente = true
    clearTimeout(minuteur)
    minuteur = setTimeout(copier, DELAI_COPIE)
  }

  /** Écrit la base ouverte dans <dossier>/db/<nom>.db. */
  async function copier() {
    clearTimeout(minuteur)
    copieEnAttente = false
    const arbre = useArbreStore()
    if (etat.value !== 'pret' || !arbre.prete) return
    try {
      const octets = await api.exporterBase()
      const modifie = await dossier.ecrireFichier(arbre.nomBase, octets)
      memoriser(arbre.nomBase, modifie)
      derniereCopie.value = new Date()
      erreur.value = null
      conflit.value = null
      await lister()
    } catch (e) {
      erreur.value = (e as Error).message
      await rafraichirEtat()
    }
  }

  /**
   * Compare la base ouverte avec son fichier dans le dossier :
   * - pas de fichier : on le crée ;
   * - fichier plus récent que notre dernière copie : on le signale (bandeau).
   */
  async function verifierBaseCourante() {
    const arbre = useArbreStore()
    if (etat.value !== 'pret' || !arbre.prete) return
    const info = await dossier.infoFichier(arbre.nomBase)
    if (!info) return copier()
    const connu = lireMemoire(arbre.nomBase)
    if (connu === null) conflit.value = 'inconnue'
    else conflit.value = info.modifie > connu + MARGE ? 'plus-recente' : null
  }

  /** Remplace la base ouverte par la version du dossier. */
  async function chargerVersionDossier() {
    const arbre = useArbreStore()
    const octets = await dossier.lireFichier(arbre.nomBase)
    const info = await dossier.infoFichier(arbre.nomBase)
    await arbre.remplacer(octets)
    if (info) memoriser(arbre.nomBase, info.modifie)
    conflit.value = null
  }

  /** Garde la version du téléphone et écrase celle du dossier. */
  async function garderVersionTelephone() {
    conflit.value = null
    await copier()
  }

  /** Ouvre une base du dossier (l'ajoute au téléphone si elle n'y est pas encore). */
  async function ouvrirDepuisDossier(nomBase: string) {
    const arbre = useArbreStore()
    const interne = arbre.stockage?.bases.find((c) => c.nom === nomBase)
    if (interne) {
      await arbre.ouvrir(interne.fichier)
      return
    }
    const octets = await dossier.lireFichier(nomBase)
    const info = await dossier.infoFichier(nomBase)
    if (info) memoriser(nomBase, info.modifie)
    await arbre.importerOctets(octets, nomBase)
  }

  async function supprimerFichier(nomBase: string) {
    if (etat.value !== 'pret') return
    await dossier.supprimerFichier(nomBase)
    try {
      localStorage.removeItem(cleSynchro(nomBase))
    } catch {
      /* sans importance */
    }
    await lister()
  }

  return {
    etat, nom, fichiers, derniereCopie, erreur, conflit,
    initialiser, choisir, autoriser, lister, planifier, copier, verifierBaseCourante,
    chargerVersionDossier, garderVersionTelephone, ouvrirDepuisDossier, supprimerFichier,
  }
})

function memoriser(nomBase: string, modifie: number) {
  try {
    localStorage.setItem(cleSynchro(nomBase), String(modifie))
  } catch {
    /* stockage local indisponible */
  }
}

function lireMemoire(nomBase: string): number | null {
  try {
    const v = localStorage.getItem(cleSynchro(nomBase))
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}
