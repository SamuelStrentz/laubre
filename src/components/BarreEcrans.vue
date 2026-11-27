<script setup lang="ts">
/**
 * Zone de swipe en bas de l'écran. Le doigt va vers l'écran visé
 * (même logique que le menu d'Œnoleptica) : ← Générations, → Profil, puis Stats.
 * Les trois libellés restent touchables.
 */
import type { Ecran } from '@/stores/arbre'
import { vibrer } from '@/stores/ui'

const ecran = defineModel<Ecran>({ required: true })
const ORDRE: Ecran[] = ['generations', 'arbre', 'profil', 'stats']
const LIBELLES: Record<Ecran, string> = { generations: 'Générations', arbre: 'Arbre', profil: 'Profil', stats: 'Stats' }
const SEUIL = 40 // px

let depart: { x: number; y: number } | null = null

function aller(e: Ecran) {
  if (e !== ecran.value) vibrer(10)
  ecran.value = e
}

function surAppui(e: PointerEvent) {
  depart = { x: e.clientX, y: e.clientY }
}

function surRelache(e: PointerEvent) {
  if (!depart) return
  const dx = e.clientX - depart.x
  const dy = e.clientY - depart.y
  depart = null
  if (Math.abs(dx) < SEUIL || Math.abs(dx) < Math.abs(dy)) return
  const i = ORDRE.indexOf(ecran.value) + (dx < 0 ? -1 : 1)
  if (i >= 0 && i < ORDRE.length) aller(ORDRE[i])
}
</script>

<template>
  <nav
    class="barre-ecrans"
    aria-label="Écrans"
    @pointerdown="surAppui"
    @pointerup="surRelache"
    @pointercancel="depart = null"
  >
    <div class="piste" role="tablist">
      <span class="curseur" :style="{ transform: `translateX(${ORDRE.indexOf(ecran) * 100}%)` }" aria-hidden="true"></span>
      <button
        v-for="e in ORDRE"
        :key="e"
        role="tab"
        :aria-selected="e === ecran"
        :class="{ actif: e === ecran }"
        @click="aller(e)"
      >
        {{ LIBELLES[e] }}
      </button>
    </div>
    <p>Glissez ← → ici pour changer d'écran</p>
  </nav>
</template>

<style scoped>
.barre-ecrans {
  flex: none;
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 10px 20px calc(var(--bas-sur) + 12px);
  background: rgb(247 246 241 / 92%);
  border-top: 1px solid #e6ece7;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}
.piste {
  position: relative;
  width: min(100%, 360px);
  height: 46px;
  padding: 4px;
  border-radius: 23px;
  background: #e8efea;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.curseur {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc((100% - 8px) / 4);
  height: 38px;
  border-radius: 19px;
  background: var(--sapin);
  box-shadow: 0 2px 8px rgb(31 74 58 / 25%);
  transition: transform 0.3s cubic-bezier(0.3, 0.8, 0.3, 1);
}
.piste button {
  position: relative;
  z-index: 1;
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: #5e7a6b;
  transition: color 0.3s;
}
.piste button.actif {
  color: var(--nacre);
}
p {
  margin: 0;
  font-size: 0.7rem;
  color: #9aafa3;
}
</style>
