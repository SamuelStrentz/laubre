import { describe, expect, it } from 'vitest'
import { nouvelleBase } from './aide'
import * as arbre from '@/repositories/arbre'
import { aideNiveau, assemblerDate, dateValide, decouperDate } from '@/domain/individu'
import { ancienneRegion } from '@/domain/regions'

describe('dates (comme le logiciel PC)', () => {
  it('accepte AAAA, MM/AAAA, JJ/MM/AAAA et vide', () => {
    for (const d of ['', '1950', '02/1950', '16/02/2003', '29/02/2024']) expect(dateValide(d)).toBe(true)
    for (const d of ['13/1950', '31/02/2003', '29/02/2023', '1/2/2003', '195']) expect(dateValide(d)).toBe(false)
  })
  it('découpe et réassemble', () => {
    expect(decouperDate('16/02/2003')).toEqual([16, 2, 2003])
    expect(decouperDate('02/1950')).toEqual([null, 2, 1950])
    expect(decouperDate('1950')).toEqual([null, null, 1950])
    expect(assemblerDate(5, 3, 1912)).toBe('05/03/1912')
    expect(assemblerDate(null, 3, 1912)).toBe('03/1912')
    expect(assemblerDate(null, null, null)).toBe('')
  })
  it('explique le niveau', () => {
    expect(aideNiveau('0').texte).toBe('Homme · souche (vous)')
    expect(aideNiveau('011').texte).toBe('Femme · mère de 01')
    expect(aideNiveau('012').erreur).toBe(true)
  })
})

describe('individus et familles', () => {
  it('ajoute, numérote les familles dans l\'ordre de la vue standard', () => {
    const db = nouvelleBase()
    const souche = arbre.ajouter(db, { niveau: '0', prenom1: 'Samuel', nom: 'Strentz', naissance_ville: 'Grenoble' }, true)
    arbre.ajouter(db, { niveau: '1', prenom1: 'Conjointe', nom: 'X' })
    arbre.ajouter(db, { niveau: '01', prenom1: 'Catherine', nom: 'Roux' })
    arbre.ajouter(db, { niveau: '00', prenom1: 'Michel', nom: 'Strentz', naissance_date: '1968' })
    const tous = arbre.tous(db)
    expect(tous.map((i) => i.niveau)).toEqual(['0', '1', '00', '01'])
    expect(tous.find((i) => i.niveau === '0')!.famille).toBe(1)
    expect(tous.find((i) => i.niveau === '00')!.famille).toBe(2)
    expect(arbre.charger(db, souche)!.souche).toBe(true)
    expect(arbre.statistiques(db)).toMatchObject({ individus: 4, familles: 2, generations: 2 })
  })

  it('une seule souche, non supprimable tant qu\'il reste du monde', () => {
    const db = nouvelleBase()
    const s = arbre.ajouter(db, { niveau: '0', prenom1: 'A' }, true)
    expect(() => arbre.ajouter(db, { niveau: '00', prenom1: 'B' }, true)).toThrow()
    arbre.ajouter(db, { niveau: '00', prenom1: 'B' })
    expect(() => arbre.supprimer(db, s)).toThrow(/souche/)
  })

  it('recopie prénom et nom dans les tables liées (cascade)', () => {
    const db = nouvelleBase()
    const id = arbre.ajouter(db, { niveau: '0', prenom1: 'Sam', nom: 'S', naissance_date: '1999', naissance_ville: 'Grenoble' }, true)
    arbre.modifier(db, id, { ...arbre.charger(db, id)!, prenom1: 'Samuel', nom: 'Strentz' })
    expect(db.get('SELECT prenom1, nom, annee, ville FROM naissance WHERE id = ?', [id])).toEqual({
      prenom1: 'Samuel', nom: 'Strentz', annee: 1999, ville: 'Grenoble',
    })
    expect(db.valeur('SELECT COUNT(*) FROM mariage')).toBe(0) // événement vide : pas de ligne
  })

  it('refuse un niveau ou une date invalides', () => {
    const db = nouvelleBase()
    expect(() => arbre.ajouter(db, { niveau: '02', prenom1: 'A' })).toThrow(/niveau/)
    expect(() => arbre.ajouter(db, { niveau: '0', prenom1: 'A', deces_date: '31/02/2000' })).toThrow(/Date/)
    expect(() => arbre.ajouter(db, { niveau: '0' })).toThrow(/prénom/)
  })
})

describe('valeurs proposées (détection des couples)', () => {
  it('reprend pays / région / département de l\'enfant et le mariage du conjoint', () => {
    const db = nouvelleBase()
    arbre.ajouter(db, { niveau: '0', prenom1: 'S', naissance_departement: 'Isère', naissance_region: 'Rhône-Alpes', naissance_pays: 'France' }, true)
    const d = arbre.defauts(db, '00')
    expect(d).toMatchObject({ naissance_region: 'Rhône-Alpes', deces_departement: 'Isère', mariage_pays: 'France' })
    arbre.ajouter(db, { niveau: '00', prenom1: 'P', mariage_date: '12/06/1995', mariage_ville: 'Valence', mariage_cp: '26000' })
    expect(arbre.defauts(db, '01')).toMatchObject({ mariage_date: '12/06/1995', mariage_ville: 'Valence', mariage_cp: '26000' })
    expect(arbre.defauts(db, 'x')).toEqual({ naissance_pays: 'France', mariage_pays: 'France', deces_pays: 'France' })
  })
})

describe('compatibilité avec le logiciel PC', () => {
  it('ouvre une base créée par le script Python (tables liées manquantes recréées)', () => {
    const db = nouvelleBase(false)
    db.exec(`CREATE TABLE identite (id INTEGER PRIMARY KEY AUTOINCREMENT, niveau TEXT NOT NULL, prenom1 TEXT NOT NULL DEFAULT '',
      prenom2 TEXT DEFAULT '', prenom3 TEXT DEFAULT '', nom TEXT NOT NULL DEFAULT '', souche INTEGER NOT NULL DEFAULT 0, UNIQUE (id, prenom1, nom))`)
    arbre.verifierStructure(db)
    expect(db.tableExiste('famille')).toBe(true)
    expect(db.tableExiste('deces')).toBe(true)
  })
  it('refuse une base qui n\'est pas un arbre', () => {
    const db = nouvelleBase(false)
    db.exec('CREATE TABLE vins (id INTEGER)')
    expect(() => arbre.verifierStructure(db)).toThrow(/identite/)
  })
  it('anciennes régions', () => {
    expect(ancienneRegion('07')).toBe('Rhône-Alpes')
    expect(ancienneRegion('68')).toBe('Alsace')
  })
})
