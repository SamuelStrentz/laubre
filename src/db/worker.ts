/// <reference lib="webworker" />
/**
 * Web Worker qui possède la base SQLite (même principe qu'Œnoleptica).
 *
 * - Moteur : SQLite officiel compilé en WebAssembly.
 * - Stockage : OPFS « SAHPool » (fichiers privés du navigateur, persistants),
 *   sans en-têtes COOP/COEP : compatible GitHub Pages.
 * - Un arbre = un fichier « /<nom>.db ». Le dossier local choisi par
 *   l'utilisateur en garde une copie à jour (cf. stores/dossier.ts).
 */
import sqlite3InitModule, { type SAHPoolUtil, type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { SqlDb } from './sql'
import * as arbre from '@/repositories/arbre'
import type { InfoStockage, Saisie } from '@/domain/individu'
import type { Evenement } from './schema'

const FICHIER_IMPORT = '/__import__.db'

let sqlite3: Sqlite3Static
let pool: SAHPoolUtil | null = null
let db: SqlDb | null = null
let fichierCourant: string | null = null

function base(): SqlDb {
  if (!db) throw new Error("Aucune base n'est ouverte.")
  return db
}

const nomDeFichier = (fichier: string) => fichier.replace(/^\//, '').replace(/\.db$/i, '')

function decoder(f: string): string {
  try {
    return decodeURIComponent(f)
  } catch {
    return f
  }
}

/** Nom tel que le pool le range en interne (chemin d'URL encodé), pour importDb() et unlink(). */
const chemin = (fichier: string) => new URL(fichier, 'file://localhost/').pathname

function fichierDeNom(nom: string): string {
  const propre = nom.replace(/[\\/:*?"<>|#%]/g, '').replace(/\s+/g, ' ').trim()
  if (!propre) throw new Error("Donne un nom à l'arbre.")
  if (propre.length > 60) throw new Error('Nom trop long (60 caractères maximum).')
  return `/${propre}.db`
}

function listerBases() {
  if (!pool) return fichierCourant ? [{ fichier: fichierCourant, nom: nomDeFichier(fichierCourant) }] : []
  return pool
    .getFileNames()
    .map(decoder)
    .filter((f) => /\.db$/i.test(f) && f !== FICHIER_IMPORT)
    .map((fichier) => ({ fichier, nom: nomDeFichier(fichier) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

const existe = (fichier: string) => listerBases().some((c) => c.fichier.toLowerCase() === fichier.toLowerCase())

/** Chaque base occupe 2 emplacements du pool (fichier + journal). */
async function prevoirPlace(): Promise<void> {
  if (pool) await pool.reserveMinimumCapacity((listerBases().length + 2) * 2 + 2)
}

function connecter(fichier: string): SqlDb {
  const brute = pool ? new pool.OpfsSAHPoolDb(fichier) : new sqlite3.oo1.DB(':memory:', 'c')
  const s = new SqlDb(brute)
  s.exec('PRAGMA foreign_keys = ON')
  return s
}

function fermer(): void {
  db?.brute.close()
  db = null
  fichierCourant = null
}

function ouvrir(fichier: string): void {
  fermer()
  db = connecter(fichier)
  fichierCourant = fichier
  arbre.verifierStructure(db)
}

function info(): InfoStockage {
  return {
    etat: db ? 'prete' : 'absente',
    persistant: pool !== null,
    versionSqlite: sqlite3.version.libVersion,
    base: fichierCourant ? { fichier: fichierCourant, nom: nomDeFichier(fichierCourant) } : null,
    bases: listerBases(),
    souche: db ? arbre.aSouche(db) : false,
  }
}

/** Une base du logiciel PC peut être en mode WAL : SAHPool ne le gère pas, on repasse en journal classique. */
function sansWal(octets: Uint8Array): Uint8Array {
  const copie = new Uint8Array(octets)
  if (copie[18] === 2) copie[18] = 1
  if (copie[19] === 2) copie[19] = 1
  return copie
}

/** Vérifie qu'un fichier .db est bien un arbre, dans un emplacement temporaire. */
async function controler(octets: Uint8Array): Promise<Uint8Array> {
  if (!pool) throw new Error("Le stockage du navigateur n'est pas disponible : import impossible.")
  const propres = sansWal(octets)
  await pool.importDb(chemin(FICHIER_IMPORT), propres)
  try {
    const essai = connecter(FICHIER_IMPORT)
    try {
      arbre.verifierStructure(essai)
    } finally {
      essai.brute.close()
    }
  } finally {
    pool.unlink(chemin(FICHIER_IMPORT))
  }
  return propres
}

const api = {
  /** Démarre le moteur et rouvre la dernière base utilisée (ou la première trouvée). */
  async demarrer(fichierPrefere?: string | null): Promise<InfoStockage> {
    sqlite3 = await sqlite3InitModule()
    try {
      pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'laubre', initialCapacity: 6 })
      if (pool.getFileNames().map(decoder).includes(FICHIER_IMPORT)) pool.unlink(chemin(FICHIER_IMPORT))
    } catch (e) {
      console.warn('OPFS indisponible, base en mémoire seulement :', e)
      pool = null
    }
    const bases = listerBases()
    const choix = bases.find((c) => c.fichier === fichierPrefere) ?? bases[0]
    if (choix) {
      try {
        ouvrir(choix.fichier)
      } catch (e) {
        console.warn('Base illisible :', e)
        fermer()
      }
    }
    return info()
  },

  info,

  async creerBase(nom: string): Promise<InfoStockage> {
    const fichier = fichierDeNom(nom)
    if (existe(fichier)) throw new Error(`Un arbre « ${nom.trim()} » existe déjà.`)
    await prevoirPlace()
    fermer()
    db = connecter(fichier)
    fichierCourant = fichier
    arbre.creerStructure(db)
    return info()
  },

  ouvrirBase(fichier: string): InfoStockage {
    if (!existe(fichier)) throw new Error('Cette base est introuvable.')
    ouvrir(fichier)
    return info()
  },

  /** Ajoute une base à partir d'un fichier .db et l'ouvre. */
  async importerBase(octets: Uint8Array, nom: string): Promise<InfoStockage> {
    let fichier = fichierDeNom(nom)
    for (let i = 2; existe(fichier); i++) fichier = fichierDeNom(`${nom} (${i})`)
    await prevoirPlace()
    const propres = await controler(octets)
    fermer()
    await pool!.importDb(chemin(fichier), propres)
    ouvrir(fichier)
    return info()
  },

  /** Remplace le contenu de la base ouverte (version plus récente du dossier, ou import). */
  async remplacerBase(octets: Uint8Array): Promise<InfoStockage> {
    const fichier = fichierCourant
    if (!fichier) throw new Error("Aucune base n'est ouverte.")
    const propres = await controler(octets)
    fermer()
    pool!.unlink(chemin(fichier))
    await pool!.importDb(chemin(fichier), propres)
    ouvrir(fichier)
    return info()
  },

  exporterBase(): Uint8Array {
    return sqlite3.capi.sqlite3_js_db_export(base().brute.pointer!)
  },

  // --- Lecture
  individus: () => arbre.tous(base()),
  individu: (id: number) => arbre.charger(base(), id),
  noms: () => arbre.noms(base()),
  defauts: (niveau: string) => arbre.defauts(base(), niveau),
  niveauExiste: (niveau: string, exclureId: number | null) => arbre.niveauExiste(base(), niveau, exclureId),
  stats: (avecBelleFamille = false) => arbre.statistiques(base(), avecBelleFamille),
  statsDetaillees: (avecBelleFamille = false) => arbre.statistiquesDetaillees(base(), avecBelleFamille),

  // --- Écriture (enregistrée immédiatement)
  ajouter(d: Partial<Saisie>, souche: boolean, sansObjet: Evenement[] = [], inconnu = false) {
    const id = arbre.ajouter(base(), d, souche, sansObjet, inconnu)
    return { id, info: info() }
  },
  modifier: (id: number, d: Partial<Saisie>, sansObjet: Evenement[] = [], inconnu = false) =>
    arbre.modifier(base(), id, d, sansObjet, inconnu),
  ajouterLot: (lot: { saisie: Partial<Saisie> }[]) => arbre.ajouterLot(base(), lot),
  supprimer: (id: number) => arbre.supprimer(base(), id),
}

export type ApiBase = typeof api

export interface Requete {
  id: number
  methode: keyof ApiBase
  args: unknown[]
}

export type Reponse = { id: number; ok: true; resultat: unknown } | { id: number; ok: false; erreur: string }

// Les requêtes sont traitées une par une, dans l'ordre d'arrivée.
let file: Promise<void> = Promise.resolve()

self.onmessage = (ev: MessageEvent<Requete>) => {
  const { id, methode, args } = ev.data
  file = file.then(async () => {
    try {
      const fn = api[methode] as (...a: unknown[]) => unknown
      const resultat = await fn(...args)
      const transfert = resultat instanceof Uint8Array ? [resultat.buffer] : []
      self.postMessage({ id, ok: true, resultat } satisfies Reponse, { transfer: transfert })
    } catch (e) {
      const erreur = e instanceof Error ? e.message : String(e)
      self.postMessage({ id, ok: false, erreur } satisfies Reponse)
    }
  })
}
