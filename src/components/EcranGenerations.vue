<script setup lang="ts">
/**
 * Vue par générations (même modèle que l'écran Vignerons d'Œnoleptica) :
 * un séparateur par génération, les couples regroupés (famille = P0 + P1,
 * comme le logiciel PC), une vignette par individu.
 */
import { computed } from 'vue'
import BulleIcone from './BulleIcone.vue'
import { useArbreStore } from '@/stores/arbre'
import { useAppuiLong } from '@/composables/useAppuiLong'
import { annee, nomComplet, type Individu } from '@/domain/individu'

const emit = defineEmits<{ fiche: [niveau: string]; ajouter: [niveau: string]; options: [niveau: string] }>()
const store = useArbreStore()
const long = useAppuiLong()

interface Place {
  niveau: string
  individu: Individu | null
  libelleAjout: string
}
interface Famille {
  prefixe: string
  titre: string
  numero: number | null
  places: Place[]
}

const nomDe = (n: string) => {
  const i = store.parNiveau.get(n)
  return i ? i.prenom1 || nomComplet(i) : `niveau ${n}`
}

function libelleAjout(n: string): string {
  if (n === '1') return 'Ajouter votre conjointe'
  if (n === '0') return 'Ajouter le conjoint'
  return `${n.endsWith('0') ? 'Ajouter le père' : 'Ajouter la mère'} de ${nomDe(n.slice(0, -1))}`
}

const generations = computed(() => {
  const niveaux = [...store.parNiveau.keys()]
  if (!niveaux.length) return []
  const max = Math.max(...niveaux.map((n) => n.length))
  const resultat: { numero: number; familles: Famille[] }[] = []
  for (let L = 1; L <= max; L++) {
    const prefixes = new Set(niveaux.filter((n) => n.length === L).map((n) => n.slice(0, -1)))
    // individus de la génération précédente sans aucun parent : place libre (jusqu'à la dernière génération existante)
    if (L > 1) for (const n of niveaux) if (n.length === L - 1) prefixes.add(n)
    const familles = [...prefixes]
      .filter((p) => store.visible(p + '0')) // belle-famille masquée par défaut
      .sort()
      .map<Famille>((p) => {
      const places = [p + '0', p + '1'].map((n) => ({ niveau: n, individu: store.parNiveau.get(n) ?? null, libelleAjout: libelleAjout(n) }))
      const numero = places.map((x) => x.individu?.famille).find((f) => f) ?? null
      return { prefixe: p, titre: p === '' ? 'Souche et conjoint·e' : `Parents de ${nomDe(p)}`, numero, places }
    })
    if (familles.length) resultat.push({ numero: L - 1, familles })
  }
  return resultat
})

function detail(i: Individu): string {
  const n = annee(i.naissance_date)
  const d = annee(i.deces_date)
  const dates = n ? (d ? `${n} – ${d}` : n) : d ? `† ${d}` : ''
  return [dates, i.naissance_ville].filter(Boolean).join(' · ') || 'À compléter'
}
</script>

<template>
  <section class="ecran-generations">
    <header class="tete">
      <div>
        <h1>Générations</h1>
        <p>{{ store.stats?.individus ?? 0 }} individus · {{ store.stats?.familles ?? 0 }} familles</p>
      </div>
      <button
        class="belle-famille"
        role="switch"
        :aria-checked="store.belleFamille"
        aria-label="Afficher la famille de la conjointe"
        @click="store.afficherBelleFamille(!store.belleFamille)"
      >
        <span class="texte">Belle-famille</span>
        <span class="pastille"></span>
      </button>
    </header>

    <section v-for="gen in generations" :key="gen.numero" class="groupe">
      <h2 class="separateur"><span>Génération {{ gen.numero }}</span></h2>
      <div class="familles">
        <div v-for="f in gen.familles" :key="f.prefixe" class="famille">
          <p class="titre-famille">
            <span>{{ f.titre }}</span><small v-if="f.numero">Famille {{ f.numero }}</small>
          </p>
          <template v-for="p in f.places" :key="p.niveau">
            <button
              v-if="p.individu"
              class="carte vignette"
              v-on="long.ecouteurs(() => emit('options', p.niveau))"
              @click="long.clicNormal() && emit('fiche', p.niveau)"
            >
              <span class="avatar"><BulleIcone :niveau="p.niveau" :taille="24" /></span>
              <span class="infos">
                <strong>{{ nomComplet(p.individu) }}<span v-if="p.individu.souche" class="etoile" aria-label="souche"> ★</span></strong>
                <span>{{ detail(p.individu) }}</span>
              </span>
              <span class="code">{{ p.niveau }}</span>
            </button>
            <button v-else class="vignette fantome" @click="emit('ajouter', p.niveau)">
              <span class="plus">+</span>{{ p.libelleAjout }}
            </button>
          </template>
        </div>
      </div>
    </section>
    <p class="astuce">Touchez une vignette pour ouvrir la fiche · appui long pour les actes.</p>
  </section>
</template>

<style scoped>
.ecran-generations {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 32px;
}
.tete {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 4px 0;
}
.tete h1 {
  font-size: 1.5rem;
  color: var(--sapin);
}
.tete p {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--discret);
}
.belle-famille {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px 0 10px;
  border-radius: 22px;
  font-size: 0.8rem;
  color: #5e7a6b;
}
.belle-famille:active {
  background: var(--accent-clair);
}
/* même pastille que les blocs Naissance / Mariage / Décès */
.pastille {
  width: 16px;
  height: 16px;
  margin-right: 8px;
  border-radius: 50%;
  background: #b9c2bd;
  box-shadow: 0 0 0 3px rgb(185 194 189 / 25%);
  transition: background 0.2s, box-shadow 0.2s;
}
.belle-famille[aria-checked='true'] .pastille {
  background: #2e9e5b;
  box-shadow: 0 0 0 3px rgb(46 158 91 / 18%);
}
.belle-famille[aria-checked='true'] .texte {
  color: var(--sapin);
}
/* Séparateur de génération : petites capitales entre deux filets fondus */
.separateur {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 22px 4px 10px;
  font-family: var(--serif);
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sapin);
}
.separateur::before,
.separateur::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(31 74 58 / 40%));
}
.separateur::after {
  background: linear-gradient(90deg, rgb(31 74 58 / 40%), transparent);
}
.familles {
  display: grid;
  gap: 12px;
}
.famille {
  display: grid;
  gap: 6px;
  padding: 6px;
  border-radius: 22px;
  background: #ebf1ec;
}
.titre-famille {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 2px 10px 0;
  font-size: 0.72rem;
  color: #7f9a8b;
}
.vignette {
  width: 100%;
  min-height: 68px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  text-align: left;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  transition: transform 0.12s ease;
}
.vignette:active {
  transform: scale(0.985);
}
.avatar {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent-clair);
  color: var(--sapin);
}
.infos {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}
.infos strong {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.infos span {
  font-size: 0.82rem;
  color: var(--discret);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.etoile {
  color: var(--sapin);
}
.code {
  flex: none;
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--sapin);
  background: #f1f5f2;
  border-radius: 10px;
  padding: 4px 8px;
}
.fantome {
  min-height: 56px;
  border: 1.5px dashed #bccfc3;
  border-radius: 18px;
  color: var(--discret);
  font-size: 0.9rem;
}
.plus {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1.5px dashed var(--sauge);
  display: grid;
  place-items: center;
  font-size: 1.2rem;
  color: #7fa894;
}
.astuce {
  text-align: center;
  font-size: 0.78rem;
  color: var(--discret);
  margin-top: 18px;
}
</style>
