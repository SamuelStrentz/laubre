# Laubre

*De l'occitan « aubre », l'arbre.* Ton arbre généalogique sur Android : une application web installable qui marche hors ligne.
Elle utilise la **même base SQLite** que le logiciel PC « Arbre généalogique » (Python, v4) :
tables `identite`, `naissance`, `mariage`, `deces`, `famille`, mêmes clés étrangères (cascade), même notation du niveau.
Une même base `.db` s'ouvre donc dans Laubre, dans le logiciel PC et dans DB Browser for SQLite.

## Stack (identique à Œnoleptica)

| Couche | Choix |
|---|---|
| Interface | Vue 3 (Composition API) + TypeScript |
| Build / PWA | Vite + vite-plugin-pwa (Workbox) |
| Base | SQLite WASM officiel (`@sqlite.org/sqlite-wasm`) dans un Web Worker, stockage OPFS « SAHPool » |
| Dossier local | API File System Access : copie automatique de la base dans `<dossier>/db/<nom>.db` |
| Lieux | geo.api.gouv.fr (ville ↔ code postal, département), **anciennes régions** (avant 2016) |
| État | Pinia |
| Tests | Vitest (couche base de données) |
| Hébergement | GitHub Pages via GitHub Actions |

## Arborescence

```
src/
├── db/            schema.ts (CREATE identiques au logiciel PC), sql.ts, worker.ts, client.ts (RPC)
├── repositories/  arbre.ts : portage de la classe Base (familles, valeurs proposées, statistiques)
├── domain/        individu.ts (dates, niveau, saisie), regions.ts (anciennes régions)
├── services/      dossier-local.ts (dossier du téléphone)
├── stores/        arbre (données + navigation), dossier (copie / version plus récente), ui (toasts)
├── components/    EcranArbre, EcranGenerations, EcranProfil, BarreEcrans (zone de swipe),
│                  FicheIndividu (bulle flottante), ChampsEvenement, ChampListe, Initialisation…
└── views/         AccueilView (les 3 écrans), IndividuFormView (ajout / modification)
tests/             tests Vitest sur une base en mémoire
```

## Utilisation

- **Première ouverture** : 1. créer la base (ou ouvrir un `.db` existant), 2. choisir son emplacement
  (dossier du téléphone, sous-dossier `db`), 3. créer la souche (vous).
- **Arbre** (écran d'accueil, toujours ouvert sur la souche) : appui sur un parent ou un grand-parent = il passe au centre ;
  double appui sur une bulle = fiche flottante (bouton « Modifier ») ; bulle « + » = ajouter l'individu manquant.
- **Zone de swipe** en bas : le doigt va vers l'écran voulu — ← Générations, → Profil (les libellés sont aussi touchables).
- **Générations** : vignettes regroupées par couple (famille), appui = fiche, « Modifier » = saisie.
- **Saisie** : nom de famille au choix dans la liste des noms de la base ; ville ou code postal → CP, département,
  ancienne région, pays ; à l'ajout, valeurs proposées comme le logiciel PC (lieux de l'enfant, mariage du conjoint).
- Chaque modification est enregistrée tout de suite, puis copiée dans le dossier lié.

## Développement

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests de la couche base
npm run build      # vérification des types + build dans dist/
```

## Mise en ligne sur GitHub Pages

1. Crée un dépôt GitHub `laubre` et envoie ces fichiers sur la branche `main`.
   ⚠️ Par l'interface web, le dossier `.github/` (caché) n'est pas envoyé : crée `.github/workflows/deploy.yml` à la main
   (bouton *Add file › Create new file*, colle le contenu du fichier).
2. Sur GitHub : **Settings › Pages › Build and deployment › Source : GitHub Actions**.
3. Chaque push sur `main` lance les tests, le build et le déploiement (`https://<ton-pseudo>.github.io/laubre/`).
4. Sur le téléphone, ouvre l'adresse dans Chrome, puis **Profil › Installer l'application** (ou menu ⋮ › *Installer l'application*).
