/**
 * Accès aux données : portage de la classe Base du logiciel Python.
 * Chaque écriture est enregistrée immédiatement (pas de bouton « Enregistrer » sur mobile).
 */
import type { SqlDb } from '@/db/sql'
import { CHAMPS_EVT, EVENEMENTS, LIEUX, REQUETE, SCHEMA, TRI_STANDARD, type Evenement } from '@/db/schema'
import {
  CHAMPS_IDENTITE, assemblerDate, dateValide, decouperDate, nettoyer, RE_NIVEAU,
  type Individu, type Saisie, type Statistiques,
} from '@/domain/individu'

type Ligne = Record<string, string | number | null>

export function creerStructure(db: SqlDb): void {
  db.tx(() => db.exec(SCHEMA))
}

/** Contrôle qu'une base est bien un arbre (table identite complète) et crée les tables liées manquantes. */
export function verifierStructure(db: SqlDb): void {
  if (!db.tableExiste('identite')) {
    if (db.tableExiste('individus')) {
      throw new Error("Base créée avec la toute première version du logiciel PC : ouvre-la d'abord dans le logiciel PC pour la convertir.")
    }
    throw new Error('Cette base ne contient pas de table « identite ».')
  }
  const cols = db.colonnes('identite')
  const manquantes = ['id', ...CHAMPS_IDENTITE, 'souche'].filter((c) => !cols.includes(c))
  if (manquantes.length) throw new Error(`Table « identite » incompatible, colonnes manquantes : ${manquantes.join(', ')}`)
  db.exec(SCHEMA) // crée les tables liées manquantes
}

function versIndividu(r: Ligne): Individu {
  const d: Record<string, unknown> = {
    id: Number(r.id),
    niveau: String(r.niveau ?? ''),
    souche: Number(r.souche) === 1,
    famille: r.famille === null || r.famille === undefined ? null : Number(r.famille),
  }
  for (const k of ['prenom1', 'prenom2', 'prenom3', 'nom']) d[k] = String(r[k] ?? '')
  for (const ev of EVENEMENTS) {
    const n = (c: string) => (r[`${ev}_${c}`] === null || r[`${ev}_${c}`] === undefined ? null : Number(r[`${ev}_${c}`]))
    d[`${ev}_date`] = assemblerDate(n('jour'), n('mois'), n('annee'))
    for (const c of LIEUX) d[`${ev}_${c}`] = String(r[`${ev}_${c}`] ?? '')
  }
  return d as unknown as Individu
}

// ------------------------------------------------------------------ lecture
export function tous(db: SqlDb): Individu[] {
  return db.all<Ligne>(`${REQUETE} ORDER BY ${TRI_STANDARD}`).map(versIndividu)
}

export function charger(db: SqlDb, id: number): Individu | null {
  const r = db.get<Ligne>(`${REQUETE} WHERE i.id = ?`, [id])
  return r ? versIndividu(r) : null
}

export function noms(db: SqlDb): string[] {
  return db
    .all<{ nom: string }>("SELECT DISTINCT nom FROM identite WHERE nom <> '' ORDER BY nom COLLATE NOCASE")
    .map((r) => r.nom)
}

/** Premier individu enregistré avec ce niveau (ou null). */
export function parNiveau(db: SqlDb, niveau: string): Individu | null {
  const id = db.valeur<number>('SELECT id FROM identite WHERE niveau = ? ORDER BY id LIMIT 1', [niveau])
  return id === undefined ? null : charger(db, id)
}

export function niveauExiste(db: SqlDb, niveau: string, exclureId: number | null = null): boolean {
  return db.valeur('SELECT 1 FROM identite WHERE niveau = ? AND id IS NOT ? LIMIT 1', [niveau, exclureId]) === 1
}

export function aSouche(db: SqlDb): boolean {
  return db.valeur('SELECT 1 FROM identite WHERE souche = 1') === 1
}

