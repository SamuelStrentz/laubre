import { describe, expect, it } from 'vitest'
import { nouvelleBase } from './aide'
import * as arbre from '@/repositories/arbre'
import { avant, controlerDonnees } from '@/domain/controle'
import { analyserGedcom, exporterGedcom, planifierImport, trouverSouche } from '@/domain/gedcom'
import { nomComplet } from '@/domain/individu'

describe('parent inconnu', () => {
  it('sans nom, exclu des statistiques, jamais pour la souche', () => {
    const db = nouvelleBase()
    arbre.ajouter(db, { niveau: '0', prenom1: 'S', nom: 'X' }, true)
    const id = arbre.ajouter(db, { niveau: '00' }, false, [], true)
    arbre.ajouter(db, { niveau: '01', prenom1: 'M', nom: 'Y' })
    const p = arbre.charger(db, id)!
    expect(p.inconnu).toBe(true)
    expect(nomComplet(p)).toBe('Parent inconnu')
    expect(arbre.statistiques(db).individus).toBe(2)
    expect(arbre.statistiquesDetaillees(db).hommes).toBe(1)
    expect(() => arbre.ajouter(db, { niveau: '01' })).toThrow(/prénom/)
    expect(() => arbre.modifier(db, 1, { prenom1: 'S' }, [], true)).toThrow(/souche/)
    arbre.modifier(db, id, { prenom1: 'Jean', nom: 'X' }, [], false)
    expect(arbre.charger(db, id)!.inconnu).toBe(false)
  })

  it('non exporté en GEDCOM et branche fermée à l\'import', () => {
    const db = nouvelleBase()
    arbre.ajouter(db, { niveau: '0', prenom1: 'Samuel', nom: 'STRENTZ' }, true)
    arbre.ajouter(db, { niveau: '00' }, false, [], true)
    arbre.ajouter(db, { niveau: '01', prenom1: 'Marie', nom: 'ROUX' })
    const texte = exporterGedcom(arbre.tous(db), '0.6.0')
    expect(texte).not.toContain('inconnu')
    expect((texte.match(/ INDI/g) ?? []).length).toBe(2)
    const ged = analyserGedcom(`0 HEAD
0 @I1@ INDI
1 NAME Samuel /Strentz/
1 FAMC @F1@
0 @I2@ INDI
1 NAME Pierre /Strentz/
1 FAMC @F2@
0 @I3@ INDI
1 NAME Paul /Strentz/
0 @F1@ FAM
1 HUSB @I2@
1 CHIL @I1@
0 @F2@ FAM
1 HUSB @I3@
1 CHIL @I2@
0 TRLR`)
    const plan = planifierImport(ged, trouverSouche(ged, arbre.charger(db, 1))!, arbre.tous(db))
    expect(plan.aAjouter).toEqual([]) // ni Pierre (place d'un parent inconnu) ni son père
    expect(plan.dejaPresents.find((d) => d.niveau === '00')!.nomAppli).toBe('Parent inconnu')
  })
})

describe('contrôle de la qualité', () => {
  it('compare les dates à la précision commune', () => {
    expect(avant('1950', '1960')).toBe(true)
    expect(avant('03/1950', '1950')).toBe(false)
    expect(avant('02/03/1950', '05/03/1950')).toBe(true)
    expect(avant('', '1950')).toBe(null)
  })

  it('signale les manques (sauf non renseigné, parents absents, parent inconnu) et les incohérences', () => {
    const db = nouvelleBase()
    arbre.ajouter(db, { niveau: '0', prenom1: 'Samuel', nom: 'STRENTZ', naissance_date: '1999', naissance_ville: 'Grenoble' }, true, ['mariage', 'deces'])
    arbre.ajouter(db, { niveau: '00', prenom1: 'Michel', nom: 'STRENTZ', naissance_date: '2001', naissance_ville: 'Colmar', mariage_date: '1995', mariage_ville: 'Valence', deces_date: '1990', deces_ville: 'Colmar' })
    arbre.ajouter(db, { niveau: '01', nom: 'ROUX', naissance_date: '1970', naissance_ville: 'Valence', mariage_date: '1996' }, false, ['deces'])
    arbre.ajouter(db, { niveau: '000' }, false, [], true)
    const a = controlerDonnees(arbre.tous(db))
    expect(a.map((x) => x.niveau)).toEqual(['0', '00', '01'])
    expect(a[0].manques).toEqual([])
    expect(a[0].incoherences).toEqual(['Père né après l\'enfant'])
    expect(a[1].incoherences).toEqual(expect.arrayContaining(['Décès avant la naissance', 'Mariage avant la naissance', 'Date de mariage différente de celle de  ROUX'.replace('  ', ' ')]))
    expect(a[2].manques).toEqual(['Prénom', 'Lieu de mariage'])
    // une fois corrigé, l'individu disparaît de la liste
    arbre.modifier(db, 3, { ...arbre.charger(db, 3)!, prenom1: 'Catherine', mariage_ville: 'Valence' }, ['deces'])
    expect(controlerDonnees(arbre.tous(db)).map((x) => x.niveau)).toEqual(['0', '00'])
  })
})
