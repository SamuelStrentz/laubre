/**
 * Contrôle de la qualité : informations manquantes et incohérences de dates.
 * On ne signale PAS l'absence de parents ni un parent inconnu (branches en cours
 * ou fermées) ; un événement déclaré « non renseigné » (pastille grise) n'est pas contrôlé.
 */
import { EVENEMENTS, type Evenement } from '@/db/schema'
import { decouperDate, nomComplet, type Individu } from './individu'

export interface Anomalie {
  id: number
  niveau: string
  nom: string
  manques: string[]
  incoherences: string[]
}

const DE: Record<Evenement, string> = { naissance: 'de naissance', mariage: 'de mariage', deces: 'de décès' }

/** a est-il strictement avant b, à la précision commune des deux dates ? (null si l'une manque) */
export function avant(a: string, b: string): boolean | null {
  const [ja, ma, aa] = decouperDate(a)
  const [jb, mb, ab] = decouperDate(b)
  if (!aa || !ab) return null
  if (aa !== ab) return aa < ab
  if (!ma || !mb || ma === mb) {
    if (!ma || !mb || !ja || !jb) return false
    return ja < jb
  }
  return ma < mb
}

const annee = (d: string) => decouperDate(d)[2]

export function controlerDonnees(individus: Individu[], visible: (niveau: string) => boolean = () => true): Anomalie[] {
  const parNiveau = new Map<string, Individu>()
  for (const i of [...individus].sort((a, b) => a.id - b.id)) if (!parNiveau.has(i.niveau)) parNiveau.set(i.niveau, i)
  const resultat: Anomalie[] = []

  for (const i of parNiveau.values()) {
    if (i.inconnu || !visible(i.niveau)) continue
    const manques: string[] = []
    const incoherences: string[] = []
    if (!i.prenom1.trim()) manques.push('Prénom')
    if (!i.nom.trim()) manques.push('Nom de famille')
    for (const ev of EVENEMENTS) {
      if (i.sansObjet.includes(ev)) continue
      if (!i[`${ev}_date`]) manques.push(`Date ${DE[ev]}`)
      if (!i[`${ev}_ville`]) manques.push(`Lieu ${DE[ev]}`)
    }

    const naissance = i.naissance_date
    const actif = (ev: Evenement) => !i.sansObjet.includes(ev)
    if (actif('deces') && avant(i.deces_date, naissance)) incoherences.push('Décès avant la naissance')
    if (actif('mariage') && avant(i.mariage_date, naissance)) incoherences.push('Mariage avant la naissance')
    if (actif('mariage') && actif('deces') && avant(i.deces_date, i.mariage_date)) incoherences.push('Mariage après le décès')
    const an = annee(naissance)
    const ad = annee(i.deces_date)
    if (an && ad && ad - an > 110) incoherences.push(`Âge au décès de ${ad - an} ans`)
    const am = annee(i.mariage_date)
    if (an && am && am - an < 14 && am >= an) incoherences.push(`Marié à ${am - an} ans`)

    // cohérence avec le conjoint (même préfixe, dernier chiffre inversé)
    const conjoint = parNiveau.get(i.niveau.slice(0, -1) + (i.niveau.endsWith('0') ? '1' : '0'))
    if (conjoint && !conjoint.inconnu && i.niveau.endsWith('0') && actif('mariage') && !conjoint.sansObjet.includes('mariage')) {
      if (i.mariage_date && conjoint.mariage_date && i.mariage_date !== conjoint.mariage_date) {
        incoherences.push(`Date de mariage différente de celle de ${nomComplet(conjoint)}`)
      }
    }
    // parents nés après (ou trop peu avant) l'enfant
    for (const n of [i.niveau + '0', i.niveau + '1']) {
      const parent = parNiveau.get(n)
      if (!parent || parent.inconnu || !an) continue
      const ap = annee(parent.naissance_date)
      if (!ap) continue
      if (ap >= an) incoherences.push(`${n.endsWith('0') ? 'Père' : 'Mère'} né${n.endsWith('1') ? 'e' : ''} après l'enfant`)
      else if (an - ap < 14) incoherences.push(`${n.endsWith('0') ? 'Père' : 'Mère'} âgé${n.endsWith('1') ? 'e' : ''} de ${an - ap} ans à la naissance`)
    }

    if (manques.length || incoherences.length) {
      resultat.push({ id: i.id, niveau: i.niveau, nom: nomComplet(i), manques, incoherences })
    }
  }
  return resultat.sort((a, b) => a.niveau.length - b.niveau.length || (a.niveau < b.niveau ? -1 : 1))
}

export const nombreProblemes = (liste: Anomalie[]) => liste.reduce((n, a) => n + a.manques.length + a.incoherences.length, 0)
