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
| Échange | GEDCOM 5.5.1 (import / export), sans dépendance |
| État | Pinia |
| Tests | Vitest (couche base de données) |
| Hébergement | GitHub Pages via GitHub Actions |

## Arborescence

```
src/
├── db/            schema.ts (CREATE identiques au logiciel PC), sql.ts, worker.ts, client.ts (RPC)
├── repositories/  arbre.ts : portage de la classe Base (familles, valeurs proposées, statistiques)
├── domain/        individu.ts (dates, niveau, saisie), regions.ts (anciennes régions),
│                  departements.ts, gedcom.ts (lecture, import « l'appli prévaut », export)
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
  appui sur la bulle verte du centre, ou double appui sur n'importe quelle bulle = fiche flottante (bouton « Modifier ») ;
  bulle « + » = ajouter l'individu manquant.
- **Zone de swipe** en bas : le doigt va vers l'écran voulu — Générations · Arbre · Profil · Stats (les libellés sont aussi touchables).
- **Flèche latérale** à côté de la bulle centrale : passe au conjoint (00 ↔ 01).
- **Recherche** discrète en haut : prénom / nom, la personne choisie passe au centre de l'arbre.
- **Générations** : vignettes regroupées par couple (famille), appui = fiche, « Modifier » = saisie.
  Pastille **Belle-famille** (désactivée par défaut, retenue par arbre) : affiche ou non la lignée de la conjointe
  (niveaux 10, 11, 100…) dans les générations, le profil et les stats. L'arbre reste toujours navigable.
- **Saisie** : nom de famille en MAJUSCULES, au choix dans la liste des noms de la base ; dates avec « / » automatiques
  (JJ/MM/AAAA, MM/AAAA ou AAAA) ; pastille verte / grise sur Naissance, Mariage, Décès pour renseigner ou non
  l'événement (grise = bloc replié, rien d'enregistré) ; ville ou code postal → CP, département,
  ancienne région, pays ; à l'ajout, valeurs proposées comme le logiciel PC (lieux de l'enfant, mariage du conjoint).
- **Profession** et **source** par événement (acte, registre ou lien https://) ; une source = « ✓ Acte sourcé » dans la fiche.
- **Appui long** sur une bulle de l'arbre ou une vignette des générations : options (fiche, modifier) et accès aux
  actes renseignés — un lien s'ouvre, une référence écrite se copie. Un acte sans source n'apparaît pas.
- Le **niveau** n'est modifiable qu'à la création.
- **Parent inconnu** : pastille en haut à droite de l'identité (verte = connu). Grise, l'individu s'affiche
  « Parent inconnu », sa bulle est grisée et sa branche fermée (pas d'ajout de ses parents). Il n'est compté
  ni dans les statistiques, ni dans le contrôle, ni dans l'export GEDCOM. Impossible pour la souche.
- **Contrôle des données** (Profil, sous la complétude) : informations manquantes (prénom, nom, dates et lieux
  des événements non désactivés) et incohérences (décès avant la naissance, parent né après l'enfant,
  date de mariage différente entre époux…). Toucher une ligne place l'individu au centre de l'arbre ;
  une fois corrigée, elle disparaît de la liste.
- **Profil** : complétude (un événement « non renseigné » compte comme complet), part des actes sourcés,
  import / export **GEDCOM**. À l'import, on choisit les générations à importer (cases à cocher, détail par individu
  en dépliant) ; seuls les nouveaux individus de la lignée de la souche sont ajoutés :
  un individu déjà présent n'est ni remplacé ni complété, les écarts de dates sont ignorés.
- **Stats** : répartition par département, région, pays, ville ; âge moyen au décès par génération, au mariage ;
  naissances par décennie ; prénoms et noms fréquents.
- Chaque modification est enregistrée tout de suite, puis copiée dans le dossier lié.

## Compatibilité avec le logiciel PC

Les ajouts de Laubre restent lisibles par le logiciel PC, qui les ignore :
colonnes `identite.profession` et `identite.inconnu`, et table `evenement_info` (source et « non renseigné » de chaque événement).
Le logiciel PC conserve ces données quand il modifie un individu.

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
