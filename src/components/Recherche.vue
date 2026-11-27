<script setup lang="ts">
/**
 * Recherche discrète d'un individu (prénoms, nom) : à peine visible au repos,
 * elle s'épaissit un peu au toucher et propose les résultats en liste déroulante.
 * Choisir un résultat le place au centre de l'arbre.
 */
import { computed, ref } from 'vue'
import Icone from './Icone.vue'
import BulleIcone from './BulleIcone.vue'
import { useArbreStore } from '@/stores/arbre'
import { annee, nomComplet } from '@/domain/individu'
import { normaliserTexte } from '@/domain/departements'

const emit = defineEmits<{ ouverte: [ouverte: boolean] }>()
const store = useArbreStore()
const texte = ref('')
const active = ref(false)
const champ = ref<HTMLInputElement>()

const resultats = computed(() => {
  const mots = normaliserTexte(texte.value).split(' ').filter(Boolean)
  if (!mots.length) return []
  return store.individus
    .filter((i) => {
      const cible = normaliserTexte([i.prenom1, i.prenom2, i.prenom3, i.nom].join(' '))
      return mots.every((m) => cible.includes(m))
    })
    .slice(0, 8)
})

function ouvrir() {
  active.value = true
  emit('ouverte', true)
}

function fermer() {
  // laisse le temps au tap sur un résultat d'être pris en compte
  setTimeout(() => {
    active.value = false
    texte.value = ''
    emit('ouverte', false)
  }, 150)
}

function choisir(niveau: string) {
  store.centre = niveau
  store.ecran = 'arbre'
  champ.value?.blur()
}

const dates = (n: string, d: string) => {
  const a = annee(n)
  const b = annee(d)
  return a && b ? `${a} – ${b}` : a || (b ? `† ${b}` : '')
}
</script>

<template>
  <div class="recherche" :class="{ active }">
    <label class="zone">
      <Icone nom="loupe" :taille="15" />
      <input
        ref="champ"
        v-model="texte"
        type="search"
        placeholder="Rechercher"
        aria-label="Rechercher un individu par prénom ou nom"
        autocomplete="off"
        autocapitalize="off"
        enterkeyhint="search"
        @focus="ouvrir"
        @blur="fermer"
        @keydown.enter="resultats[0] && choisir(resultats[0].niveau)"
      />
    </label>
    <Transition name="liste">
      <ul v-if="active && texte.trim()" class="resultats" role="listbox">
        <li v-for="i in resultats" :key="i.id">
          <button type="button" role="option" @pointerdown.prevent @click="choisir(i.niveau)">
            <span class="avatar"><BulleIcone :niveau="i.niveau" :taille="18" /></span>
            <span class="textes">
              <strong>{{ nomComplet(i) }}</strong>
              <small>{{ [dates(i.naissance_date, i.deces_date), `niveau ${i.niveau}`].filter(Boolean).join(' · ') }}</small>
            </span>
          </button>
        </li>
        <li v-if="!resultats.length" class="aucun">Aucun individu trouvé</li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.recherche {
  position: relative;
  flex: 1;
  min-width: 0;
  transition: flex 0.25s ease;
}
.zone {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border-radius: 16px;
  border: 1px solid rgb(31 74 58 / 8%);
  background: rgb(255 255 255 / 35%);
  color: rgb(31 74 58 / 35%);
  transition: height 0.2s ease, border-color 0.2s, background 0.2s, color 0.2s;
}
.zone input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  outline: none;
  font-size: 0.85rem;
  color: var(--texte);
}
.zone input::placeholder {
  color: rgb(31 74 58 / 35%);
}
.zone input::-webkit-search-cancel-button {
  display: none;
}
.active .zone {
  height: 38px;
  border-color: var(--sauge);
  background: #fff;
  color: var(--sapin);
  box-shadow: 0 2px 10px rgb(31 74 58 / 8%);
}
.resultats {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 30;
  list-style: none;
  margin: 0;
  padding: 4px;
  max-height: 60vh;
  overflow-y: auto;
  background: var(--carte);
  border: 1px solid var(--bord);
  border-radius: 16px;
  box-shadow: var(--ombre-forte);
}
.resultats button {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 12px;
  text-align: left;
}
.resultats button:active {
  background: var(--accent-clair);
}
.avatar {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent-clair);
  color: var(--sapin);
}
.textes {
  min-width: 0;
  display: grid;
}
.textes strong {
  font-weight: 600;
  font-size: 0.92rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.textes small {
  font-size: 0.75rem;
  color: var(--discret);
}
.aucun {
  padding: 12px;
  font-size: 0.85rem;
  color: var(--discret);
}
.liste-enter-active,
.liste-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.liste-enter-from,
.liste-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
