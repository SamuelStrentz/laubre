/**
 * Appui long (≈ 0,5 s sans bouger) sur un élément tactile.
 *   const appui = useAppuiLong()
 *   <button v-on="appui.ecouteurs(() => ouvrirMenu())" @click="appui.clicNormal() && action()">
 * Après un appui long, le « click » qui suit est ignoré.
 */
import { onBeforeUnmount } from 'vue'
import { vibrer } from '@/stores/ui'

const DELAI = 480 // ms
const TOLERANCE = 10 // px

export function useAppuiLong() {
  let minuteur: ReturnType<typeof setTimeout> | undefined
  let depart = { x: 0, y: 0 }
  let declenche = false

  const annuler = () => clearTimeout(minuteur)
  onBeforeUnmount(annuler)

  function ecouteurs(action: () => void) {
    return {
      pointerdown(e: PointerEvent) {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        declenche = false
        depart = { x: e.clientX, y: e.clientY }
        annuler()
        minuteur = setTimeout(() => {
          declenche = true
          vibrer(18)
          action()
        }, DELAI)
      },
      pointermove(e: PointerEvent) {
        if (Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > TOLERANCE) annuler()
      },
      pointerup: annuler,
      pointercancel: annuler,
      pointerleave: annuler,
      // pas de menu contextuel du navigateur sur appui long
      contextmenu(e: Event) {
        e.preventDefault()
      },
    }
  }

  /** Vrai si le clic est un appui normal (faux juste après un appui long). */
  function clicNormal(): boolean {
    if (declenche) {
      declenche = false
      return false
    }
    return true
  }

  return { ecouteurs, clicNormal }
}
