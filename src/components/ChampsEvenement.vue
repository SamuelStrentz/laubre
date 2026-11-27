<script setup lang="ts">
/**
 * Bloc d'un événement (naissance, mariage, décès) : date + lieu.
 * Comme dans Œnoleptica : saisir une ville (ou un code postal) propose les
 * communes ; en choisir une remplit CP, département, région (ANCIENNE région)
 * et pays.
 * La pastille en haut à droite active (vert) ou désactive (gris, bloc replié)
 * l'événement : désactivé, il n'est pas enregistré.
 */
import { computed, ref } from 'vue'
import { chercherParCp, chercherParNom, type Commune } from '@/utils/communes'
import { dateValide, finaliserDate, masquerDate, type Saisie } from '@/domain/individu'
import { TITRES_EVT, type Evenement } from '@/db/schema'

const s = defineModel<Saisie>({ required: true })
const actif = defineModel<boolean>('actif', { default: true })
const props = defineProps<{ ev: Evenement }>()
const emit = defineEmits<{ touche: [cle: keyof Saisie] }>()

const cle = (c: string) => `${props.ev}_${c}` as keyof Saisie
const dateInvalide = computed(() => actif.value && !dateValide(s.value[cle('date')]))

const suggestions = ref<Commune[]>([])
const recherche = ref(false)
let minuteur: ReturnType<typeof setTimeout> | undefined
let requete: AbortController | undefined

function chercher(fn: (q: string, sig: AbortSignal) => Promise<Commune[]>, q: string) {
  clearTimeout(minuteur)
  requete?.abort()
  minuteur = setTimeout(async () => {
    requete = new AbortController()
    recherche.value = true
    suggestions.value = await fn(q, requete.signal)
    recherche.value = false
  }, 280)
}

function maj(c: string, valeur: string) {
  s.value = { ...s.value, [cle(c)]: valeur }
  emit('touche', cle(c))
}

function surVille(e: Event) {
  maj('ville', (e.target as HTMLInputElement).value)
  chercher(chercherParNom, s.value[cle('ville')])
}

function surCp(e: Event) {
  maj('cp', (e.target as HTMLInputElement).value)
  const cp = s.value[cle('cp')].trim()
  if (/^\d{5}$/.test(cp)) chercher(chercherParCp, cp)
  else suggestions.value = []
}

function choisir(c: Commune) {
  s.value = {
    ...s.value,
    [cle('ville')]: c.ville,
    [cle('cp')]: c.cp,
    [cle('departement')]: c.departement,
    [cle('region')]: c.region ?? s.value[cle('region')],
    [cle('pays')]: c.pays,
  }
  for (const k of ['ville', 'cp', 'departement', 'region', 'pays']) emit('touche', cle(k))
  suggestions.value = []
}

function fermerPlusTard() {
  // laisse le temps au tap sur une suggestion d'être pris en compte
  setTimeout(() => (suggestions.value = []), 200)
}

/** Les « / » s'ajoutent seuls après le jour et le mois (cf. masquerDate). */
function surDate(e: Event) {
  const champ = e.target as HTMLInputElement
  const ajout = (e as InputEvent).inputType?.startsWith('insert') ?? true
  const v = masquerDate(champ.value, ajout)
  if (v !== champ.value) champ.value = v
  maj('date', v)
}

function surSortieDate(e: Event) {
  const champ = e.target as HTMLInputElement
  const v = finaliserDate(champ.value)
  if (v !== champ.value) {
    champ.value = v
    maj('date', v)
  }
}
</script>

