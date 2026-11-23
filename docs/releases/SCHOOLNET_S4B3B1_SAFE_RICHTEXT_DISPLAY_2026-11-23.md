# SCHOOLNET V2 — S4-B.3-B.1 · Correctif d'affichage sécurisé des consignes et questions

**Date :** 23 novembre 2026  
**Branche isolée :** `fix/schoolnet-s4b3b1-secure-richtext-preview-20261123`  
**Commit source `main` :** `0c47ebf5b1845f4280a8907006800cc3181bbc0a`  
**Statut :** correctif GitHub/CI uniquement, **aucune modification Supabase principal, aucune fusion `main`, aucune publication Vercel**.

## 1. Symptôme confirmé par recette

Dans la page élève de consultation d'une évaluation officielle, des valeurs
issues de l'éditeur riche TipTap enseignant apparaissent comme du texte brut :

- consigne : `<p>Lisez bien les questions</p>` ;
- question : `<p>8*6</p>`.

Le problème est limité au **rendu frontend** : le backend renvoie
volontairement les consignes et questions sans les réponses correctes ;
aucun champ de copie ou de note n'est nécessaire.

**Affichage attendu** : « Lisez bien les questions » et « 8*6 »,
avec les paragraphes et mises en forme pédagogiques lisibles.

> Le symbole `*` représente ici le texte **exact saisi par l'enseignant** :
> ce correctif ne transforme pas automatiquement `8*6` en `8 × 6`.
> Une règle de typographie mathématique exige une décision séparée pour
> éviter de modifier une question ou un calcul.

## 2. Solution retenue

L'existant `src/components/editor/RichTextEditor.tsx` utilise TipTap,
`StarterKit` et `TextAlign` pour éditer et produire du HTML. Le dépôt
ne disposait pas de composant de **lecture seule sécurisé** déjà réutilisable.
Les anciennes pages V1 incluent des rendus `dangerouslySetInnerHTML`,
mais ils ne sont **pas réutilisés** dans ce correctif pour ne pas introduire
d'injection de HTML.

Création de deux modules indépendants :

- `src/components/editor/safeRichTextParser.ts` : convertit le HTML dans
  un document inerte `DOMParser` puis dans un arbre de nœuds typés
  à balises **strictement autorisées**.
- `src/components/editor/SafeRichText.tsx` : produit uniquement
  des éléments React du vocabulaire autorisé et des nœuds texte échappés.

**Formats pris en charge :** paragraphes, listes, titres, gras, italique,
souligné, barré, citations, code, exposants/indices, alignements simples.

**Sécurité :** suppression des éléments non textuels (`script`, `style`,
`iframe`, `svg`, `img`, formulaires, etc.) avec leurs descendants ;
suppression de tous les attributs non validés (`onclick`, `href`,
`src`, styles arbitraires, etc.). Seul `text-align` est accepté
pour les conteneurs autorisés, avec quatre valeurs déterminées.
Les balises inconnues ne conservent que leurs enfants textuels sûrs.
Aucun `dangerouslySetInnerHTML` ni appel `eval` n'est introduit.

La page `src/features/student/pages/StudentSchoolAssessmentPreview.tsx`
emploie ce composant pour :
- la **consigne générale** de l'enseignant ;
- l'**énoncé** de chaque question ;
- le **texte des choix** éventuellement affichés.

La route, les contrôles scolaires, le bouton « Voir l'évaluation », les
données retournées par Supabase, les réponses V1, et les rôles restent
**strictement inchangés**.

## 3. Tests et non-régressions

`npm run qa:s4b3b1:richtext` comprend 15 vérifications sur l'arbre
de rendu, notamment :

- conservation du texte TipTap, de `8*6` et des symboles mathématiques ;
- gras, italique, paragraphes, listes et `text-align` ;
- refus des balises `script`, `style`, `iframe`, `img` et `svg` ;
- refus des attributs d'événement, liens `javascript:` et styles arbitraires ;
- traitement des balises inconnues et limite de profondeur ;
- aucune injection HTML dans la nouvelle page élève ;
- connexion à la CI B.1 existante.

`.github/workflows/schoolnet-s4b3b1-preview-ci.yml` est enrichi pour
exécuter ces tests **en plus** des contrats B.1, des vérifications
d'isolation A/B sur base Supabase **locale jetable**, du lint et du build.

L'éditeur TipTap enseignant n'est pas modifié. Aucune dépendance npm
nouvelle n'est installée.

### Compatibilité Windows — correctif du 23 novembre 2026

Après la première recette locale sous Windows, la compilation TypeScript a
signalé `TS1192` et `TS1261`. Les fichiers
`safeRichText.ts` et `SafeRichText.tsx` pouvaient être confondus par la
résolution des imports sur un système de fichiers insensible à la casse.

La branche `fix/schoolnet-s4b3b1-windows-case-collision-20261123` conserve le contenu du parseur sans modification
et le renomme `safeRichTextParser.ts`. Les imports, le test de formatage et
le déclencheur GitHub Actions sont adaptés. Un contrôle supplémentaire
vérifie l'absence de collisions de noms insensibles à la casse, même sous
Linux. La vérification finale de `npm run build` sera réalisée sur le
Worktree Windows `schoolnet-tests` avant toute autorisation de fusion.

## 4. Périmètre non autorisé

- **Supabase principal : aucun SQL ni donnée modifiés.**
- **`main` et Vercel production : aucun déploiement.**
- **B.2 : réponses et remises restent désactivées.**
- Les anciens composants V1 qui utilisent `dangerouslySetInnerHTML`
  restent hors périmètre ; ils nécessiteront, si souhaité, un **audit
  de sécurité distinct** avant refactorisation.
- La recette visuelle finale (ordinateur et mobile) sera réalisée
  **après autorisation de fusion et de publication Vercel**.

## 5. Portes de validation

- [x] Autorisation utilisateur : développement GitHub isolé et tests.
- [ ] Tests QA du formatage et compilation validés dans GitHub Actions.
- [ ] Recette de non-régression des fonctions V1/V2 validée dans la CI.
- [ ] Autorisation **distincte** de fusion de la PR dans `main`.
- [ ] Autorisation **distincte** de publication Vercel et recette réelle.
