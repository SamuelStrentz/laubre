/**
 * GEDCOM 5.5.1 : lecture, préparation de l'import et export.
 *
 * Laubre range chacun par son « niveau » (0 = souche, 00 = père, 01 = mère…) :
 * à l'import on part de la souche du fichier et on remonte les familles
 * (FAMC : HUSB -> niveau + 0, WIFE -> niveau + 1). Seuls les ascendants de la
 * souche et de sa conjointe ont une place dans l'arbre ; les autres
 * (frères, enfants, cousins…) sont comptés « hors lignée ».
 *
 * Règle d'import : la version de l'appli prévaut. Un individu déjà présent
 * (même niveau, ou même prénom + nom ailleurs) n'est jamais remplacé ni
 * complété ; les écarts de dates sont ignorés. On n'ajoute que les nouveaux.
 */
import { LIEUX, type Evenement, type Lieu } from '@/db/schema'
import { ancienneRegion } from './regions'
import { codeDepartement, departementDuCode, DEPARTEMENTS, normaliserTexte } from './departements'
import { assemblerDate, dateValide, decouperDate, saisieVide, type Individu, type Saisie } from './individu'

// ------------------------------------------------------------------ lecture
interface Noeud {
  niveau: number
  xref: string | null
  tag: string
  valeur: string
  enfants: Noeud[]
}