/**
 * Valeurs proposées pour un nouvel individu de ce niveau (comme le logiciel PC) :
 * - pays : celui de l'individu du niveau inférieur (l'enfant, ex. 0000 pour 00000), sinon France ;
 * - région / département : ceux de ce même enfant, pour naissance, mariage et décès ;
 * - mariage : recopié depuis le conjoint s'il est déjà saisi (000 pour 001).
 */
export function defauts(db: SqlDb, niveau: string): Partial<Saisie> {
  const d: Partial<Saisie> = {}
  for (const ev of EVENEMENTS) d[`${ev}_pays`] = 'France'
  if (!RE_NIVEAU.test(niveau)) return d
  const enfant = niveau.length > 1 ? parNiveau(db, niveau.slice(0, -1)) : null
  if (enfant) {
    const ref = EVENEMENTS.find((ev) => enfant[`${ev}_region`] || enfant[`${ev}_departement`])
    const pays = EVENEMENTS.map((ev) => enfant[`${ev}_pays`]).find(Boolean) || 'France'
    for (const ev of EVENEMENTS) {
      d[`${ev}_pays`] = pays
      if (ref) {
        d[`${ev}_region`] = enfant[`${ref}_region`]
        d[`${ev}_departement`] = enfant[`${ref}_departement`]
      }
    }
  }
  const conjoint = parNiveau(db, niveau.slice(0, -1) + (niveau.slice(-1) === '0' ? '1' : '0'))
  if (conjoint) {
    for (const c of CHAMPS_EVT) if (conjoint[`mariage_${c}`]) d[`mariage_${c}`] = conjoint[`mariage_${c}`]
  }
  return d
}

// ------------------------------------------------------------------ écriture
/** (Ré)écrit la ligne d'un événement ; aucune ligne si tout est vide. */
function ecrireEvenement(db: SqlDb, id: number, ev: Evenement, s: Saisie): void {
  db.run(`DELETE FROM ${ev} WHERE id = ?`, [id])
  const [jour, mois, annee] = decouperDate(s[`${ev}_date`])
  const lieux = LIEUX.map((c) => s[`${ev}_${c}`].trim())
  if (!(jour || mois || annee || lieux.some(Boolean))) return
  db.run(
    `INSERT INTO ${ev} (id, prenom1, nom, jour, mois, annee, ${LIEUX.join(',')})
     SELECT id, prenom1, nom, ?, ?, ?, ${LIEUX.map(() => '?').join(',')} FROM identite WHERE id = ?`,
    [jour, mois, annee, ...lieux, id],
  )
}

/**
 * Une famille = un homme (P0) + une femme (P1) partageant le même préfixe P.
 * Numérotation dans l'ordre de la vue standard : ('' -> 0 et 1), puis (0 -> 00 et 01), (1 -> 10 et 11)…
 */
