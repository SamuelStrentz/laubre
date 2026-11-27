<script setup lang="ts">
/**
 * Fiche de saisie d'un individu (ajout ou modification), écran à part.
 * Ajout : pré-remplissage comme le logiciel PC (pays / région / département de
 * l'enfant, mariage du conjoint), sans jamais écraser ce qui a été tapé.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icone from '@/components/Icone.vue'
import ChampListe, { type OptionListe } from '@/components/ChampListe.vue'
import ChampsEvenement from '@/components/ChampsEvenement.vue'
import { api } from '@/db/client'
import { CHAMPS_EVT, EVENEMENTS, type Evenement } from '@/db/schema'
import { useArbreStore } from '@/stores/arbre'
import { useUiStore } from '@/stores/ui'
import {
  aideNiveau, CLES_DATES, dateValide, finaliserDate, nettoyer, nomComplet, RE_NIVEAU, saisieVide,
  type Cle, type Individu, type Saisie,
} from '@/domain/individu'

const props = defineProps<{ id?: string }>()
const route = useRoute()
const router = useRouter()
const store = useArbreStore()
const ui = useUiStore()

const modification = computed(() => props.id !== undefined)
const individu = ref<Individu | null>(null)
const s = ref<Saisie>(saisieVide())
const enCours = ref(false)
const erreurs = ref<Set<string>>(new Set())

/** Premier individu de l'arbre : il devient la souche. */
const nouvelleSouche = computed(() => !modification.value && !store.aSouche)
const estSouche = computed(() => individu.value?.souche ?? nouvelleSouche.value)
const titre = computed(() =>
  nouvelleSouche.value ? 'La souche : vous' : modification.value ? 'Modifier' : 'Nouvel individu',
)

const aide = computed(() => {
  const a = aideNiveau(s.value.niveau.trim())
  return { ...a, texte: a.texte && estSouche.value ? `${a.texte} · ★ souche de l'arbre` : a.texte }
})

/** Noms déjà dans la base, en majuscules (le nom de famille est saisi en majuscules). */
const nomsConnus = computed<OptionListe[]>(() =>
  [...new Set(store.noms.map((n) => n.toLocaleUpperCase('fr-FR')))].map((valeur) => ({ valeur })),
)

/** Événements renseignés (pastille verte) ou non (grise : bloc replié, rien d'enregistré). */
const actifs = ref<Record<Evenement, boolean>>({ naissance: true, mariage: true, deces: true })


// ---------------------------------------------------------- valeurs proposées
/** Valeurs posées automatiquement (pour savoir ce qu'on peut remplacer). */
const auto = new Map<Cle, string>()
let jeton = 0

async function appliquerDefauts() {
  const n = s.value.niveau.trim()
  if (modification.value || !store.prete || !RE_NIVEAU.test(n)) return
  const mien = ++jeton
  const nouveaux = (await api.defauts(n)) as Partial<Saisie>
  if (mien !== jeton) return
  const suivant = { ...s.value }
  for (const k of new Set<Cle>([...(Object.keys(nouveaux) as Cle[]), ...auto.keys()])) {
    const actuel = suivant[k]
    if (actuel === '' || actuel === auto.get(k)) {
      const val = nouveaux[k] ?? ''
      suivant[k] = val
      if (val) auto.set(k, val)
      else auto.delete(k)
    }
  }
  s.value = suivant
}

watch(() => s.value.niveau, appliquerDefauts)

/** Une saisie manuelle n'est plus « automatique ». */
function touche(k: Cle) {
  if (auto.has(k) && s.value[k] !== auto.get(k)) auto.delete(k)
}

onMounted(async () => {
  if (modification.value) {
    const i = (await api.individu(Number(props.id))) as Individu | null
    if (!i) {
      ui.toast('Individu introuvable', 'erreur')
      router.replace('/')
      return
    }
    individu.value = i
    s.value = nettoyer(i)
    // pastille grise = événement déclaré « non renseigné » (enregistré dans la base)
    for (const ev of EVENEMENTS) actifs.value[ev] = !i.sansObjet.includes(ev)
  } else {
    const n = typeof route.query.niveau === 'string' ? route.query.niveau : nouvelleSouche.value ? '0' : ''
    s.value = { ...saisieVide(), niveau: n }
    if (!n) await appliquerDefauts()
  }
})

// ---------------------------------------------------------------- validation
async function enregistrer() {
  const d = nettoyer(s.value)
  d.nom = d.nom.toLocaleUpperCase('fr-FR')
  for (const k of CLES_DATES) d[k] = finaliserDate(d[k])
  // événement désactivé : rien d'enregistré pour lui, il est marqué « non renseigné »
  const sansObjet = EVENEMENTS.filter((ev) => !actifs.value[ev])
  for (const ev of sansObjet) for (const c of CHAMPS_EVT) d[`${ev}_${c}`] = ''
  const e = new Set<string>()
  if (!d.niveau || !RE_NIVEAU.test(d.niveau)) e.add('niveau')
  if (!d.prenom1 && !d.nom) e.add('prenom1')
  for (const k of CLES_DATES) if (!dateValide(d[k])) e.add(k)
  erreurs.value = e
  if (e.has('niveau')) return ui.toast('Le niveau est obligatoire : uniquement des 0 et des 1.', 'erreur')
  if (e.has('prenom1')) return ui.toast('Renseigne au moins un premier prénom ou un nom de famille.', 'erreur')
  if (e.size) return ui.toast('Date invalide : JJ/MM/AAAA, MM/AAAA ou AAAA.', 'erreur')

  if (!individu.value && (await api.niveauExiste(d.niveau, null))) {
    if (!confirm(`Le niveau ${d.niveau} est déjà utilisé par un autre individu.\nEnregistrer quand même ?`)) return
  }
  if (nouvelleSouche.value && d.niveau !== '0') {
    if (!confirm(`La souche porte normalement le niveau 0.\nEnregistrer quand même avec le niveau ${d.niveau} ?`)) return
  }
  const souche = nouvelleSouche.value
  enCours.value = true
  try {
    if (individu.value) {
      await store.modifier(individu.value.id, d, sansObjet)
      ui.toast('Modifications enregistrées')
    } else {
      await store.ajouter(d, souche, sansObjet)
      ui.toast(souche ? 'Votre arbre est planté 🌲' : `${nomComplet(d)} ajouté${d.niveau.endsWith('1') ? 'e' : ''}`)
    }
    if (souche || !store.centre) store.centre = store.niveauSouche
    store.ecran = route.query.depuis === 'generations' ? 'generations' : 'arbre'
    fermer()
  } catch (err) {
    ui.erreur(err)
  } finally {
    enCours.value = false
  }
}