<template>
  <fieldset class="evenement carte" :class="{ replie: !actif }">
    <legend>
      <span>{{ TITRES_EVT[ev] }}</span>
      <button
        type="button"
        class="interrupteur"
        role="switch"
        :aria-checked="actif"
        :aria-label="`${TITRES_EVT[ev]} : ${actif ? 'renseigné' : 'non renseigné'}`"
        @click="actif = !actif"
      >
        <span class="pastille"></span>
      </button>
    </legend>
    <p v-if="!actif" class="non-renseigne">Non renseigné · touchez la pastille pour le remplir</p>
    <div v-show="actif" class="corps">
    <label class="champ" :class="{ invalide: dateInvalide }">
      <span>Date</span>
      <input
        :value="s[cle('date')]"
        :name="`${ev}_date`"
        inputmode="numeric"
        placeholder="JJ/MM/AAAA, MM/AAAA ou AAAA"
        autocomplete="off"
        maxlength="10"
        enterkeyhint="next"
        @input="surDate"
        @blur="surSortieDate"
      />
    </label>
    <p v-if="dateInvalide" class="erreur-date">Formats acceptés : JJ/MM/AAAA, MM/AAAA ou AAAA.</p>

    <div class="ville">
      <div class="ligne-2">
        <label class="champ">
          <span>Ville</span>
          <input
            :value="s[cle('ville')]"
            autocapitalize="sentences"
            autocomplete="off"
            enterkeyhint="search"
            @input="surVille"
            @blur="fermerPlusTard"
          />
        </label>
        <label class="champ">
          <span>Code postal</span>
          <input
            :value="s[cle('cp')]"
            inputmode="numeric"
            maxlength="5"
            autocomplete="off"
            @input="surCp"
            @blur="fermerPlusTard"
          />
        </label>
      </div>
      <ul v-if="suggestions.length" class="suggestions" role="listbox">
        <li v-for="c in suggestions" :key="c.ville + c.cp">
          <button type="button" @pointerdown.prevent @click="choisir(c)">
            <strong>{{ c.ville }}</strong>
            <span>{{ c.cp }} · {{ c.departement }}{{ c.region ? ` · ${c.region}` : '' }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="recherche" class="aide recherche">Recherche…</p>
    </div>

    <div class="ligne-2">
      <label class="champ">
        <span>Département</span>
        <input :value="s[cle('departement')]" autocapitalize="sentences" autocomplete="off" @input="maj('departement', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="champ">
        <span>Région</span>
        <input
          :value="s[cle('region')]"
          list="liste-anciennes-regions"
          autocapitalize="sentences"
          autocomplete="off"
          @input="maj('region', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
    <label class="champ dernier">
      <span>Pays</span>
      <input :value="s[cle('pays')]" autocapitalize="sentences" autocomplete="off" @input="maj('pays', ($event.target as HTMLInputElement).value)" />
    </label>
    </div>
  </fieldset>
</template>

<style scoped>
.evenement {
  border: 0;
  margin: 0 0 14px;
  min-width: 0;
}
legend {
  float: left;
  width: 100%;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--serif);
  font-size: 1.1rem;
  color: var(--sapin);
}
.corps {
  clear: both;
}
.replie legend {
  margin-bottom: 0;
  color: var(--discret);
}
.non-renseigne {
  clear: both;
  margin: 0;
  padding-top: 4px;
  font-size: 0.8rem;
  color: var(--discret);
}
/* Pastille : zone tactile de 44 px, pastille visible de 16 px */
.interrupteur {
  width: 44px;
  height: 44px;
  margin: -12px -12px -12px 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
}
.pastille {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #2e9e5b;
  box-shadow: 0 0 0 3px rgb(46 158 91 / 18%);
  transition: background 0.2s, box-shadow 0.2s;
}
.interrupteur[aria-checked='false'] .pastille {
  background: #b9c2bd;
  box-shadow: 0 0 0 3px rgb(185 194 189 / 25%);
}
.interrupteur:active .pastille {
  transform: scale(0.85);
}
.dernier {
  margin-bottom: 0;
}
.ville {
  position: relative;
}
.suggestions {
  list-style: none;
  margin: -6px 0 12px;
  padding: 4px;
  background: var(--carte);
  border: 1px solid var(--sapin);
  border-radius: 12px;
  box-shadow: var(--ombre-forte);
}
.suggestions button {
  width: 100%;
  text-align: left;
  display: grid;
  gap: 1px;
  padding: 10px 12px;
  border-radius: 8px;
}
.suggestions button:active {
  background: var(--accent-clair);
}
.suggestions span {
  font-size: 0.82rem;
  color: var(--discret);
}
.recherche {
  margin: -6px 0 10px 4px;
}
.erreur-date {
  margin: -6px 0 10px 4px;
  font-size: 0.8rem;
  color: var(--danger);
}
</style>