export function recalculerFamilles(db: SqlDb): void {
  const parNiv = new Map<string, number>()
  for (const r of db.all<{ id: number; niveau: string }>('SELECT id, niveau FROM identite ORDER BY id')) {
    if (!parNiv.has(r.niveau)) parNiv.set(r.niveau, r.id)
  }
  const prefixes = [...new Set([...parNiv.keys()].map((n) => n.slice(0, -1)))].sort(
    (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
  )
  db.run('DELETE FROM famille')
  let numero = 0
  for (const p of prefixes) {
    const homme = parNiv.get(p + '0')
    const femme = parNiv.get(p + '1')
    if (homme && femme) {
      numero++
      for (const id of [homme, femme]) {
        db.run('INSERT INTO famille (id, prenom1, nom, numero_famille) SELECT id, prenom1, nom, ? FROM identite WHERE id = ?', [numero, id])
      }
    }
  }
}

function controler(s: Saisie): void {
  if (!s.niveau || !RE_NIVEAU.test(s.niveau)) throw new Error('Le niveau est obligatoire et ne doit contenir que des 0 et des 1.')
  if (!s.prenom1 && !s.nom) throw new Error('Renseigne au moins un premier prénom ou un nom de famille.')
  for (const ev of EVENEMENTS) {
    if (!dateValide(s[`${ev}_date`])) throw new Error('Date invalide. Formats acceptés : JJ/MM/AAAA, MM/AAAA ou AAAA.')
  }
}

export function ajouter(db: SqlDb, donnees: Partial<Saisie>, souche = false): number {
  const s = nettoyer(donnees)
  controler(s)
  return db.tx(() => {
    const { lastId } = db.run(
      'INSERT INTO identite (niveau, prenom1, prenom2, prenom3, nom, souche) VALUES (?,?,?,?,?,?)',
      [s.niveau, s.prenom1, s.prenom2, s.prenom3, s.nom, souche ? 1 : 0],
    )
    for (const ev of EVENEMENTS) ecrireEvenement(db, lastId, ev, s)
    recalculerFamilles(db)
    return lastId
  })
}

export function modifier(db: SqlDb, id: number, donnees: Partial<Saisie>): void {
  const s = nettoyer(donnees)
  controler(s)
  db.tx(() => {
    // prenom1 / nom sont recopiés automatiquement dans les tables liées (CASCADE)
    db.run('UPDATE identite SET niveau=?, prenom1=?, prenom2=?, prenom3=?, nom=? WHERE id=?',
      [s.niveau, s.prenom1, s.prenom2, s.prenom3, s.nom, id])
    for (const ev of EVENEMENTS) ecrireEvenement(db, id, ev, s)
    recalculerFamilles(db)
  })
}

export function supprimer(db: SqlDb, id: number): void {
  const souche = db.valeur<number>('SELECT souche FROM identite WHERE id = ?', [id])
  if (souche === undefined) return
  const total = db.valeur<number>('SELECT COUNT(*) FROM identite') ?? 0
  if (souche === 1 && total > 1) throw new Error("La souche ne peut pas être supprimée tant que d'autres individus existent.")
  db.tx(() => {
    db.run('DELETE FROM identite WHERE id = ?', [id]) // CASCADE
    recalculerFamilles(db)
  })
}

// ------------------------------------------------------------- statistiques
export function statistiques(db: SqlDb): Statistiques {
  const individus = db.valeur<number>('SELECT COUNT(*) FROM identite') ?? 0
  const familles = db.valeur<number>('SELECT COUNT(DISTINCT numero_famille) FROM famille') ?? 0
  const generations = db.valeur<number>('SELECT COUNT(DISTINCT length(niveau)) FROM identite') ?? 0
  // Requête « Qualité · complétude des données » du logiciel PC
  const completude = individus
    ? db.all<Statistiques['completude'][number]>(`
SELECT 'Date de naissance' AS champ, SUM(n.annee IS NOT NULL) AS renseignes, COUNT(*) AS total,
       ROUND(100.0 * SUM(n.annee IS NOT NULL) / COUNT(*), 1) AS pourcentage
FROM identite i LEFT JOIN naissance n ON n.id = i.id
UNION ALL
SELECT 'Ville de naissance', SUM(COALESCE(n.ville, '') <> ''), COUNT(*),
       ROUND(100.0 * SUM(COALESCE(n.ville, '') <> '') / COUNT(*), 1)
FROM identite i LEFT JOIN naissance n ON n.id = i.id
UNION ALL
SELECT 'Date de mariage', SUM(m.annee IS NOT NULL), COUNT(*),
       ROUND(100.0 * SUM(m.annee IS NOT NULL) / COUNT(*), 1)
FROM identite i LEFT JOIN mariage m ON m.id = i.id
UNION ALL
SELECT 'Date de décès', SUM(d.annee IS NOT NULL), COUNT(*),
       ROUND(100.0 * SUM(d.annee IS NOT NULL) / COUNT(*), 1)
FROM identite i LEFT JOIN deces d ON d.id = i.id`)
    : []
  return { individus, familles, generations, completude }
}
