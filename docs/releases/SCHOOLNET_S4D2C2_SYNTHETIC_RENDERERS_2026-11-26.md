# SCHOOLNET V2 — S4-D.2c.2 — Modèles PDF/Excel de projections synthétiques

**Date :** 26 novembre 2026 · **Branche :** `feature/schoolnet-s4d2c2-synthetic-preview-renderers-20261126` · **Base :** S4-D.2c.1 / PR #52.

## Recette précédente validée

Le sous-lot **S4-D.2c.1** a passé les **9 tests Windows**, la compilation TypeScript/Vite (934 modules) et un statut Git propre au commit `489e266`. La CI avait réussi 53/53 tests et les vérifications SQL héritées. La passerelle d'export reste **désactivée** (`SCHOOLNET_REAL_EXPORTS_RELEASED = false`).

## Objet exact de cette livraison

Créer des **gabarits de relevés PDF A4 et Excel (.xlsx)** à partir de la **forme vérifiée** d'une projection scolaire S4-D.2b, mais alimentés **exclusivement avec une projection synthétique**. Les documents sont obligatoirement marqués « RELEVÉ PROVISOIRE — NON PUBLIÉ » et « DONNÉES SYNTHÉTIQUES — RECETTE UNIQUEMENT ».

Les générateurs **refusent le navigateur** et ne sont importés par aucun écran. Les sorties ne contiennent aucune information réelle, aucune note V1 et aucun bulletin officiel. Le développement S4-D.2a reste inchangé et séparé. Aucune connexion Supabase n'a été ajoutée.

## Vérifications des données et du design

La fabrication du gabarit vérifie de nouveau école, année, classe, période, matière, format, type de relevé et identité de session contre le modèle S4-D.2b. Les intitulés SCHOOLNET servent **uniquement à la présentation** : ils sont prélevés ici sur des libellés synthétiques liés aux mêmes identifiants, jamais utilisés pour autoriser la consultation.

- Un zéro valide reste **0,00/20** ; toute moyenne indisponible reste `null` puis un tiret, jamais zéro.
- Une matière présente une complétude en **évaluations** ; une moyenne générale en **matières**.
- Le fichier affiche un **numéro de ligne**, et non l'UUID interne de l'élève. Une référence d'audit fictive apparaît pour assurer la traçabilité de recette ; elle n'atteste pas d'une véritable opération.
- PDF A4 paginé avec bandeau SCHOOLNET, titres, mentions de test, état et moyenne, pagination. Excel OOXML ZIP sans macros ni liens externes : une feuille, styles, filtre, gel des en-têtes et nombres à 2 décimales.
- Les cellules textuelles XLSX sont des chaînes `inlineStr` neutralisant les préfixes de formule, avec échappement XML. Les chaînes du PDF sont échappées pour le format PDF. Aucun contenu externe, CDN ou lib supplémentaire.

Les tests utilisent 13 élèves synthétiques pour le cas principal et 70 pour la pagination. Aucun dump, jeton de production, identifiant réel ou clé de service n'est requis.

## Fichiers ajoutés

`schoolSyntheticPreviewDocument.ts` : validation et adaptation du contrat V2. `schoolSyntheticPreviewPdf.ts` : moteur A4. `schoolSyntheticPreviewXlsx.ts` : moteur Excel. `schoolSyntheticPreviewBytes.ts` : sélection du format sans téléchargement navigateur. `scripts/fixtures/schoolnet-s4d2c2-synthetic-preview.mjs` : jeu de test. `scripts/test-schoolnet-s4d2c2-synthetic-renderers.mjs` : recette automatisée. `scripts/generate-schoolnet-s4d2c2-samples.mjs` : commande de prévisualisation Windows.

## Recette Windows après validation CI

Depuis `D:\Bakary\10 autres\schoolnet-tests` :

~~~powershell
npm run qa:s4d2c2
npm run build
git restore -- tsconfig.app.tsbuildinfo
git status -sb
~~~

Puis pour obtenir des fichiers à examiner dans Chrome/Adobe Reader/Excel :

~~~powershell
npm run demo:s4d2c2
~~~

Cette commande écrit **quatre fichiers synthétiques** (PDF et Excel × matière et moyenne générale) dans un dossier aléatoire du répertoire temporaire Windows. Elle affiche les chemins complets. **Aucun fichier n'est écrit dans le dépôt Git.** Le contrôle du rendu du zéro, des tirets, des libellés et de la mention de synthèse est requis.

## Ce qui reste interdit

Aucun export réel, aucune activation de la RPC depuis le navigateur, aucune publication officielle ni export annuel, aucun tableau toutes matières, aucun SQL appliqué à Supabase principal, aucune fusion `main` ou déploiement Vercel. Les PR restent brouillon. La phase ultérieure S4-D.2c.3 devra certifier la provenance des libellés et des droits sur un environnement isolé avant tout raccordement.
