<script setup lang="ts">
/**
 * Fiche flottante d'un individu (la bulle qui grossit).
 * Double appui sur la fiche, ou appui à côté : fermeture.
 * « Modifier » ouvre la fiche de saisie, sur un écran à part.
 */
import { computed, watch } from 'vue'
import Icone from './Icone.vue'
import BulleIcone from './BulleIcone.vue'
import { useArbreStore } from '@/stores/arbre'
import { annee, nomComplet, type Individu } from '@/domain/individu'
import { EVENEMENTS, TITRES_EVT, type Evenement } from '@/db/schema'

const props = defineProps<{ niveau: string | null; voirArbre?: boolean }>()
const emit = defineEmits<{ fermer: []; modifier: [id: number]; arbre: [niveau: string] }>()
const store = useArbreStore()

const i = computed<Individu | null>(() => (props.niveau ? store.parNiveau.get(props.niveau) ?? null : null))

const dates = computed(() => {
  if (!i.value) return ''
  const n = annee(i.value.naissance_date)
  const d = annee(i.value.deces_date)
  if (n && d) return `${n} – ${d}`
  if (n) return `${i.value.niveau.endsWith('1') ? 'Née' : 'Né'} en ${n}`
  if (d) return `† ${d}`
  return 'Dates à compléter'
})

function evenement(ev: Evenement): string {
  if (!i.value) return ''
  const x = i.value
  const lieu = [x[`${ev}_ville`], x[`${ev}_cp`] && `(${x[`${ev}_cp`]})`].filter(Boolean).join(' ')
  return [x[`${ev}_date`], lieu].filter(Boolean).join(' · ') || '—'
}

const parents = computed(() => {
  if (!i.value) return ''
  return [i.value.niveau + '0', i.value.niveau + '1']
    .map((n) => store.parNiveau.get(n))
    .filter((p): p is Individu => !!p)
    .map(nomComplet)
    .join(', ') || '—'
})

const prenoms = computed(() => (i.value ? [i.value.prenom2, i.value.prenom3].filter(Boolean).join(', ') : ''))

/** Juste après l'ouverture, on ignore les appuis (2e appui d'un double appui sur la bulle). */
let ouverteA = 0
watch(
  () => props.niveau,
  (n) => {
    if (n) ouverteA = Date.now()
  },
)
const tropTot = () => Date.now() - ouverteA < 450

function surVoile() {
  if (!tropTot()) emit('fermer')
}

let dernier = 0
function surAppuiFiche(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button') || tropTot()) return
  const t = Date.now()
  if (t - dernier < 320) {
    dernier = 0
    emit('fermer')
  } else dernier = t
}
</script>

<template>
  <Transition name="fiche">
    <div v-if="i" class="voile-fiche">
      <button class="voile" aria-label="Fermer la fiche" @click="surVoile"></button>
      <article class="fiche" role="dialog" :aria-label="nomComplet(i)" @click="surAppuiFiche">
        <div class="grosse-bulle"><BulleIcone :niveau="i.niveau" :taille="46" /></div>
        <header>
          <h2>{{ nomComplet(i) }}<span v-if="i.souche" class="etoile"> ★</span></h2>
          <p v-if="prenoms" class="prenoms">{{ prenoms }}</p>
          <p class="dates">{{ dates }}</p>
        </header>
        <hr />
        <dl>
          <template v-for="ev in EVENEMENTS" :key="ev">
            <dt>{{ TITRES_EVT[ev] }}</dt>
            <dd>{{ evenement(ev) }}</dd>
          </template>
          <dt>Parents</dt>
          <dd>{{ parents }}</dd>
          <dt>Niveau</dt>
          <dd class="code">{{ i.niveau }}{{ i.famille ? ` · famille ${i.famille}` : '' }}</dd>
        </dl>
        <div class="actions">
          <button class="btn btn-principal" @click="emit('modifier', i.id)"><Icone nom="crayon" :taille="18" /> Modifier</button>
          <button v-if="voirArbre" class="btn" @click="emit('arbre', i.niveau)"><Icone nom="arbre" :taille="18" /> Dans l'arbre</button>
        </div>
        <p class="astuce">Double-touchez ou touchez à côté pour fermer</p>
      </article>
    </div>
  </Transition>
</template>

<style scoped>
.voile-fiche {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
}
.voile {
  position: absolute;
  inset: 0;
  background: rgb(24 48 38 / 26%);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.fiche {
  position: relative;
  width: min(100%, 360px);
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  padding: 28px 22px 18px;
  border-radius: 28px;
  background: #fbfaf6;
  box-shadow: 0 24px 60px rgb(24 48 38 / 28%);
  display: grid;
  justify-items: center;
  gap: 12px;
}
.grosse-bulle {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--sapin);
  color: var(--nacre);
  box-shadow: 0 0 0 6px var(--accent-clair);
}
header {
  text-align: center;
  display: grid;
  gap: 3px;
}
h2 {
  font-size: 1.6rem;
  color: var(--sapin);
}
.etoile {
  font-size: 1.1rem;
}
.prenoms {
  margin: 0;
  font-size: 0.85rem;
  color: var(--discret);
}
.dates {
  margin: 0;
  font-size: 0.9rem;
  color: #5e7a6b;
}
hr {
  width: 100%;
  border: 0;
  height: 1px;
  background: var(--accent-clair);
  margin: 2px 0;
}
dl {
  width: 100%;
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 10px 12px;
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
}
dt {
  color: #8aa295;
}
dd {
  margin: 0;
  color: var(--sapin);
  overflow-wrap: anywhere;
}
.code {
  font-family: var(--mono);
  font-size: 0.85rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 6px;
}
.astuce {
  margin: 0;
  font-size: 0.72rem;
  color: #a3b7ab;
}
.fiche-enter-active,
.fiche-leave-active {
  transition: opacity 0.2s ease;
}
.fiche-enter-active .fiche {
  animation: pop 0.26s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.fiche-leave-active .fiche {
  transition: transform 0.18s ease;
}
.fiche-enter-from,
.fiche-leave-to {
  opacity: 0;
}
.fiche-leave-to .fiche {
  transform: scale(0.85);
}
@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.55);
  }
}
</style>
