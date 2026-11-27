<script setup lang="ts">
/**
 * L'arbre : bulle centrale, ses parents au-dessus (trait discret), ses
 * grands-parents en petites bulles (pointillés).
 *  - appui sur un parent / grand-parent : il passe au centre ;
 *  - double appui sur une bulle : fiche flottante ;
 *  - appui sur une bulle « + » : ajout de l'individu manquant.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icone from './Icone.vue'
import BulleIcone from './BulleIcone.vue'
import { useArbreStore } from '@/stores/arbre'
import type { Individu } from '@/domain/individu'

const emit = defineEmits<{ fiche: [niveau: string]; ajouter: [niveau: string] }>()
const store = useArbreStore()

const scene = ref<HTMLElement>()
const L = ref(390)
const H = ref(640)
let observateur: ResizeObserver | undefined
onMounted(() => {
  observateur = new ResizeObserver(([e]) => {
    L.value = e.contentRect.width
    H.value = e.contentRect.height
  })
  if (scene.value) observateur.observe(scene.value)
})
onBeforeUnmount(() => {
  observateur?.disconnect()
  clearTimeout(minuteur)
})

const centre = computed(() => (store.centre && store.parNiveau.has(store.centre) ? store.centre : store.niveauSouche))
const animation = ref(0)

// ----------------------------------------------------------- géométrie
/** Positions calées sur la maquette (390 px de large), mises à l'échelle. */
const g = computed(() => {
  const w = Math.min(L.value, 480)
  const x0 = (L.value - w) / 2
  const h = Math.max(H.value, 520)
  const X = (v: number) => x0 + (v / 390) * w
  return {
    xc: X(195),
    xp: [X(95), X(295)],
    xg: [X(52), X(138), X(252), X(338)],
    yg: h * 0.2, // centre des petites bulles
    yp: h * 0.47, // centre des bulles parents
    yc: h * 0.76, // centre de la bulle centrale
  }
})

const RG = 17
const RP = 32
const RC = 46

const parents = computed(() => [centre.value + '0', centre.value + '1'])
const grands = computed(() => [centre.value + '00', centre.value + '01', centre.value + '10', centre.value + '11'])
const individuDe = (n: string): Individu | null => store.parNiveau.get(n) ?? null

const traits = computed(() => {
  const { xc, xp, xg, yg, yp, yc } = g.value
  const pleins = parents.value.map((n, i) => {
    const x = xp[i]
    const y0 = yc - RC - 6
    const y1 = yp + RP + 44 // sous le prénom / nom
    return { n, connu: !!individuDe(n), d: `M${xc} ${y0} C${xc} ${y0 - 40}, ${x} ${y1 + 36}, ${x} ${y1}` }
  })
  const pointilles = grands.value.map((n, i) => {
    const xpar = xp[i < 2 ? 0 : 1]
    const y0 = yp - RP - 6
    const y1 = yg + RG + 20
    return { n, visible: !!individuDe(parents.value[i < 2 ? 0 : 1]), connu: !!individuDe(n),
      d: `M${xpar} ${y0} C${xpar} ${y0 - 50}, ${xg[i]} ${y1 + 44}, ${xg[i]} ${y1}` }
  })
  return { pleins, pointilles }
})

const enfant = computed(() => (centre.value.length > 1 && centre.value !== store.niveauSouche ? centre.value.slice(0, -1) : null))
const libelleGeneration = computed(() =>
  centre.value === store.niveauSouche ? `La souche · niveau ${centre.value}` : `Génération ${centre.value.length - 1} · niveau ${centre.value}`,
)

// ------------------------------------------------------------ gestes
let dernier: { n: string; t: number } | null = null
let minuteur: ReturnType<typeof setTimeout> | undefined
const DOUBLE = 320 // ms

function recentrer(n: string) {
  store.centre = n
  animation.value++
}

/** Appui simple (différé pour laisser place au double appui) ou double appui. */
function appui(n: string, recentre: boolean) {
  const t = Date.now()
  if (dernier && dernier.n === n && t - dernier.t < DOUBLE) {
    clearTimeout(minuteur)
    dernier = null
    emit('fiche', n)
    return
  }
  dernier = { n, t }
  clearTimeout(minuteur)
  if (recentre) {
    minuteur = setTimeout(() => {
      dernier = null
      recentrer(n)
    }, DOUBLE - 20)
  }
}

defineExpose({ recentrer })
const role = (n: string) => (n.endsWith('0') ? 'Père' : 'Mère')
</script>

