# SCHOOLNET V2 — S4-D.2c.4 : provenance serveur des intitulés scolaires

**26 novembre 2026 — PROPOSITION D'ESSAI, pas une migration de production.**

## Point d'entrée confirmé

La recette Windows de **S4-D.2c.3** est réussie : branche `local/schoolnet-s4d2c3`, HEAD `758c45e`, **9/9** tests, compilation TypeScript/Vite (934 modules) réussie, dernier `git status -sb` propre. Les PR antérieures restent en brouillon. Les exports PDF/Excel vérifiés en S4-D.2c.2 sont **synthétiques uniquement**.

## Objectif

Établir un point de lecture serveur qui attache les libellés « établissement, année, classe, période, matière » à un **périmètre d'accès recalculé par PostgreSQL**, au lieu de faire confiance aux chaînes d'un formulaire. Le résultat ne contient **aucune note, identité, liste d'élèves, soumission, copie ni bulletin**. Seul un effectif agrégé d'élèves actifs est renvoyé pour comparer la cardinalité avec la projection S4-D.2b.

### SQL candidat exclusivement jetable

`supabase/proposals/s4d2c4_school_export_authorized_labels.sql` prépare :

- un helper privé `schoolnet_private.school_official_export_labels` (`SECURITY DEFINER`, `search_path=pg_catalog`, `auth.uid()` et rôle issu de `public.get_my_role()`) ;
- une seule RPC exposable `public.schoolnet_official_export_labels` (`SECURITY INVOKER`), `GRANT EXECUTE` réservé à `authenticated`, jamais `anon` ;
- vérification de l'affiliation scolaire **active et non révoquée**, du statut actif de l'établissement, de la correspondance année/classe/période et du rôle exact ;
- pour l'administrateur d'établissement : uniquement `class_general` et référentiel officiel **approuvé** de sa classe/période ;
- pour l'enseignant : uniquement `subject_period`, **affectation active** sur cette classe/matière et coefficient officiel valide ;
- refus du semestre/annuel non représenté par une période admissible, de la classe B demandée avec école A, des rôles parents/élèves, des identités révoquées, des libellés vides ou malformés ;
- réponse strictement limitée à 15 champs : version, état « aperçu », type, rôle, cinq identifiants de périmètre, cinq intitulés et effectif agrégé (sans identité/score).

Les tables sources proposées sont `public.schoolnet_schools`, `public.school_years`, `public.classes`, `schoolnet_private.school_grading_periods` et `public.academic_subjects`. L'affiliation active et les affectations sont vérifiées sur les tables SCHOOLNET V2 existantes. Aucun `INSERT`, `UPDATE`, `DELETE`, `ALTER TABLE` ou changement de policy n'est présent dans la proposition de production.

Un précontrôle vérifie l'existence de **chaque colonne nommée** avant d'autoriser l'installation dans l'environnement temporaire. **Ces signatures doivent encore être comparées au schéma réel de Supabase principal, sans rien y appliquer.** La preuve sur la fixture ne remplace pas une certification des migrations historiques.

### Séparation explicite de la fixture CI

Le schéma synthétique C.3-C.3.5.2 ne contenait pas les colonnes de libellés de la configuration scolaire C.3-A. La recette ajoute donc **uniquement dans Supabase jetable localhost** quatre colonnes `name` par l'overlay `tests/s4c3c35-supabase-ci/fixtures/s4d2c4_disposable_name_columns.sql`, puis les peuple avec des noms fictifs via `s4d2c4_disposable_names_seed.sql`. Ceci **ne constitue pas une migration historique**. Les dix utilisateurs sont créés par le véritable GoTrue temporaire avec des JWT réels, sans compte du Supabase principal.

La fixture de configuration C.3-B.2 emploie encore un petit substitut **fail-closed** pour sa vérification préalable C.3-A, comme dans le sous-lot précédent. Il ne sera pas déployé.

### Contrat TypeScript indépendant

`src/features/official-documents/lib/schoolOfficialExportServerLabels.ts` vérifie la forme **exacte** et rejette tout décalage entre les noms/identifiants serveur et la projection S4-D.2b déjà contrôlée : même établissement, année, classe, période, matière, rôle, type de relevé et **effectif identique**. Aucun champ hors liste, aucun zéro inventé et aucune fuite de note.

La construction des arguments de lecture réutilise `makeOfficialExportRpcArgs` : aucun identifiant d'utilisateur arbitraire, année falsifiée, score, role claim ou nom libre n'est envoyé à l'API.

**Aucun composant React n'appelle cette RPC.** `SCHOOLNET_REAL_EXPORTS_RELEASED = false` reste inchangé et aucun PDF/Excel réel n'est généré. Un label renvoyé par ce contrat est uniquement une validation de cohérence côté client, **pas une permission d'export**.

## Recette et limites

1. GitHub Actions : `npm run qa:s4d2c4` et toutes les régressions S4-D précédentes, lint et build.
2. GitHub Actions Supabase jetable : données 100 % inventées, GoTrue/JWT authentiques, table d'école A/B, contrôle admin/enseignant/parent/élève, état d'approbation, révocations, épreuve de non-exposition des notes/dossiers/identités, agrégat d'effectif actif ; destruction de l'instance en fin de job.
3. Windows : `npm run qa:s4d2c4`, `npm run build`, statut Git propre. Pas de Docker ni de PostgreSQL requis sur le PC.
4. **Après** validation de ce sous-lot : définir puis tester le raccordement de la projection S4-D.2b aux intitulés SQL sur un environnement scolaire jetable représentatif. Il reste à vérifier l'alignement avec les colonnes et migrations certifiées du vrai Supabase avant toute proposition d'activation.

**Portes de sécurité maintenues** : aucune fusion `main`, aucun déploiement Vercel, aucune requête/migration au Supabase principal, aucune publication officielle, aucun téléchargement scolaire réel, aucune extension des droits « toutes matières » ou « annuel ». La PR reste brouillon.
