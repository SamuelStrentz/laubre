/**
 * Accès aux données : portage de la classe Base du logiciel Python.
 * Chaque écriture est enregistrée immédiatement (pas de bouton « Enregistrer » sur mobile).
 */
import type { SqlDb } from '@/db/sql'
import { CHAMPS_EVT, COLONNES_AJOUTEES, EVENEMENTS, LIEUX, REQUETE, SCHEMA, TRI_STANDARD, type Evenement } from '@/db/schema'
import {
  assemblerDate, dateValide, decouperDate, nettoyer, RE_NIVEAU,
  type Barre, type Individu, type LigneJauge, type Saisie, type Statistiques, type StatsDetaillees,
} from '@/domain/individu'

type Ligne = Record<string, string | number | null>

/** Tables du logiciel PC + ajouts de Laubre (table evenement_info, colonne profession). */
function completerStructure(db: SqlDb): void {
  db.exec(SCHEMA)
  for (const [table, colonne, type] of COLONNES_AJOUTEES) {
    if (!db.colonnes(table).includes(colonne)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${type}`)
  }
}

export function creerStructure(db: SqlDb): void {
  db.tx(() => completerStructure(db))
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
  // colonnes du logiciel PC (profession est ajoutée par Laubre si besoin)
  const manquantes = ['id', 'niveau', 'prenom1', 'prenom2', 'prenom3', 'nom', 'souche'].filter((c) => !cols.includes(c))
  if (manquantes.length) throw new Error(`Table « identite » incompatible, colonnes manquantes : ${manquantes.join(', ')}`)
  db.tx(() => completerStructure(db)) // crée les tables liées manquantes
}

function versIndividu(r: Ligne): Individu {
  const d: Record<string, unknown> = {
    id: Number(r.id),
    niveau: String(r.niveau ?? ''),
    souche: Number(r.souche) === 1,
    famille: r.famille === null || r.famille === undefined ? null : Number(r.famille),
    sansObjet: EVENEMENTS.filter((ev) => Number(r[`${ev}_sans_objet`]) === 1),
  }
  for (const k of ['prenom1', 'prenom2', 'prenom3', 'nom', 'profession']) d[k] = String(r[k] ?? '')
  for (const ev of EVENEMENTS) {
    const n = (c: string) => (r[`${ev}_${c}`] === null || r[`${ev}_${c}`] === undefined ? null : Number(r[`${ev}_${c}`]))
    d[`${ev}_date`] = assemblerDate(n('jour'), n('mois'), n('annee'))
    for (const c of LIEUX) d[`${ev}_${c}`] = String(r[`${ev}_${c}`] ?? '')
    d[`${ev}_source`] = String(r[`${ev}_source`] ?? '')
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

/** Source et « non renseigné » d'un événement (table evenement_info). */
function ecrireInfo(db: SqlDb, id: number, ev: Evenement, source: string, sansObjet: boolean): void {
  db.run('DELETE FROM evenement_info WHERE id = ? AND evenement = ?', [id, ev])
  if (!sansObjet && !source.trim()) return
  db.run('INSERT INTO evenement_info (id, evenement, sans_objet, source) VALUES (?, ?, ?, ?)', [id, ev, sansObjet ? 1 : 0, source.trim()])
}

/** Un événement « non renseigné » n'a aucune donnée. */
function preparer(donnees: Partial<Saisie>, sansObjet: readonly Evenement[]): Saisie {
  const s = nettoyer(donnees)
  for (const ev of sansObjet) for (const c of CHAMPS_EVT) s[`${ev}_${c}`] = ''
  return s
}

function ecrireTout(db: SqlDb, id: number, s: Saisie, sansObjet: readonly Evenement[]): void {
  for (const ev of EVENEMENTS) {
    ecrireEvenement(db, id, ev, s)
    ecrireInfo(db, id, ev, s[`${ev}_source`], sansObjet.includes(ev))
  }
}

function inserer(db: SqlDb, s: Saisie, souche: boolean, sansObjet: readonly Evenement[]): number {
  const { lastId } = db.run(
    'INSERT INTO identite (niveau, prenom1, prenom2, prenom3, nom, souche, profession) VALUES (?,?,?,?,?,?,?)',
    [s.niveau, s.prenom1, s.prenom2, s.prenom3, s.nom, souche ? 1 : 0, s.profession],
  )
  ecrireTout(db, lastId, s, sansObjet)
  return lastId
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

export function ajouter(db: SqlDb, donnees: Partial<Saisie>, souche = false, sansObjet: readonly Evenement[] = []): number {
  const s = preparer(donnees, sansObjet)
  controler(s)
  return db.tx(() => {
    const id = inserer(db, s, souche, sansObjet)
    recalculerFamilles(db)
    return id
  })
}

/** Le niveau n'est pas modifiable ici : il est fixé à la création (sa place dans l'arbre). */
export function modifier(db: SqlDb, id: number, donnees: Partial<Saisie>, sansObjet: readonly Evenement[] = []): void {
  const niveau = db.valeur<string>('SELECT niveau FROM identite WHERE id = ?', [id])
  if (niveau === undefined) throw new Error('Individu introuvable.')
  const s = preparer({ ...donnees, niveau }, sansObjet)
  controler(s)
  db.tx(() => {
    // prenom1 / nom sont recopiés automatiquement dans les tables liées (CASCADE)
    db.run('UPDATE identite SET prenom1=?, prenom2=?, prenom3=?, nom=?, profession=? WHERE id=?',
      [s.prenom1, s.prenom2, s.prenom3, s.nom, s.profession, id])
    ecrireTout(db, id, s, sansObjet)
    recalculerFamilles(db)
  })
}

/** Ajout en lot (import GEDCOM) : une seule transaction, familles recalculées une fois. */
export function ajouterLot(db: SqlDb, lot: { saisie: Partial<Saisie> }[]): number {
  return db.tx(() => {
    for (const { saisie } of lot) {
      const s = preparer(saisie, [])
      controler(s)
      inserer(db, s, false, [])
    }
    recalculerFamilles(db)
    return lot.length
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
const pct = (n: number, total: number) => (total ? Math.round((1000 * n) / total) / 10 : 0)
const jauge = (champ: string, renseignes: number, total: number): LigneJauge => ({
  champ, renseignes, total, pourcentage: pct(renseignes, total),
})
const sansObjet = (alias: string, ev: Evenement) =>
  `EXISTS (SELECT 1 FROM evenement_info x WHERE x.id = ${alias}.id AND x.evenement = '${ev}' AND x.sans_objet = 1)`

export function statistiques(db: SqlDb): Statistiques {
  const individus = db.valeur<number>('SELECT COUNT(*) FROM identite') ?? 0
  const familles = db.valeur<number>('SELECT COUNT(DISTINCT numero_famille) FROM famille') ?? 0
  const generations = db.valeur<number>('SELECT COUNT(DISTINCT length(niveau)) FROM identite') ?? 0
  // Complétude (requête « Qualité » du logiciel PC) : un événement déclaré « non renseigné »
  // (pastille grise, ex. décès d'une personne vivante) compte comme complet.
  const compter = (condition: string) =>
    db.valeur<number>(`SELECT COUNT(*) FROM identite i
      LEFT JOIN naissance n ON n.id = i.id LEFT JOIN mariage m ON m.id = i.id LEFT JOIN deces d ON d.id = i.id
      WHERE ${condition}`) ?? 0
  const completude = individus
    ? [
        jauge('Date de naissance', compter(`n.annee IS NOT NULL OR ${sansObjet('i', 'naissance')}`), individus),
        jauge('Ville de naissance', compter(`COALESCE(n.ville, '') <> '' OR ${sansObjet('i', 'naissance')}`), individus),
        jauge('Date de mariage', compter(`m.annee IS NOT NULL OR ${sansObjet('i', 'mariage')}`), individus),
        jauge('Date de décès', compter(`d.annee IS NOT NULL OR ${sansObjet('i', 'deces')}`), individus),
      ]
    : []
  // Actes sourcés : parmi les événements renseignés (une date ou une ville), ceux qui ont une source.
  const sources: LigneJauge[] = []
  let totalActes = 0
  let totalSources = 0
  for (const [ev, libelle] of [['naissance', 'Naissances'], ['mariage', 'Mariages'], ['deces', 'Décès']] as const) {
    const acte = `(e.annee IS NOT NULL OR TRIM(COALESCE(e.ville, '')) <> '')`
    const actes = db.valeur<number>(`SELECT COUNT(*) FROM ${ev} e WHERE ${acte}`) ?? 0
    const avec = db.valeur<number>(
      `SELECT COUNT(*) FROM ${ev} e JOIN evenement_info x ON x.id = e.id AND x.evenement = '${ev}'
       WHERE ${acte} AND x.source <> ''`,
    ) ?? 0
    totalActes += actes
    totalSources += avec
    sources.push(jauge(libelle, avec, actes))
  }
  if (totalActes) sources.unshift(jauge('Tous les actes', totalSources, totalActes))
  return { individus, familles, generations, completude, sources }
}

/** Statistiques détaillées (écran Stats) : reprises des requêtes du logiciel PC. */
export function statistiquesDetaillees(db: SqlDb): StatsDetaillees {
  const barres = (sql: string) =>
    db.all<{ libelle: string | number; valeur: number; detail?: string }>(sql).map((r) => ({
      libelle: String(r.libelle), valeur: Number(r.valeur), ...(r.detail ? { detail: String(r.detail) } : {}),
    }))
  const repartition = (champ: string, limite = 10): Barre[] =>
    barres(`SELECT n.${champ} AS libelle, COUNT(*) AS valeur FROM naissance n
            WHERE TRIM(COALESCE(n.${champ}, '')) <> '' GROUP BY n.${champ} COLLATE NOCASE
            ORDER BY valeur DESC, libelle LIMIT ${limite}`)
  return {
    hommes: db.valeur<number>("SELECT COUNT(*) FROM identite WHERE substr(niveau, -1) = '0'") ?? 0,
    femmes: db.valeur<number>("SELECT COUNT(*) FROM identite WHERE substr(niveau, -1) = '1'") ?? 0,
    parGeneration: barres(`SELECT 'Génération ' || (length(niveau) - 1) AS libelle, COUNT(*) AS valeur
                           FROM identite GROUP BY length(niveau) ORDER BY length(niveau)`),
    departements: repartition('departement'),
    regions: repartition('region'),
    pays: repartition('pays', 6),
    villes: repartition('ville'),
    ageDeces: barres(`SELECT 'Génération ' || (length(i.niveau) - 1) AS libelle,
                        ROUND(AVG(d.annee - n.annee), 1) AS valeur,
                        COUNT(*) || ' pers. · ' || MIN(d.annee - n.annee) || ' à ' || MAX(d.annee - n.annee) || ' ans' AS detail
                      FROM identite i JOIN naissance n ON n.id = i.id JOIN deces d ON d.id = i.id
                      WHERE n.annee IS NOT NULL AND d.annee IS NOT NULL
                      GROUP BY length(i.niveau) ORDER BY length(i.niveau)`),
    ageMariage: barres(`SELECT CASE substr(i.niveau, -1) WHEN '0' THEN 'Hommes' ELSE 'Femmes' END AS libelle,
                          ROUND(AVG(m.annee - n.annee), 1) AS valeur, COUNT(*) || ' pers.' AS detail
                        FROM identite i JOIN naissance n ON n.id = i.id JOIN mariage m ON m.id = i.id
                        WHERE n.annee IS NOT NULL AND m.annee IS NOT NULL
                        GROUP BY substr(i.niveau, -1) ORDER BY substr(i.niveau, -1)`),
    decennies: barres(`SELECT (n.annee / 10) * 10 AS libelle, COUNT(*) AS valeur FROM naissance n
                       WHERE n.annee IS NOT NULL GROUP BY n.annee / 10 ORDER BY n.annee / 10`),
    prenoms: barres(`SELECT prenom AS libelle, COUNT(*) AS valeur FROM (
                       SELECT prenom1 AS prenom FROM identite UNION ALL SELECT prenom2 FROM identite
                       UNION ALL SELECT prenom3 FROM identite)
                     WHERE TRIM(COALESCE(prenom, '')) <> '' GROUP BY prenom COLLATE NOCASE
                     ORDER BY valeur DESC, libelle LIMIT 10`),
    noms: barres(`SELECT nom AS libelle, COUNT(*) AS valeur FROM identite WHERE nom <> ''
                  GROUP BY nom COLLATE NOCASE ORDER BY valeur DESC, libelle LIMIT 10`),
  }
}
