<script setup lang="ts">
/**
 * Bloc d'un événement (naissance, mariage, décès) : date + lieu.
 * Comme dans Œnoleptica : saisir une ville (ou un code postal) propose les
 * communes ; en choisir une remplit CP, département, région (ANCIENNE région)
 * et pays.
 */
import { computed, ref } from 'vue'
import { chercherParCp, chercherParNom, type Commune } from '@/utils/communes'
import { dateValide, type Saisie } from '@/domain/individu'
import { TITRES_EVT, type Evenement } from '@/db/schema'

const s = defineModel<Saisie>({ required: true })
const props = defineProps<{ ev: Evenement }>()
const emit = defineEmits<{ touche: [cle: keyof Saisie] }>()

const cle = (c: string) => `${props.ev}_${c}` as keyof Saisie
const dateInvalide = computed(() => !dateValide(s.value[cle('date')]))

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

/** Aide à la saisie de la date : ajoute les « / » au fil de la frappe (16022003 -> 16/02/2003). */
function surDate(e: Event) {
  const brut = (e.target as HTMLInputElement).value
  const chiffres = brut.replace(/\D/g, '')
  let v = brut
  if (/^\d+$/.test(brut) && brut.length === 8) v = `${chiffres.slice(0, 2)}/${chiffres.slice(2, 4)}/${chiffres.slice(4)}`
  else if (/^\d+$/.test(brut) && brut.length === 6) v = `${chiffres.slice(0, 2)}/${chiffres.slice(2)}`
  if (v !== brut) (e.target as HTMLInputElement).value = v
  maj('date', v)
}
</script>

<template>
  <fieldset class="evenement carte">
    <legend>{{ TITRES_EVT[ev] }}</legend>
    <label class="champ" :class="{ invalide: dateInvalide }">
      <span>Date</span>
      <input
        :value="s[cle('date')]"
        :name="`${ev}_date`"
        inputmode="numeric"
        placeholder="JJ/MM/AAAA, MM/AAAA ou AAAA"
        autocomplete="off"
        maxlength="10"
        @input="surDate"
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
  font-family: var(--serif);
  font-size: 1.1rem;
  color: var(--sapin);
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
