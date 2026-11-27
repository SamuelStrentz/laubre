import { describe, expect, it } from 'vitest'
import { nouvelleBase } from './aide'
import * as arbre from '@/repositories/arbre'
import {
  analyserGedcom, dateDepuisGedcom, dateVersGedcom, exporterGedcom, lieuDepuisGedcom, planifierImport, trouverSouche,
} from '@/domain/gedcom'

describe('profession, sources, événements « non renseignés »', () => {
  it('enregistre profession et source, garde le niveau en modification', () => {
    const db = nouvelleBase()
    const id = arbre.ajouter(db, { niveau: '0', prenom1: 'Samuel', nom: 'STRENTZ', profession: 'Chef de projet', naissance_date: '1999', naissance_source: 'https://archives.isere.fr/acte/1' }, true)
    arbre.modifier(db, id, { ...arbre.charger(db, id)!, niveau: '01', prenom1: 'Sam' })
    const i = arbre.charger(db, id)!
    expect(i.niveau).toBe('0')
    expect(i.profession).toBe('Chef de projet')
    expect(i.naissance_source).toBe('https://archives.isere.fr/acte/1')
  })

  it('un décès « non renseigné » compte comme complet', () => {
    const db = nouvelleBase()
    arbre.ajouter(db, { niveau: '0', prenom1: 'S', naissance_date: '1999', naissance_ville: 'Grenoble' }, true, ['mariage', 'deces'])
    arbre.ajouter(db, { niveau: '00', prenom1: 'P', naissance_date: '1968', deces_date: '2020', deces_source: 'Acte n°12' })
    const st = arbre.statistiques(db)
    const c = Object.fromEntries(st.completude.map((l) => [l.champ, l.pourcentage]))
    expect(c['Date de naissance']).toBe(100)
    expect(c['Date de décès']).toBe(100) // S : sans objet, P : décédé avec date
    expect(c['Date de mariage']).toBe(50)
    expect(arbre.charger(db, 1)!.sansObjet).toEqual(['mariage', 'deces'])
    const s = Object.fromEntries(st.sources.map((l) => [l.champ, [l.renseignes, l.total]]))
    expect(s['Décès']).toEqual([1, 1])
    expect(s['Naissances']).toEqual([0, 2])
    expect(s['Tous les actes']).toEqual([1, 3])
  })

  it('statistiques détaillées', () => {
    const db = nouvelleBase()
    arbre.ajouter(db, { niveau: '0', prenom1: 'S', naissance_date: '1999', naissance_departement: 'Isère', naissance_region: 'Rhône-Alpes' }, true)
    arbre.ajouter(db, { niveau: '00', prenom1: 'P', naissance_date: '1900', deces_date: '1980', naissance_departement: 'Isère' })
    arbre.ajouter(db, { niveau: '01', prenom1: 'M', naissance_date: '1910', deces_date: '1970' })
    const d = arbre.statistiquesDetaillees(db)
    expect(d.departements[0]).toEqual({ libelle: 'Isère', valeur: 2 })
    expect(d.ageDeces[0].valeur).toBe(70)
    expect(d.hommes).toBe(2)
    expect(d.decennies.map((b) => b.libelle)).toEqual(['1900', '1910', '1990'])
  })
})

const GED = `0 HEAD
1 SOUR GENEBASE
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
1 PLAC
2 FORM Commune, Code INSEE, Département, Région, Pays
0 @I1@ INDI
1 NAME Samuel /Strentz/
1 SEX M
1 BIRT
2 DATE 3 MAR 1998
2 PLAC Grenoble, 38185, Isère, Auvergne-Rhône-Alpes, France
1 FAMC @F1@
0 @I2@ INDI
1 NAME Michel Jean /Strentz/
1 SEX M
1 OCCU Technicien
1 BIRT
2 DATE ABT 1960
1 FAMS @F1@
1 FAMC @F2@
0 @I3@ INDI
1 NAME Catherine /Roux/
1 SEX F
1 BIRT
2 DATE 12 FEB 1970
2 PLAC Valence, 26362, Drôme, Auvergne-Rhône-Alpes, France
2 SOUR @S1@
3 PAGE vue 42
1 FAMS @F1@
0 @I4@ INDI
1 NAME Joseph /Strentz/
1 SEX M
1 DEAT
2 DATE BET 2014 AND 2015
1 FAMS @F2@
0 @I5@ INDI
1 NAME Paul /Strentz/
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 CHIL @I5@
1 MARR
2 DATE 1995
2 PLAC Valence, 26362, Drôme, Auvergne-Rhône-Alpes, France
0 @F2@ FAM
1 HUSB @I4@
1 CHIL @I2@
0 @S1@ SOUR
1 TITL AD Drôme, registre des naissances
0 TRLR
`