async function supprimer() {
  const i = individu.value
  if (!i) return
  if (!confirm(`Supprimer ${nomComplet(i)} (niveau ${i.niveau}) ?\n\nCette action est définitive.`)) return
  try {
    await store.supprimer(i.id)
    if (store.centre === i.niveau) store.centre = i.niveau.length > 1 ? i.niveau.slice(0, -1) : store.niveauSouche
    ui.toast('Individu supprimé')
    fermer()
  } catch (err) {
    ui.erreur(err)
  }
}

function fermer() {
  if (window.history.state?.back) router.back()
  else router.replace('/')
}

const tousLesChampsDates = EVENEMENTS
</script>

<template>
  <main class="page formulaire">
    <header class="barre">
      <button class="bouton-icone" aria-label="Retour" @click="fermer"><Icone nom="retour" /></button>
      <h1>{{ titre }}</h1>
    </header>
    <p v-if="nouvelleSouche" class="intro">
      Premier individu de l'arbre : c'est vous, la souche. Tout l'arbre partira de cette bulle.
    </p>

    <form novalidate @submit.prevent="enregistrer">
      <section class="carte identite">
        <div class="niveau">
          <label v-if="!modification" class="champ" :class="{ invalide: erreurs.has('niveau') || aide.erreur }">
            <span>Niveau *</span>
            <input v-model.trim="s.niveau" name="niveau" inputmode="numeric" autocomplete="off" maxlength="30" />
          </label>
          <div v-else class="champ">
            <span>Niveau</span>
            <p class="niveau-fixe" aria-label="Niveau, non modifiable">{{ s.niveau }}</p>
          </div>
          <p class="aide-niveau" :class="{ erreur: aide.erreur }">{{ aide.texte || '0 = homme, 1 = femme (00 = père, 01 = mère)' }}</p>
        </div>
        <label class="champ" :class="{ invalide: erreurs.has('prenom1') }">
          <span>Premier prénom</span>
          <input v-model="s.prenom1" name="prenom1" autocapitalize="words" autocomplete="off" @input="touche('prenom1')" />
        </label>
        <div class="ligne-2">
          <label class="champ"><span>Deuxième prénom</span><input v-model="s.prenom2" autocapitalize="words" autocomplete="off" /></label>
          <label class="champ"><span>Troisième prénom</span><input v-model="s.prenom3" autocapitalize="words" autocomplete="off" /></label>
        </div>
        <div class="champ dernier">
          <span>Nom de famille</span>
          <ChampListe v-model="s.nom" name="nom" :options="nomsConnus" titre-liste="Noms de l'arbre" placeholder="NOM DE FAMILLE" majuscules />
        </div>
        <label class="champ dernier profession">
          <span>Profession</span>
          <input v-model="s.profession" name="profession" autocapitalize="sentences" autocomplete="off" @input="touche('profession')" />
        </label>
      </section>

      <ChampsEvenement v-for="ev in tousLesChampsDates" :key="ev" v-model="s" v-model:actif="actifs[ev]" :ev="ev" @touche="touche" />

      <button v-if="individu && !(individu.souche && store.individus.length > 1)" type="button" class="btn btn-danger btn-large" @click="supprimer">
        <Icone nom="corbeille" :taille="20" /> Supprimer cet individu
      </button>

      <div class="valider">
        <button type="submit" class="btn btn-principal btn-large" :disabled="enCours">
          <Icone nom="coche" :taille="20" /> {{ enCours ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </form>
    <datalist id="liste-anciennes-regions">
      <option v-for="r in ANCIENNES_REGIONS" :key="r" :value="r" />
    </datalist>
  </main>
</template>

<script lang="ts">
import { ANCIENNES_REGIONS } from '@/domain/regions'
</script>

<style scoped>
.intro {
  margin: -4px 4px 14px;
  color: var(--discret);
  font-size: 0.92rem;
  line-height: 1.45;
}
.identite {
  margin-bottom: 14px;
}
.niveau {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 12px;
  align-items: end;
}
.niveau-fixe {
  margin: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--accent-clair);
  font-family: var(--mono);
  letter-spacing: 0.08em;
  color: var(--sapin);
}
.profession {
  margin-top: 12px;
}
.niveau input {
  font-family: var(--mono);
  letter-spacing: 0.08em;
}
.aide-niveau {
  margin: 0 0 24px;
  font-size: 0.82rem;
  color: var(--sapin);
  line-height: 1.3;
}
.aide-niveau.erreur {
  color: var(--danger);
}
.dernier {
  margin-bottom: 0;
}
.btn-danger {
  margin-top: 6px;
}
</style>