/** Texte d'un fichier .ged : UTF-8 (avec ou sans BOM), sinon ANSI (windows-1252). */
export function decoderGedcom(octets: Uint8Array): string {
  if (octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf) return new TextDecoder('utf-8').decode(octets.subarray(3))
  if ((octets[0] === 0xff && octets[1] === 0xfe) || (octets[0] === 0xfe && octets[1] === 0xff)) {
    return new TextDecoder(octets[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(octets)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets)
  } catch {
    return new TextDecoder('windows-1252').decode(octets)
  }
}

const LIGNE = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/

function arbreDeLignes(texte: string): Noeud[] {
  const racines: Noeud[] = []
  const pile: Noeud[] = []
  for (const brute of texte.split(/\r\n|\r|\n/)) {
    const m = LIGNE.exec(brute)
    if (!m) continue
    const n: Noeud = { niveau: Number(m[1]), xref: m[2] ?? null, tag: m[3].toUpperCase(), valeur: m[4] ?? '', enfants: [] }
    // CONC / CONT : suite de la valeur du parent
    if ((n.tag === 'CONC' || n.tag === 'CONT') && pile.length) {
      const parent = pile[n.niveau - 1]
      if (parent) {
        parent.valeur += (n.tag === 'CONT' ? '\n' : '') + n.valeur
        continue
      }
    }
    pile.length = n.niveau
    if (n.niveau === 0) racines.push(n)
    else pile[n.niveau - 1]?.enfants.push(n)
    pile[n.niveau] = n
  }
  return racines
}

const enfant = (n: Noeud | undefined, tag: string) => n?.enfants.find((e) => e.tag === tag)
const enfants = (n: Noeud | undefined, tag: string) => n?.enfants.filter((e) => e.tag === tag) ?? []
const valeur = (n: Noeud | undefined, tag: string) => enfant(n, tag)?.valeur.trim() ?? ''

export interface EvenementGed {
  date: string
  lieu: Record<Lieu, string>
  source: string
}

export interface PersonneGed {
  id: string
  prenoms: string[]
  nom: string
  sexe: 'M' | 'F' | ''
  profession: string
  naissance: EvenementGed | null
  deces: EvenementGed | null
  famc: string[]
  fams: string[]
}

export interface FamilleGed {
  id: string
  mari: string | null
  femme: string | null
  enfants: string[]
  mariage: EvenementGed | null
}

export interface Gedcom {
  personnes: Map<string, PersonneGed>
  familles: Map<string, FamilleGed>
  logiciel: string
}

// ------------------------------------------------------------------- dates
const MOIS: Record<string, number> = {
  JAN: 1, FEB: 2, FEV: 2, MAR: 3, APR: 4, AVR: 4, MAY: 5, MAI: 5, JUN: 6, JUIN: 6, JUL: 7, JUIL: 7,
  AUG: 8, AOU: 8, AOUT: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}

/** « 16 FEB 2003 », « ABT 1850 », « BET 1850 AND 1855 », « FEB 1950 » -> format de l'appli (JJ/MM/AAAA…). */
export function dateDepuisGedcom(texte: string): string {
  // autre calendrier que le grégorien (républicain, julien…) : ignoré
  if (/@#D(?!GREGORIAN)/i.test(texte)) return ''
  const t = normaliserTexte(texte.replace(/@#DGREGORIAN@/i, ''))
    .replace(/^(ABT|ABOUT|EST|CAL|BEF|AFT|BET|FROM|TO|INT|VERS|AVANT|APRES|ENTRE)\s+/, '')
    .split(/\s(?:AND|TO|ET)\s/)[0]
  const mots = t.split(' ').filter(Boolean)
  let jour: number | null = null
  let mois: number | null = null
  let annee: number | null = null
  for (const m of mots) {
    if (/^\d{3,4}$/.test(m) && annee === null) annee = Number(m)
    else if (/^\d{1,2}$/.test(m) && jour === null && mois === null) jour = Number(m)
    else if (MOIS[m] ?? MOIS[m.slice(0, 3)]) mois = MOIS[m] ?? MOIS[m.slice(0, 3)]
  }
  if (!mois) jour = null
  const resultat = assemblerDate(jour, mois, annee)
  return dateValide(resultat) ? resultat : annee ? String(annee).padStart(4, '0') : ''
}

const MOIS_GED = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function dateVersGedcom(date: string): string {
  const [j, m, a] = decouperDate(date)
  if (!a) return ''
  return [j, m ? MOIS_GED[m - 1] : null, String(a)].filter((x) => x !== null).join(' ')
}

// ------------------------------------------------------------------- lieux
type Composante = Lieu | 'insee' | null

const PAYS = new Set(
  ['France', 'Belgique', 'Suisse', 'Italie', 'Espagne', 'Allemagne', 'Luxembourg', 'Portugal', 'Pologne',
    'Royaume-Uni', 'Angleterre', 'Algérie', 'Maroc', 'Tunisie', 'Canada', 'États-Unis', 'USA', 'Pays-Bas',
    'Autriche', 'Monaco', 'Russie', 'Arménie', 'Turquie', 'Vietnam', 'Japon'].map(normaliserTexte),
)

/** Rôle de chaque morceau de PLAC d'après « PLAC / FORM » (Commune, Code INSEE, Département…). */
function rolesDeForme(forme: string): Composante[] {
  return forme.split(',').map((f) => {
    const x = normaliserTexte(f)
    if (/INSEE|AREA CODE/.test(x)) return 'insee'
    if (/POSTAL|ZIP|CP\b/.test(x)) return 'cp'
    if (/COMMUNE|TOWN|CITY|VILLE|LIEU|PLACE/.test(x)) return 'ville'
    if (/DEPARTEMENT|COUNTY|DEPT|DPT/.test(x)) return 'departement'
    if (/REGION|STATE|PROVINCE/.test(x)) return 'region'
    if (/PAYS|COUNTRY/.test(x)) return 'pays'
    return null
  })
}

export function lieuDepuisGedcom(plac: string, roles: Composante[] | null): Record<Lieu, string> {
  const lieu = Object.fromEntries(LIEUX.map((l) => [l, ''])) as Record<Lieu, string>
  const morceaux = plac.split(',').map((m) => m.trim())
  let insee = ''
  if (roles && roles.length >= morceaux.length - 1 && roles.some(Boolean)) {
    morceaux.forEach((m, i) => {
      const r = roles[i]
      if (r === 'insee') insee = m
      else if (r && m) lieu[r] = m
    })
  } else {
    // sans forme : « Ville, [CP], Département, Région, Pays »
    const reste: string[] = []
    for (const m of morceaux.filter(Boolean)) {
      if (/^\d{5}$|^2[AB]\d{3}$/i.test(m) && !lieu.cp) lieu.cp = m
      else reste.push(m)
    }
    if (reste.length) lieu.ville = reste.shift()!
    if (reste.length && (PAYS.has(normaliserTexte(reste[reste.length - 1])) || reste.length >= 3)) lieu.pays = reste.pop()!
    if (reste.length) lieu.departement = reste.shift()!
    if (reste.length) lieu.region = reste.shift()!
  }
  // département et ANCIENNE région déduits du code postal / INSEE ou du nom du département
  const code = departementDuCode(lieu.cp) ?? departementDuCode(insee) ?? (lieu.departement ? codeDepartement(lieu.departement) : null)
  if (code) {
    if (!lieu.departement || codeDepartement(lieu.departement) === code) lieu.departement = DEPARTEMENTS[code]
    lieu.region = ancienneRegion(code) ?? lieu.region
    if (!lieu.pays) lieu.pays = 'France'
  }
  return lieu
}

function lieuVersGedcom(i: Individu, ev: Evenement): string {
  const morceaux = LIEUX.map((l) => i[`${ev}_${l}`].replace(/,/g, ' ').trim())
  return morceaux.some(Boolean) ? morceaux.join(', ') : ''
}

// -------------------------------------------------------------- analyse
export function analyserGedcom(texte: string): Gedcom {
  const racines = arbreDeLignes(texte)
  const tete = racines.find((r) => r.tag === 'HEAD')
  if (!tete) throw new Error("Ce fichier n'est pas un GEDCOM (en-tête HEAD absent).")
  const forme = valeur(enfant(tete, 'PLAC'), 'FORM')
  const roles = forme ? rolesDeForme(forme) : null
  const sources = new Map(
    racines.filter((r) => r.tag === 'SOUR' && r.xref).map((r) => [r.xref!, valeur(r, 'TITL') || valeur(r, 'ABBR') || r.valeur.trim()]),
  )

  const citation = (ev: Noeud): string =>
    enfants(ev, 'SOUR')
      .map((s) => {
        const base = s.valeur.startsWith('@') ? sources.get(s.valeur.trim()) ?? '' : s.valeur.trim()
        const extra = [valeur(s, 'PAGE'), valeur(s, 'WWW'), valeur(s, '_LINK')].filter(Boolean)
        return [base, ...extra].filter(Boolean).join(', ')
      })
      .filter(Boolean)
      .join(' ; ')

  const evenement = (ev: Noeud | undefined): EvenementGed | null => {
    if (!ev) return null
    const plac = valeur(ev, 'PLAC')
    return {
      date: dateDepuisGedcom(valeur(ev, 'DATE')),
      lieu: plac ? lieuDepuisGedcom(plac, roles) : (Object.fromEntries(LIEUX.map((l) => [l, ''])) as Record<Lieu, string>),
      source: citation(ev),
    }
  }

  const personnes = new Map<string, PersonneGed>()
  for (const r of racines.filter((x) => x.tag === 'INDI' && x.xref)) {
    const nomNoeud = enfant(r, 'NAME')
    const brut = nomNoeud?.valeur ?? ''
    const nom = (valeur(nomNoeud, 'SURN') || /\/([^/]*)\//.exec(brut)?.[1] || '').trim()
    const donnes = (valeur(nomNoeud, 'GIVN') || brut.replace(/\/[^/]*\/?/, '')).trim()
    const sexe = valeur(r, 'SEX').toUpperCase()
    personnes.set(r.xref!, {
      id: r.xref!,
      prenoms: donnes.split(/[\s,]+/).filter(Boolean),
      nom,
      sexe: sexe === 'M' || sexe === 'F' ? sexe : '',
      profession: enfants(r, 'OCCU').map((o) => o.valeur.trim()).filter(Boolean).join(', '),
      naissance: evenement(enfant(r, 'BIRT')),
      deces: evenement(enfant(r, 'DEAT')),
      famc: enfants(r, 'FAMC').map((f) => f.valeur.trim()),
      fams: enfants(r, 'FAMS').map((f) => f.valeur.trim()),
    })
  }
  const familles = new Map<string, FamilleGed>()
  for (const r of racines.filter((x) => x.tag === 'FAM' && x.xref)) {
    familles.set(r.xref!, {
      id: r.xref!,
      mari: valeur(r, 'HUSB') || null,
      femme: valeur(r, 'WIFE') || null,
      enfants: enfants(r, 'CHIL').map((c) => c.valeur.trim()),
      mariage: evenement(enfant(r, 'MARR')),
    })
  }
  if (!personnes.size) throw new Error('Aucun individu (INDI) dans ce fichier GEDCOM.')
  return { personnes, familles, logiciel: valeur(tete, 'SOUR') }
}

// ------------------------------------------------------- préparation import
export const nomPersonne = (p: PersonneGed) => `${p.prenoms.join(' ')} ${p.nom}`.trim() || p.id
const cle = (prenom: string, nom: string) => `${normaliserTexte(prenom)}|${normaliserTexte(nom)}`

/** La souche probable dans le fichier : même premier prénom et même nom que la souche de l'appli. */
export function trouverSouche(ged: Gedcom, souche: Individu | null): string | null {
  if (!souche) return null
  const c = cle(souche.prenom1, souche.nom)
  const candidats = [...ged.personnes.values()].filter((p) => cle(p.prenoms[0] ?? '', p.nom) === c)
  const annee = souche.naissance_date.slice(-4)
  return (candidats.find((p) => annee && p.naissance?.date.endsWith(annee)) ?? candidats[0])?.id ?? null
}

export interface ImportPlan {
  aAjouter: { niveau: string; nom: string; saisie: Saisie }[]
  dejaPresents: { niveau: string; nomFichier: string; nomAppli: string; memeNom: boolean }[]
  horsLignee: number
  total: number
}

function versSaisie(p: PersonneGed, niveau: string, mariage: EvenementGed | null): Saisie {
  const s = saisieVide()
  s.niveau = niveau
  s.prenom1 = p.prenoms[0] ?? ''
  s.prenom2 = p.prenoms[1] ?? ''
  s.prenom3 = p.prenoms.slice(2).join(' ')
  s.nom = p.nom.toLocaleUpperCase('fr-FR')
  s.profession = p.profession
  const ecrire = (ev: Evenement, e: EvenementGed | null) => {
    if (!e) return
    s[`${ev}_date`] = e.date
    for (const l of LIEUX) s[`${ev}_${l}`] = e.lieu[l]
    s[`${ev}_source`] = e.source
  }
  ecrire('naissance', p.naissance)
  ecrire('mariage', mariage)
  ecrire('deces', p.deces)
  if (!s.prenom1 && !s.nom) s.prenom1 = '?'
  return s
}

/**
 * Parcourt la lignée à partir de la souche du fichier et décide, individu par individu,
 * s'il est ajouté ou déjà présent (version de l'appli conservée, dates ignorées).
 */
export function planifierImport(ged: Gedcom, soucheGed: string, existants: Individu[], niveauSouche = '0'): ImportPlan {
  const parNiveau = new Map<string, Individu>()
  for (const i of [...existants].sort((a, b) => a.id - b.id)) if (!parNiveau.has(i.niveau)) parNiveau.set(i.niveau, i)
  const parNom = new Set(existants.map((i) => cle(i.prenom1, i.nom)))
  const plan: ImportPlan = { aAjouter: [], dejaPresents: [], horsLignee: 0, total: ged.personnes.size }
  const vus = new Set<string>()
  const niveauxPris = new Set(parNiveau.keys())

  const file: { id: string; niveau: string; mariage: EvenementGed | null }[] = []
  const souche = ged.personnes.get(soucheGed)
  if (!souche) throw new Error('Souche introuvable dans le fichier.')
  // conjoint de la souche : première famille où la souche est époux / épouse
  const famSouche = souche.fams.map((f) => ged.familles.get(f)).find((f) => f && (f.mari === soucheGed ? f.femme : f.mari))
  const conjoint = famSouche ? (famSouche.mari === soucheGed ? famSouche.femme : famSouche.mari) : null
  file.push({ id: soucheGed, niveau: niveauSouche, mariage: famSouche?.mariage ?? null })
  if (conjoint) file.push({ id: conjoint, niveau: niveauSouche.slice(0, -1) + (niveauSouche.endsWith('0') ? '1' : '0'), mariage: famSouche?.mariage ?? null })

  while (file.length) {
    const { id, niveau, mariage } = file.shift()!
    const p = ged.personnes.get(id)
    if (!p || vus.has(id)) continue
    vus.add(id)
    const present = parNiveau.get(niveau)
    if (present?.inconnu) {
      // parent inconnu dans l'appli : la version de l'appli prévaut, sa branche reste fermée
      plan.dejaPresents.push({ niveau, nomFichier: nomPersonne(p), nomAppli: 'Parent inconnu', memeNom: false })
      continue
    }
    if (present) {
      const memeNom = cle(present.prenom1, present.nom) === cle(p.prenoms[0] ?? '', p.nom)
      plan.dejaPresents.push({ niveau, nomFichier: nomPersonne(p), nomAppli: `${present.prenom1} ${present.nom}`.trim(), memeNom })
    } else if (parNom.has(cle(p.prenoms[0] ?? '', p.nom))) {
      // même personne déjà dans l'appli à une autre place : on n'y touche pas
      plan.dejaPresents.push({ niveau, nomFichier: nomPersonne(p), nomAppli: nomPersonne(p), memeNom: true })
    } else if (!niveauxPris.has(niveau)) {
      plan.aAjouter.push({ niveau, nom: nomPersonne(p), saisie: versSaisie(p, niveau, mariage) })
      niveauxPris.add(niveau)
    }
    // ses parents : famille d'origine (FAMC)
    const fam = p.famc.map((f) => ged.familles.get(f)).find(Boolean)
    if (fam) {
      if (fam.mari) file.push({ id: fam.mari, niveau: niveau + '0', mariage: fam.mariage })
      if (fam.femme) file.push({ id: fam.femme, niveau: niveau + '1', mariage: fam.mariage })
    }
  }
  plan.horsLignee = ged.personnes.size - vus.size
  plan.aAjouter.sort((a, b) => a.niveau.length - b.niveau.length || (a.niveau < b.niveau ? -1 : 1))
  return plan
}

// ------------------------------------------------------------------ export
/** Coupe les valeurs longues en CONC (248 caractères max par ligne). */
function ligne(niveau: number, tag: string, val = '', xref = ''): string[] {
  const morceaux = val.split('\n')
  const lignes: string[] = []
  morceaux.forEach((m, i) => {
    const decoupe = m.match(/.{1,240}/gsu) ?? ['']
    decoupe.forEach((d, j) => {
      if (i === 0 && j === 0) lignes.push([niveau, xref, tag, d].filter((x) => x !== '').join(' '))
      else lignes.push(`${niveau + 1} ${j === 0 ? 'CONT' : 'CONC'}${d ? ' ' + d : ''}`)
    })
  })
  return lignes
}

export function exporterGedcom(individus: Individu[], version: string): string {
  const parNiveau = new Map<string, Individu>()
  // un parent inconnu n'est pas exporté (la famille n'a alors qu'un parent)
  for (const i of [...individus].sort((a, b) => a.id - b.id)) if (!i.inconnu && !parNiveau.has(i.niveau)) parNiveau.set(i.niveau, i)
  const ref = (i: Individu) => `@I${i.id}@`

  // familles : un couple = préfixe P (P0 + P1), enfant = P
  const prefixes = [...new Set([...parNiveau.keys()].map((n) => n.slice(0, -1)))].sort(
    (a, b) => a.length - b.length || (a < b ? -1 : 1),
  )
  const familles = prefixes
    .map((p) => ({ p, mari: parNiveau.get(p + '0'), femme: parNiveau.get(p + '1'), enfant: p ? parNiveau.get(p) : undefined }))
    .filter((f) => (f.mari && f.femme) || ((f.mari || f.femme) && f.enfant))
    .map((f, n) => ({ ...f, ref: `@F${n + 1}@` }))
  const famDeCouple = new Map(familles.map((f) => [f.p, f.ref]))

  const maintenant = new Date()
  const out: string[] = [
    '0 HEAD', '1 SOUR LAUBRE', '2 NAME Laubre', `2 VERS ${version}`,
    `1 DATE ${maintenant.getDate()} ${MOIS_GED[maintenant.getMonth()]} ${maintenant.getFullYear()}`,
    '1 SUBM @U1@', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', '1 LANG French',
    '1 PLAC', '2 FORM Commune, Code postal, Département, Région, Pays',
    '0 @U1@ SUBM', '1 NAME Laubre',
  ]
  const evenementGed = (i: Individu, ev: Evenement, tag: string, niveau = 1) => {
    if (i.sansObjet.includes(ev)) return []
    const date = dateVersGedcom(i[`${ev}_date`])
    const plac = lieuVersGedcom(i, ev)
    const source = i[`${ev}_source`].trim()
    if (!date && !plac && !source) return []
    return [
      `${niveau} ${tag}`,
      ...(date ? [`${niveau + 1} DATE ${date}`] : []),
      ...(plac ? ligne(niveau + 1, 'PLAC', plac) : []),
      ...(source ? ligne(niveau + 1, 'SOUR', source) : []),
    ]
  }
  for (const i of [...parNiveau.values()]) {
    const prenoms = [i.prenom1, i.prenom2, i.prenom3].filter(Boolean).join(' ')
    out.push(
      `0 ${ref(i)} INDI`,
      ...ligne(1, 'NAME', `${prenoms} /${i.nom}/`.trim()),
      ...(prenoms ? ligne(2, 'GIVN', prenoms) : []),
      ...(i.nom ? ligne(2, 'SURN', i.nom) : []),
      `1 SEX ${i.niveau.endsWith('1') ? 'F' : 'M'}`,
      ...(i.profession ? ligne(1, 'OCCU', i.profession) : []),
      ...evenementGed(i, 'naissance', 'BIRT'),
      ...evenementGed(i, 'deces', 'DEAT'),
      `1 REFN ${i.niveau}`, '2 TYPE Laubre niveau',
    )
    const famc = i.niveau ? famDeCouple.get(i.niveau) : undefined
    if (famc && (parNiveau.has(i.niveau + '0') || parNiveau.has(i.niveau + '1'))) out.push(`1 FAMC ${famc}`)
    const fams = famDeCouple.get(i.niveau.slice(0, -1))
    if (fams) out.push(`1 FAMS ${fams}`)
  }
  for (const f of familles) {
    out.push(`0 ${f.ref} FAM`)
    if (f.mari) out.push(`1 HUSB ${ref(f.mari)}`)
    if (f.femme) out.push(`1 WIFE ${ref(f.femme)}`)
    if (f.enfant) out.push(`1 CHIL ${ref(f.enfant)}`)
    const source = [f.mari, f.femme].find((x) => x && (x.mariage_date || x.mariage_ville || x.mariage_source))
    if (source) out.push(...evenementGed(source, 'mariage', 'MARR'))
  }
  out.push('0 TRLR')
  return out.join('\r\n') + '\r\n'
}

// -------------------------------------------------- sélection avant import
/**
 * Garde la sélection cohérente avec la lignée : décocher quelqu'un décoche aussi
 * ses ascendants (niveaux qui commencent par le sien) ; cocher quelqu'un coche
 * aussi ses descendants à ajouter (préfixes de son niveau), pour qu'il soit
 * relié à l'arbre.
 */
export function basculerIndividu(selection: Set<string>, niveau: string, possibles: readonly string[]): Set<string> {
  const s = new Set(selection)
  if (s.has(niveau)) {
    for (const n of s) if (n.startsWith(niveau)) s.delete(n)
  } else {
    for (const n of possibles) if (niveau.startsWith(n)) s.add(n)
  }
  return s
}

/** Coche / décoche toute une génération (génération g = niveau de g + 1 chiffres). */
export function basculerGeneration(selection: Set<string>, generation: number, possibles: readonly string[]): Set<string> {
  const membres = possibles.filter((n) => n.length === generation + 1)
  const tous = membres.every((n) => selection.has(n))
  let s = new Set(selection)
  for (const n of membres) if (s.has(n) === tous) s = basculerIndividu(s, n, possibles)
  return s
}