describe('GEDCOM', () => {
  it('dates et lieux', () => {
    expect(dateDepuisGedcom('16 FEB 2003')).toBe('16/02/2003')
    expect(dateDepuisGedcom('ABT 1850')).toBe('1850')
    expect(dateDepuisGedcom('FEB 1950')).toBe('02/1950')
    expect(dateDepuisGedcom('BET 1850 AND 1855')).toBe('1850')
    expect(dateDepuisGedcom('@#DFRENCH R@ 12 VEND AN II')).toBe('')
    expect(dateVersGedcom('05/03/1912')).toBe('5 MAR 1912')
    expect(dateVersGedcom('03/1912')).toBe('MAR 1912')
    // sans PLAC FORM : ville, CP, département, région, pays ; région nouvelle -> ancienne
    expect(lieuDepuisGedcom('Aubenas, 07200, Ardèche, Auvergne-Rhône-Alpes, France', null)).toEqual({
      ville: 'Aubenas', cp: '07200', departement: 'Ardèche', region: 'Rhône-Alpes', pays: 'France',
    })
    expect(lieuDepuisGedcom('Colmar, Haut-Rhin, Grand Est, France', null)).toMatchObject({
      ville: 'Colmar', departement: 'Haut-Rhin', region: 'Alsace', pays: 'France',
    })
  })

  it('import : la version de l\'appli prévaut, seuls les nouveaux de la lignée sont ajoutés', () => {
    const db = nouvelleBase()
    arbre.ajouter(db, { niveau: '0', prenom1: 'Samuel', nom: 'STRENTZ', naissance_date: '16/02/1999' }, true)
    arbre.ajouter(db, { niveau: '00', prenom1: 'Michel', nom: 'STRENTZ', naissance_date: '1968' })
    const ged = analyserGedcom(GED)
    const souche = trouverSouche(ged, arbre.charger(db, 1))
    expect(souche).toBe('@I1@')
    const plan = planifierImport(ged, souche!, arbre.tous(db))
    expect(plan.aAjouter.map((a) => a.niveau)).toEqual(['01', '000'])
    expect(plan.dejaPresents.map((d) => d.niveau)).toEqual(['0', '00'])
    expect(plan.horsLignee).toBe(1) // Paul, le frère
    const mere = plan.aAjouter[0].saisie
    expect(mere).toMatchObject({
      prenom1: 'Catherine', nom: 'ROUX', naissance_date: '12/02/1970', naissance_ville: 'Valence',
      naissance_departement: 'Drôme', naissance_region: 'Rhône-Alpes', naissance_source: 'AD Drôme, registre des naissances, vue 42',
      mariage_date: '1995', mariage_ville: 'Valence',
    })
    arbre.ajouterLot(db, plan.aAjouter)
    // les dates de l'appli sont gardées (1968 et non « ABT 1960 »)
    expect(arbre.parNiveau(db, '00')!.naissance_date).toBe('1968')
    expect(arbre.parNiveau(db, '000')!.deces_date).toBe('2014')
    expect(arbre.statistiques(db).familles).toBe(1)
  })

  it('export puis réimport dans un arbre ne contenant que la souche', () => {
    const db = nouvelleBase()
    arbre.ajouter(db, { niveau: '0', prenom1: 'Samuel', nom: 'STRENTZ', profession: 'Chef de projet' }, true, ['deces'])
    arbre.ajouter(db, { niveau: '1', prenom1: 'Claire', nom: 'MARTIN', mariage_date: '12/06/2025', mariage_ville: 'Aubenas' })
    arbre.ajouter(db, { niveau: '00', prenom1: 'Michel', nom: 'STRENTZ', naissance_date: '05/03/1968', naissance_ville: 'Colmar', naissance_source: 'Acte 12' })
    arbre.ajouter(db, { niveau: '01', prenom1: 'Catherine', nom: 'ROUX' })
    arbre.ajouter(db, { niveau: '010', prenom1: 'André', nom: 'ROUX' })
    const texte = exporterGedcom(arbre.tous(db), '0.3.0')
    expect(texte).toContain('1 NAME Michel /STRENTZ/')
    expect(texte).toContain('2 DATE 5 MAR 1968')
    expect(texte).toContain('1 OCCU Chef de projet')
    const ged = analyserGedcom(texte)
    expect(ged.familles.size).toBe(3) // 0+1, 00+01 (enfant 0), 010 seul (enfant 01)

    const db2 = nouvelleBase()
    arbre.ajouter(db2, { niveau: '0', prenom1: 'Samuel', nom: 'STRENTZ' }, true)
    const plan = planifierImport(ged, trouverSouche(ged, arbre.charger(db2, 1))!, arbre.tous(db2))
    expect(plan.aAjouter.map((a) => a.niveau)).toEqual(['1', '00', '01', '010'])
    expect(plan.aAjouter.find((a) => a.niveau === '1')!.saisie.mariage_date).toBe('12/06/2025')
    expect(plan.aAjouter.find((a) => a.niveau === '00')!.saisie.naissance_source).toBe('Acte 12')
  })
})

