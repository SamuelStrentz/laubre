/**
 * Structure de la base : identique au logiciel PC « Arbre généalogique » (Python, v4).
 * Une même base .db s'ouvre donc dans la PWA, dans le logiciel PC et dans DB Browser for SQLite.
 *
 * Niveau : 0 = homme, 1 = femme.
 *   0 = la souche (vous)   1 = sa conjointe
 *   00 = père, 01 = mère   10 = père de 1, 11 = mère de 1   000 = père de 00…
 */
export const EVENEMENTS = ['naissance', 'mariage', 'deces'] as const
export type Evenement = (typeof EVENEMENTS)[number]
export const TITRES_EVT: Record<Evenement, string> = { naissance: 'Naissance', mariage: 'Mariage', deces: 'Décès' }
const ALIAS_EVT: Record<Evenement, string> = { naissance: 'n', mariage: 'm', deces: 'd' }

export const LIEUX = ['ville', 'cp', 'departement', 'region', 'pays'] as const
export type Lieu = (typeof LIEUX)[number]
/** « source » (acte, URL…) est rangée dans la table evenement_info, pas dans la table de l'événement. */
export const CHAMPS_EVT = ['date', ...LIEUX, 'source'] as const
export type ChampEvt = (typeof CHAMPS_EVT)[number]

const LIEN = `,
    prenom1 TEXT NOT NULL DEFAULT '',
    nom     TEXT NOT NULL DEFAULT '',`
const FK = `,
    FOREIGN KEY (id, prenom1, nom) REFERENCES identite (id, prenom1, nom)
        ON UPDATE CASCADE ON DELETE CASCADE`

export const SCHEMA =
  `
CREATE TABLE IF NOT EXISTS identite (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    niveau  TEXT NOT NULL,
    prenom1 TEXT NOT NULL DEFAULT '',
    prenom2 TEXT DEFAULT '',
    prenom3 TEXT DEFAULT '',
    nom     TEXT NOT NULL DEFAULT '',
    souche  INTEGER NOT NULL DEFAULT 0 CHECK (souche IN (0, 1)),
    UNIQUE (id, prenom1, nom)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_une_seule_souche ON identite (souche) WHERE souche = 1;
` +
  EVENEMENTS.map(
    (ev) => `
CREATE TABLE IF NOT EXISTS ${ev} (
    id INTEGER PRIMARY KEY${LIEN}
    jour INTEGER, mois INTEGER, annee INTEGER,
    ville TEXT DEFAULT '', cp TEXT DEFAULT '', departement TEXT DEFAULT '',
    region TEXT DEFAULT '', pays TEXT DEFAULT ''${FK}
);
`,
  ).join('') +
  `
CREATE TABLE IF NOT EXISTS famille (
    id INTEGER PRIMARY KEY${LIEN}
    numero_famille INTEGER NOT NULL${FK}
);
` +
  // Ajouts de Laubre (lot 3), dans une table à part : le logiciel PC réécrit les lignes
  // naissance / mariage / deces à chaque modification, il effacerait des colonnes ajoutées.
  `
CREATE TABLE IF NOT EXISTS evenement_info (
    id         INTEGER NOT NULL REFERENCES identite (id) ON DELETE CASCADE,
    evenement  TEXT NOT NULL CHECK (evenement IN ('naissance', 'mariage', 'deces')),
    sans_objet INTEGER NOT NULL DEFAULT 0 CHECK (sans_objet IN (0, 1)),
    source     TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (id, evenement)
);
`

/** Colonnes ajoutées aux tables du logiciel PC (ignorées par lui, conservées à ses modifications). */
export const COLONNES_AJOUTEES: [table: string, colonne: string, type: string][] = [
  ['identite', 'profession', "TEXT DEFAULT ''"],
  // parent inconnu (ex. enfant né sous le Code civil sans reconnaissance du père) : branche fermée
  ['identite', 'inconnu', 'INTEGER NOT NULL DEFAULT 0'],
]

const ALIAS_INFO: Record<Evenement, string> = { naissance: 'ni', mariage: 'mi', deces: 'di' }

/** SELECT de la vue standard : identite + famille + les trois événements. */
export const REQUETE =
  'SELECT ' +
  [
    'i.id', 'i.niveau', 'i.prenom1', 'i.prenom2', 'i.prenom3', 'i.nom', 'i.souche', 'i.profession', 'i.inconnu', 'f.numero_famille AS famille',
    ...EVENEMENTS.flatMap((ev) => ['jour', 'mois', 'annee', ...LIEUX].map((c) => `${ALIAS_EVT[ev]}.${c} AS ${ev}_${c}`)),
    ...EVENEMENTS.flatMap((ev) => [`${ALIAS_INFO[ev]}.source AS ${ev}_source`, `${ALIAS_INFO[ev]}.sans_objet AS ${ev}_sans_objet`]),
  ].join(', ') +
  ' FROM identite i LEFT JOIN famille f ON f.id = i.id ' +
  EVENEMENTS.map((ev) => `LEFT JOIN ${ev} ${ALIAS_EVT[ev]} ON ${ALIAS_EVT[ev]}.id = i.id`).join(' ') +
  ' ' +
  EVENEMENTS.map((ev) => `LEFT JOIN evenement_info ${ALIAS_INFO[ev]} ON ${ALIAS_INFO[ev]}.id = i.id AND ${ALIAS_INFO[ev]}.evenement = '${ev}'`).join(' ')

/** Tri de la vue standard : génération par génération, homme puis femme. */
export const TRI_STANDARD = 'length(i.niveau), i.niveau, i.id'
