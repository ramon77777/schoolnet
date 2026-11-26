# SCHOOLNET V2 — S4-C.5 · Fiche de moyenne générale par élève
## Reprise du développement fonctionnel

**26 novembre 2026 — branche fonctionnelle isolée, PR brouillon.**

### Objectif

Prolonger directement l'écran existant **`/app/school/official-general-averages`** : l'administrateur d'établissement peut sélectionner un élève **déjà présent dans la prévisualisation autorisée** et voir sa fiche de moyenne générale dans le tableau, sans changer d'écran ni déclencher de nouvelle requête.

Aucun nouveau module de sauvegarde, aucun recalcul de note, aucune nouvelle table, aucune politique RLS et aucune migration SQL.

### Parcours utilisateur

1. Ouvrir « Moyennes générales officielles » avec le rôle **`school_admin`**.
2. Sélectionner l'établissement, l'année scolaire, la classe et la période, puis consulter la prévisualisation lorsque le programme des matières a été approuvé.
3. Utiliser le bouton **« Consulter »** dans la colonne **« Aperçu »** sur la ligne de l'élève souhaité.
4. Lire la fiche **non publiée** : nom de l'élève, établissement, classe, période, statut, matières calculables et restantes, moyenne générale sur 20 **uniquement si calculable** et explication pédagogique. Appuyer sur **« Masquer »** ou **« Fermer la fiche »** pour refermer la fiche dans le tableau.

La fiche est une **lecture** de la projection fournie par `readOfficialGeneralPreview` et contrôlée par `isOfficialGeneralPreview`. Elle ne propose ni saisie de note, ni recalcul navigateur, ni classement scolaire, ni bouton d'export.

### Sécurité et intégrité

- L'écran reste derrière le `RoleGate` existant `school_admin` et la vérification `!user.isDemo`.
- Le détail s'ouvre seulement pour un **identifiant d'élève présent dans la projection courante et valide**, reliée aux quatre identifiants établissement/année/classe/période.
- La sélection est liée à `reviewKey` (qui incorpore les identifiants et la révision) : changer d'établissement, de classe, de période, de compte ou actualiser supprime immédiatement l'ancien détail. Même si la projection se charge de manière asynchrone, un ancien élève ne peut pas être affiché dans une autre portée.
- Une moyenne **`0,00 / 20` calculable** reste visible. Une moyenne **`null`** pour une fiche incomplète ou non configurée affiche **« — »** ; aucun score manquant n'est converti en zéro.
- Les données ne sont ni téléchargées, ni publiées, ni journalisées. L'ancien moteur V1 des bulletins et moyennes n'est pas modifié.
- Le composant n'invoque pas `supabase.from`, `supabase.rpc`, une Edge Function ni aucun nouvel endpoint. L'autorisation côté serveur reste celle des RPC scolaires existantes.

**Limite connue :** les RPC des moyennes générales sont encore **non installées** sur Supabase principal. En production, l'écran conserve son message « Activation SQL en attente » ; **aucune donnée fictive ne remplace un résultat de production**. La recette fonctionnelle utilise le mode de prévisualisation **DEV uniquement** déjà implémenté, sans élargir l'accès des utilisateurs de démonstration.

### Recette de l'écran (données fictives uniquement)

Le mode DEV existant utilise l'URL :

`/app/school/official-general-averages?schoolnet_c3c4_demo=1`

Depuis une session d'administrateur d'établissement autorisée, avec `npm run dev` (et non `npm run preview` de production) :

- Vérifier « Données 100 % fictives » en haut.
- Établissement fictif A, **6e B**, premier trimestre : choisir un élève calculable, puis vérifier la fiche.
- Vérifier l'élève fictif avec moyenne **0,00** : la fiche doit afficher **0,00 / 20**.
- Vérifier un élève **incomplet** et **non configuré** : la fiche n'affiche pas de moyenne.
- Changer de classe, de période ou d'établissement : la fiche précédente doit se fermer automatiquement et aucune ancienne donnée ne doit rester visible.
- Tester les boutons **Consulter / Masquer / Fermer la fiche**, la recherche, les filtres et les pages sur écran étroit.

**Ne jamais saisir ou copier des données d'élèves réelles dans cette recette.**

### Contrôles techniques

`npm run qa:s4c5` : tests unitaires sur la fixture existante et la stricte sélection des élèves, isolation A/B, zéro/null, refus des données malformées, fermeture de la sélection hors contexte, aucune modification de l'API et du verrou d'exports.

`npm run qa:s4c3c4` : non-régression de la page générale existante.

`npm run lint` et `npm run build` : TypeScript + Vite.

### Livrables

- `src/features/schools/lib/schoolGeneralStudentReview.ts` — sélection/lecture sûre d'une ligne déjà validée.
- `src/features/schools/pages/LocalSchoolOfficialGeneralAverages.tsx` — colonne Aperçu et fiche dépliable avec intitulés métier.
- `scripts/test-schoolnet-s4c5-general-student-review.mjs` — recette du contrat.
- `.github/workflows/schoolnet-s4c5-student-review-ci.yml` — QA fonctionnelle et build.

**Interdits inchangés :** pas de migration Supabase principal, pas de fusion `main`, pas de déploiement Vercel, pas de publication ni d'export scolaire réel (`SCHOOLNET_REAL_EXPORTS_RELEASED = false`).