describe('sélection avant import (lot 4)', async () => {
  const { basculerIndividu, basculerGeneration } = await import('@/domain/gedcom')
  const possibles = ['01', '000', '001', '010', '0100']
  it('décocher retire aussi les ascendants, cocher rajoute les descendants', () => {
    let s = new Set(possibles)
    s = basculerIndividu(s, '01', possibles)
    expect([...s].sort()).toEqual(['000', '001'])
    s = basculerIndividu(s, '0100', possibles)
    expect([...s].sort()).toEqual(['000', '001', '01', '010', '0100'])
  })
  it('jusqu\'à une génération', () => {
    let s = new Set(possibles)
    s = basculerGeneration(s, 2, possibles)
    expect([...s].sort()).toEqual(['01'])
    s = basculerGeneration(s, 2, possibles)
    expect([...s].sort()).toEqual(['000', '001', '01', '010'])
  })
})

describe('belle-famille (lot 5)', () => {
  it('exclue des statistiques par défaut, incluse sur demande', () => {
    const db = nouvelleBase()
    arbre.ajouter(db, { niveau: '0', prenom1: 'S', naissance_departement: 'Isère' }, true)
    arbre.ajouter(db, { niveau: '1', prenom1: 'C', naissance_departement: 'Ardèche' })
    arbre.ajouter(db, { niveau: '10', prenom1: 'BP', naissance_departement: 'Ardèche', naissance_date: '1960' })
    arbre.ajouter(db, { niveau: '11', prenom1: 'BM', naissance_departement: 'Ardèche' })
    arbre.ajouter(db, { niveau: '00', prenom1: 'P' })
    expect(arbre.statistiques(db)).toMatchObject({ individus: 3, familles: 1, generations: 2 })
    expect(arbre.statistiques(db, true)).toMatchObject({ individus: 5, familles: 2, generations: 2 })
    expect(arbre.statistiquesDetaillees(db).departements).toEqual([
      { libelle: 'Ardèche', valeur: 1 }, { libelle: 'Isère', valeur: 1 },
    ])
    expect(arbre.statistiquesDetaillees(db, true).departements[0]).toEqual({ libelle: 'Ardèche', valeur: 3 })
    expect(arbre.statistiques(db).completude.find((c) => c.champ === 'Date de naissance')!.total).toBe(3)
  })
})
