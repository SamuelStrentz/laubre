/** Partage (Android) ou téléchargement d'un fichier généré par l'appli. */
export async function partagerOuTelecharger(blob: Blob, nom: string, titre: string): Promise<void> {
  const fichier = new File([blob], nom, { type: blob.type })
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: titre })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: nom })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Nom de fichier sans caractère interdit. */
export function nomFichier(texte: string): string {
  return texte.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') || 'arbre'
}
