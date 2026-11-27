/** Types et règles métier (portage du logiciel Python). */
import { CHAMPS_EVT, EVENEMENTS, type ChampEvt, type Evenement } from '@/db/schema'

export const CHAMPS_IDENTITE = ['niveau', 'prenom1', 'prenom2', 'prenom3', 'nom'] as const
export type CleEvt = `${Evenement}_${ChampEvt}`
export type Cle = (typeof CHAMPS_IDENTITE)[number] | CleEvt
export const TOUTES_CLES: Cle[] = [
  ...CHAMPS_IDENTITE,
  ...EVENEMENTS.flatMap((e) => CHAMPS_EVT.map((c) => `${e}_${c}` as CleEvt)),
]
export const CLES_DATES = EVENEMENTS.map((e) => `${e}_date` as CleEvt)

/** Données saisies : toutes les clés, en texte. */
export type Saisie = Record<Cle, string>

export interface Individu extends Saisie {
  id: number
  souche: boolean
  famille: number | null
}

export interface InfoStockage {
  etat: 'prete' | 'absente'
  persistant: boolean
  versionSqlite: string
  base: { fichier: string; nom: string } | null
  bases: { fichier: string; nom: string }[]
  /** La base ouverte a déjà sa souche (sinon : écran « premier individu »). */
  souche: boolean
}

export interface Statistiques {
  individus: number
  familles: number
  generations: number
  completude: { champ: string; renseignes: number; total: number; pourcentage: number }[]
}

export const RE_NIVEAU = /^[01]+$/

export function saisieVide(): Saisie {
  return Object.fromEntries(TOUTES_CLES.map((k) => [k, ''])) as Saisie
}

/** Nettoie un objet quelconque en Saisie (texte, sans espaces autour). */
export function nettoyer(d: object): Saisie {
  const o = d as Record<string, unknown>
  return Object.fromEntries(TOUTES_CLES.map((k) => [k, String(o[k] ?? '').trim()])) as Saisie
}

export const estHomme = (niveau: string) => niveau.slice(-1) === '0'

/** Accepte : vide, AAAA, MM/AAAA ou JJ/MM/AAAA (date réelle). */
export function dateValide(texte: string): boolean {
  const t = texte.trim()
  if (!t || /^\d{4}$/.test(t)) return true
  if (/^\d{2}\/\d{4}$/.test(t)) {
    const m = Number(t.slice(0, 2))
    return m >= 1 && m <= 12
  }
  const r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (!r) return false
  const [j, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])]
  const d = new Date(Date.UTC(a, m - 1, j))
  return a >= 1 && d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j
}

/** '16/02/2003' -> [16, 2, 2003] ; '1950' -> [null, null, 1950]. */
export function decouperDate(texte: string | null | undefined): [number | null, number | null, number | null] {
  const t = (texte ?? '').trim()
  if (!t || !dateValide(t)) return [null, null, null]
  const p = t.split('/').map(Number)
  if (p.length === 3) return [p[0], p[1], p[2]]
  if (p.length === 2) return [null, p[0], p[1]]
  return [null, null, p[0]]
}

const deux = (n: number) => String(n).padStart(2, '0')

export function assemblerDate(jour: number | null, mois: number | null, annee: number | null): string {
  if (!annee) return ''
  const a = String(annee).padStart(4, '0')
  if (jour && mois) return `${deux(jour)}/${deux(mois)}/${a}`
  if (mois) return `${deux(mois)}/${a}`
  return a
}

export const annee = (date: string) => (date ? date.slice(-4) : '')

/** Libellé du niveau (aide de saisie, comme le logiciel PC). */
export function aideNiveau(n: string): { texte: string; erreur: boolean } {
  if (!n) return { texte: '', erreur: false }
  if (!RE_NIVEAU.test(n)) return { texte: 'Uniquement des 0 (homme) et des 1 (femme)', erreur: true }
  if (n === '0') return { texte: 'Homme · souche (vous)', erreur: false }
  if (n === '1') return { texte: 'Femme · conjointe de la souche', erreur: false }
  return { texte: `${estHomme(n) ? 'Homme · père' : 'Femme · mère'} de ${n.slice(0, -1)}`, erreur: false }
}

export const nomComplet = (i: Pick<Individu, 'prenom1' | 'nom'>) => `${i.prenom1} ${i.nom}`.trim() || 'Sans nom'

// ------------------------------------------------------- saisie des dates
/**
 * Met en forme la date au fil de la frappe : les « / » s'ajoutent seuls
 * après le jour et après le mois (16 -> « 16/ », 1602 -> « 16/02/ »).
 * Les autres formats restent possibles :
 *  - AAAA    : « 1950 » (le « mois » 50 n'existe pas, on garde l'année) ;
 *  - MM/AAAA : « 06/1950 » (le « mois » 19 n'existe pas, 06 est donc le mois).
 * `ajout` : vrai quand on tape (faux quand on efface, pour ne pas remettre le « / »).
 */
export function masquerDate(brut: string, ajout: boolean): string {
  // « 1/ » tapé à la main : jour ou mois sur un chiffre, complété par un 0
  const parties = brut.split('/')
  const chiffres = parties
    .map((p, i) => {
      const c = p.replace(/\D/g, '')
      return i < parties.length - 1 && i < 2 && c.length === 1 ? '0' + c : c
    })
    .join('')
    .slice(0, 8)
  const d = chiffres
  if (d.length <= 2) return d.length === 2 && ajout ? `${d}/` : d
  const a = d.slice(0, 2)
  const b = d.slice(2, 4)
  const c = d.slice(4)
  // la 2e partie ne peut pas être un mois : année seule, ou MM/AAAA
  if (Number(b[0]) > 1 || (b.length === 2 && (Number(b) > 12 || b === '00'))) {
    if (Number(a) > 12 || a === '00') return d.slice(0, 4) // AAAA
    return `${a}/${(b + c).slice(0, 4)}` // MM/AAAA
  }
  if (b.length < 2) return `${a}/${b}`
  if (!c) return `${a}/${b}${ajout ? '/' : ''}`
  return `${a}/${b}/${c.slice(0, 4)}`
}

/** À la sortie du champ : retire un « / » final ; « 18/12 » seul devient l'année 1812. */
export function finaliserDate(texte: string): string {
  const t = texte.trim().replace(/\/+$/, '')
  if (/^\d{2}\/\d{2}$/.test(t)) return t.replace('/', '')
  return t
}
