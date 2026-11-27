<script setup lang="ts">
/**
 * Options d'un individu, ouvertes par un appui long (arbre ou générations).
 * Les actes n'apparaissent que s'ils sont renseignés (source saisie) :
 * un lien s'ouvre, une référence écrite (registre, cote…) se copie.
 */
import { computed } from 'vue'
import Icone from './Icone.vue'
import BulleIcone from './BulleIcone.vue'
import { useArbreStore } from '@/stores/arbre'
import { useUiStore } from '@/stores/ui'
import { nomComplet } from '@/domain/individu'
import { EVENEMENTS, type Evenement } from '@/db/schema'

const props = defineProps<{ niveau: string | null }>()
const emit = defineEmits<{ fermer: []; fiche: [niveau: string]; modifier: [id: number] }>()
const store = useArbreStore()
const ui = useUiStore()

const i = computed(() => (props.niveau ? store.parNiveau.get(props.niveau) ?? null : null))
const LIBELLES: Record<Evenement, string> = { naissance: 'Acte de naissance', mariage: 'Acte de mariage', deces: 'Acte de décès' }

const estLien = (t: string) => /^https?:\/\/\S+$/i.test(t)
const actes = computed(() =>
  i.value
    ? EVENEMENTS.map((ev) => ({ ev, source: i.value![`${ev}_source`].trim() }))
        .filter((a) => a.source)
        .map((a) => ({ ...a, lien: estLien(a.source), libelle: LIBELLES[a.ev] }))
    : [],
)

/** Lien : domaine seul, pour ne pas afficher l'URL complète. */
const domaine = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'lien'
  }
}

async function copier(texte: string) {
  try {
    await navigator.clipboard.writeText(texte)
    ui.toast('Référence de l\'acte copiée')
  } catch {
    ui.toast(texte)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="options">
      <div v-if="i" class="voile-options">
        <button class="voile" aria-label="Fermer" @click="emit('fermer')"></button>
        <div class="feuille" role="menu" :aria-label="`Options : ${nomComplet(i)}`">
          <span class="poignee" aria-hidden="true"></span>
          <header>
            <span class="avatar" :class="{ inconnu: i.inconnu }"><BulleIcone :niveau="i.niveau" :taille="22" /></span>
            <strong>{{ nomComplet(i) }}</strong>
          </header>
          <button role="menuitem" class="option" @click="emit('fiche', i.niveau)"><Icone nom="profil" :taille="20" /> Voir la fiche</button>
          <button role="menuitem" class="option" @click="emit('modifier', i.id)"><Icone nom="crayon" :taille="20" /> Modifier</button>
          <template v-for="a in actes" :key="a.ev">
            <a v-if="a.lien" role="menuitem" class="option acte" :href="a.source" target="_blank" rel="noopener noreferrer" @click="emit('fermer')">
              <Icone nom="acte" :taille="20" />
              <span><strong>{{ a.libelle }}</strong><small>Ouvrir · {{ domaine(a.source) }}</small></span>
            </a>
            <button v-else role="menuitem" class="option acte" @click="copier(a.source)">
              <Icone nom="acte" :taille="20" />
              <span><strong>{{ a.libelle }}</strong><small>{{ a.source }} · toucher pour copier</small></span>
            </button>
          </template>
          <p v-if="!actes.length" class="aucun">Aucun acte renseigné pour l'instant.</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.voile-options {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  align-items: end;
}
.voile {
  position: absolute;
  inset: 0;
  background: rgb(24 48 38 / 22%);
}
.feuille {
  position: relative;
  display: grid;
  gap: 4px;
  padding: 8px 12px calc(var(--bas-sur) + 16px);
  border-radius: 24px 24px 0 0;
  background: #fbfaf6;
  box-shadow: var(--ombre-forte);
}
.poignee {
  justify-self: center;
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--sauge-pale);
  margin-bottom: 6px;
}
header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px 10px;
  border-bottom: 1px solid var(--accent-clair);
  margin-bottom: 4px;
}
header strong {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 1.1rem;
  color: var(--sapin);
}
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--sapin);
  color: var(--nacre);
}
.avatar.inconnu {
  background: #d7dcd9;
  color: #8a948f;
}
.option {
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 10px;
  border-radius: 14px;
  color: var(--sapin);
  text-decoration: none;
  text-align: left;
  font-size: 0.95rem;
}
.option:active {
  background: var(--accent-clair);
}
.acte span {
  display: grid;
  min-width: 0;
}
.acte strong {
  font-weight: 600;
}
.acte small {
  font-size: 0.78rem;
  color: var(--discret);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.aucun {
  margin: 4px 10px 0;
  font-size: 0.82rem;
  color: var(--discret);
}
.options-enter-active,
.options-leave-active {
  transition: opacity 0.2s ease;
}
.options-enter-active .feuille,
.options-leave-active .feuille {
  transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.options-enter-from,
.options-leave-to {
  opacity: 0;
}
.options-enter-from .feuille,
.options-leave-to .feuille {
  transform: translateY(100%);
}
</style>