<template>
  <section ref="scene" class="ecran-arbre" aria-label="Arbre">
    <p class="generation">
      <span>{{ libelleGeneration }}</span>
      <small>Touchez pour centrer · double-touchez pour la fiche</small>
    </p>

    <div :key="animation" class="plan">
      <svg class="traits" :width="L" :height="H" aria-hidden="true">
        <g fill="none" stroke-linecap="round">
          <template v-for="t in traits.pleins" :key="t.n">
            <path :d="t.d" :class="t.connu ? 'plein' : 'plein absent'" />
          </template>
          <template v-for="t in traits.pointilles" :key="t.n">
            <path v-if="t.visible" :d="t.d" :class="t.connu ? 'pointille' : 'pointille absent'" />
          </template>
        </g>
      </svg>

      <!-- Grands-parents : petites bulles -->
      <template v-for="(n, i) in grands" :key="n">
        <div v-if="individuDe(parents[i < 2 ? 0 : 1])" class="noeud petit" :style="{ left: `${g.xg[i]}px`, top: `${g.yg - RG}px` }">
          <button
            v-if="individuDe(n)"
            class="bulle b-petite"
            :aria-label="`${individuDe(n)!.prenom1} ${individuDe(n)!.nom}`"
            @click="appui(n, true)"
          >
            <BulleIcone :niveau="n" :taille="16" />
          </button>
          <button v-else class="bulle b-petite fantome" :aria-label="`Ajouter : ${role(n).toLowerCase()} de ${individuDe(parents[i < 2 ? 0 : 1])!.prenom1}`" @click="emit('ajouter', n)">+</button>
          <span v-if="individuDe(n)" class="nom-petit">{{ individuDe(n)!.prenom1 || individuDe(n)!.nom }}</span>
        </div>
      </template>

      <!-- Parents -->
      <div v-for="(n, i) in parents" :key="n" class="noeud moyen" :style="{ left: `${g.xp[i]}px`, top: `${g.yp - RP}px` }">
        <template v-if="individuDe(n)">
          <button class="bulle b-moyenne" :aria-label="`${individuDe(n)!.prenom1} ${individuDe(n)!.nom}`" @click="appui(n, true)">
            <BulleIcone :niveau="n" :taille="30" />
          </button>
          <span class="nom-moyen">{{ individuDe(n)!.prenom1 }}<br /><small>{{ individuDe(n)!.nom }}</small></span>
        </template>
        <template v-else>
          <button class="bulle b-moyenne fantome" :aria-label="`Ajouter : ${role(n).toLowerCase()}`" @click="emit('ajouter', n)">+</button>
          <span class="nom-moyen absent">{{ role(n) }} à compléter</span>
        </template>
      </div>

      <!-- Bulle centrale -->
      <div class="noeud grand" :style="{ left: `${g.xc}px`, top: `${g.yc - RC}px` }">
        <button
          v-if="individuDe(centre)"
          class="bulle b-grande"
          :aria-label="`${individuDe(centre)!.prenom1} ${individuDe(centre)!.nom}, double-touchez pour la fiche`"
          @click="appui(centre, false)"
        >
          <BulleIcone :niveau="centre" :taille="44" />
        </button>
        <span v-if="individuDe(centre)" class="nom-grand">{{ individuDe(centre)!.prenom1 }} {{ individuDe(centre)!.nom }}</span>
        <button v-if="enfant && individuDe(enfant)" class="vers-enfant" @click="recentrer(enfant)">
          <Icone nom="bas" :taille="14" /> {{ individuDe(enfant)!.prenom1 }} {{ individuDe(enfant)!.nom }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ecran-arbre {
  position: relative;
  height: 100%;
  overflow: hidden;
  touch-action: manipulation;
}
.generation {
  position: absolute;
  top: 6px;
  left: 0;
  right: 0;
  margin: 0;
  display: grid;
  justify-items: center;
  gap: 3px;
  z-index: 1;
  pointer-events: none;
}
.generation span {
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #5e7a6b;
}
.generation small {
  font-size: 0.7rem;
  color: #9aafa3;
}
.plan {
  position: absolute;
  inset: 0;
  animation: arrivee 0.38s ease-out;
}
@keyframes arrivee {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}
.traits {
  position: absolute;
  inset: 0;
}
.plein {
  stroke: #7fa894;
  stroke-width: 1.5;
}
.pointille {
  stroke: var(--sauge);
  stroke-width: 1.2;
  stroke-dasharray: 2 5;
}
.absent {
  stroke: var(--sauge-pale);
}
.noeud {
  position: absolute;
  transform: translateX(-50%);
  display: grid;
  justify-items: center;
  text-align: center;
}
.petit {
  width: 84px;
  gap: 4px;
}
.moyen {
  width: 150px;
  gap: 8px;
}
.grand {
  width: 220px;
  gap: 10px;
}
.bulle {
  display: grid;
  place-items: center;
  border-radius: 50%;
  transition: transform 0.12s ease;
}
.bulle:active {
  transform: scale(0.94);
}
.b-petite {
  width: 34px;
  height: 34px;
  background: var(--sauge);
  color: #fff;
  box-shadow: 0 0 0 4px var(--fond);
}
.b-moyenne {
  width: 64px;
  height: 64px;
  background: #fff;
  border: 1.5px solid var(--sapin);
  color: var(--sapin);
  box-shadow: 0 4px 14px rgb(31 74 58 / 10%);
}
.b-grande {
  width: 92px;
  height: 92px;
  background: var(--sapin);
  color: var(--nacre);
  box-shadow: 0 0 0 6px var(--accent-clair), 0 10px 28px rgb(31 74 58 / 22%);
}
.fantome {
  background: transparent;
  border: 1.5px dashed var(--sauge);
  color: #7fa894;
  font-size: 1.4rem;
  box-shadow: none;
}
.b-petite.fantome {
  font-size: 1rem;
  border-width: 1px;
}
.nom-petit {
  font-size: 0.66rem;
  color: #6f8a7c;
  white-space: nowrap;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nom-moyen {
  font-size: 0.82rem;
  line-height: 1.3;
  color: var(--sapin);
}
.nom-moyen small {
  font-size: 0.82rem;
  color: #5e7a6b;
}
.nom-moyen.absent {
  color: #7fa894;
}
.nom-grand {
  font-family: var(--serif);
  font-size: 1.2rem;
  line-height: 1.25;
  color: var(--sapin);
}
.vers-enfant {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 22px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: #5e7a6b;
}
.vers-enfant:active {
  background: var(--accent-clair);
}
</style>
