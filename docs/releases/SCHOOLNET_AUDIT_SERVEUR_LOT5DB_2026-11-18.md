# SCHOOLNET — Audit serveur en lecture seule | Lot 5D-B

**Date :** mercredi 18 novembre 2026  
**Statut :** AUDIT TERMINÉ — AUCUNE ÉCRITURE SUPABASE — AUCUNE INSTALLATION  
**Cible :** Supabase principal `schoolnet_2.0` (`anttmbhaphkhmkoqsofd`)  
**Branche de travail :** `feature/schoolnet-lot5d-a-securisation-20261118` — [PR #15](https://github.com/ramon77777/schoolnet/pull/15), brouillon.

## 1. Mandat et méthode

Autorisation reçue : **inspection SQL en lecture seule** et **actualisation du workflow GitHub**.
Seules des requêtes `SELECT` ont été envoyées au projet Supabase principal.
Les objets et permissions ont été examinés avec les vues de `pg_catalog`,
`information_schema`, `pg_policies`, `pg_indexes`, et la lecture du code SQL
`pg_get_functiondef` / `pg_get_triggerdef`. Le rapport d'advisors
Supabase Security a été consulté **sans action corrective**.

Aucune modification de données, de statut, de compte Auth, de RLS,
de fonction, de table, de migration, de Storage ni de calendrier n'a été faite.
Aucun détail personnel (noms, e-mails, téléphones ni UUID d'élève) n'est
publié dans ce rapport.

## 2. État réel du calendrier et des inscriptions

| Année | Année courante | Dossiers totaux | Actifs | Terminés | Brouillons | Classes |
|---|---|---:|---:|---:|---:|---:|
| 2025–2026 | Oui | 1 | 1 | 0 | 0 | 1 legacy |
| 2026–2027 | Non | 1 | 1 | 0 | 0 | 1 legacy |
| 2027–2028 | Non | 0 | 0 | 0 | 0 | 0 |

**Différence essentielle par rapport à une hypothèse de doublon :**
le dossier actif source et le dossier actif cible concernent **deux apprenants différents**.
Le contrôle SQL des dossiers actifs pour un même élève dans plusieurs années
renvoie **0 paire**. Le blocage est celui d'une **année cible déjà peuplée et
active**, pas d'une duplication d'identité prouvée.

Pour les deux dossiers existants, les classes sont de contexte
`legacy_unclassified`, sans `school_id`, et correspondent à l'année du dossier.
Aucune mauvaise année de classe n'a été détectée dans ces deux dossiers.

Autres compteurs sans données identifiantes :
- 4 événements historiques d'inscriptions (`student_enrollment_events`).
- 2 rattachements legacy `class_students` et 2 `class_teachers`.
- 0 classe officielle `classes.learning_context='school'`.
- 0 affectation S3-C élève-classe et 0 intervention S3-C enseignant-matière.
- 1 affiliation scolaire active dans `schoolnet_school_memberships`.
- 0 paire de dossiers actifs pour le **même** apprenant sur des années différentes.

**Attention :** l'absence d'affectations S3-C aujourd'hui n'autorise pas à
éliminer leurs contrôles de la migration finale : de nouvelles données
peuvent arriver dans l'intervalle.

## 3. Schéma, migration et protections installées

- **43 migrations** enregistrées dans `supabase_migrations.schema_migrations`.
- Dernière migration : `20261118083254_schoolnet_s3c_class_assignments`.
- Tables `school_year_rollover_decisions` et `school_year_rollover_runs` :
  **absentes**.
- RPC `admin_finalize_school_year_rollover(uuid,uuid,text)` : **absente**.
- RPC **legacy** `admin_set_current_school_year(uuid)` : **présente**.
- Trigger de protection du passage d'année 5D-A : **absent**.
- Seul trigger métier direct sur `school_years` : mise à jour de
  `updated_at` à chaque `UPDATE`.
- Index unique partiel `idx_school_years_only_one_current` présent :
  il limite à **une** année courante, mais ne contrôle **ni les dossiers**,
  **ni les décisions**, ni les affectations S3-C.

## 4. Risque bloquant n° 1 — activation directe encore possible côté serveur

La fonction `public.admin_set_current_school_year(uuid)` :
1. Est `SECURITY DEFINER`, avec privilège `EXECUTE` pour `authenticated`
   (pas pour `anon` dans l'état audité).
2. Vérifie `auth.uid()` puis `public.is_admin()`.
3. Verrouille `public.school_years` en `SHARE ROW EXCLUSIVE`.
4. Modifie les drapeaux `is_current` des années.
5. **N'exige pas** la résolution des dossiers actifs dans l'année cible,
   la clôture des dossiers sources ni l'écriture d'un journal de passage.

La table `school_years` a RLS activée et une policy `ALL` pour le rôle
`authenticated` avec prédicat Admin. Les privilèges SQL de table
`UPDATE` existent également pour `authenticated` et `anon`, mais
l'existence d'un `GRANT` **ne signifie pas** qu'une modification est
autorisée par RLS. Un **Admin effectivement autorisé** dispose néanmoins
d'un chemin d'activation sans processus transactionnel métier complet.

**Mesure provisoire :** le bouton d'activation directe reste retiré dans
le code de PR #15 ; **ne pas lancer la RPC** ou changer manuellement
`is_current`. Ce contrôle d'interface **ne supprime pas** la possibilité
côté serveur tant que la migration consolidée n'est pas approuvée/installée.

## 5. Risque bloquant n° 2 — effets des anciennes fonctions d'inscription

Les fonctions historiques sont administrateur-gardées, mais la simple
réutilisation de leur logique pour une réinscription interannuelle présente
des effets annexes :

- `admin_upsert_student_enrollment` peut modifier/créer le dossier,
  supprimer/insérer des lignes de `class_students`, et changer
  `profiles.class_name`.
- `admin_set_student_enrollment_status` change le statut, modifie les
  rattachements `class_students` et peut synchroniser le profil.
- `student_enrollments` comporte une contrainte unique
  `(student_id, school_year_id)` ; l'index prévient un doublon technique
  mais **pas** le choix incorrect de classe, ni l'écrasement d'un dossier
  cible déjà actif.
- L'historisation par trigger `trg_log_student_enrollment_event`
  existe, mais **ne remplace pas** un journal de passage annuel atomique
  comportant source, cible, décisions, acteur et vérifications.

**Conséquence :** ne pas réutiliser directement
`admin_upsert_student_enrollment` dans un finaliseur 5D sans prouver
l'absence d'effet sur les liens classe/profil et les archives scolaires.
Concevoir une opération spécifique avec contrôles avant/après et rollback.

## 6. Isolement S2-A/S3-C : protections existantes et précautions

Les tables officielles
`schoolnet_school_student_class_assignments` et
`schoolnet_school_teacher_subject_assignments` ont RLS activée,
**aucune policy utilisateur**, et aucun `INSERT/UPDATE/DELETE` accordé
directement à `authenticated` ou `anon` dans l'état examiné.
Leur accès est piloté via les fonctions serveur et contrôles spécifiques.

- Index unique S3-C : **au plus une classe active par élève, école et année**.
- Triggers S3-C d'intégrité présents sur les affectations officielles.
- Contraintes de statut : `active` / `revoked`, cohérence de `revoked_at`.

**Le passage d'année global 5D ne doit jamais convertir des classes
officielles en classes legacy, ni déplacer automatiquement ces affectations.**
La future migration doit relire la situation par établissement après
acquisition des verrous. Les politiques d'affectation doivent être définies
en tant que circuit distinct, sur décision métier.

## 7. Avertissements de l'advisor Security : registre séparé

Un scan **lecture seule** de Supabase Security Advisors relève notamment
au niveau global du projet :
- `anon_security_definer_function_executable` : 53 avertissements.
- `authenticated_security_definer_function_executable` : 116 avertissements.
- `function_search_path_mutable` : 14 avertissements.
- `rls_enabled_no_policy` : 11 informations, dont certaines tables
  S3-C volontairement fermées aux accès directs.
- Une recommandation distincte de protection des mots de passe compromis.

Le **nombre d'avertissements n'est pas un nombre de vulnérabilités
démontrées**. Plusieurs RPC `admin_*` vérifient elles-mêmes
`is_admin()`; d'autres fonctions sont des triggers. Une revue de
chaque fonction, de son exposabilité PostgREST, de ses rôles et de ses
effets est nécessaire **avant** tout `REVOKE` global, afin de ne pas
casser les parcours actifs Lot 5C/S2/S3.

Références advisor :
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## 8. Décisions de gestion à obtenir avant toute finalisation

1. **Qualifier le dossier actif 2026–2027** : est-il légitime,
   préparé à l'avance, historique ou à corriger ? Exiger un examen
   par Super Admin avec historique, sans correction automatique.
2. Définir si le calendrier est **global SCHOOLNET** ou si les écoles
   déclenchent un cycle autonome sur leurs propres affectations S3-C.
   Une interface globale ne doit pas présumer d'autorisations multi-écoles.
3. Définir les décisions explicites pour chaque dossier source :
   poursuite, redoublement, départ, dossier cible préexistant.
4. Geler une politique de conservation des bulletins, notes,
   absences, cours, liens parentaux, dossiers et événements.
5. Prévoir un finaliseur transactionnel **serveur seulement**,
   doté d'un journal immuable, de verrous ordonnés, contrôles
   de rôle et tenant, idempotence et annulation complète si erreur.
6. Les verrous et l'autorisation ne peuvent être remplacés par
   `VITE_*`, une origine navigateur ou un simple GUC modifiable
   par un client SQL.

## 9. Suites proposées — aucune installation autorisée

**À préparer ensuite sur GitHub (autorisation distincte pour le code SQL
exécutable)** :
- Migration consolidée 5D-A+B sécurisant à la fois la RPC directe
  existante **et** les permissions `school_years`.
- Vérificateur transactionnel côté serveur, prise en compte explicite des
  dossiers déjà présents dans l'année cible et du périmètre école.
- Matrice de tests : rôles, RLS, classe legacy/officielle, cible déjà active,
  statuts, concurrency/replay, rollback, événements, historiques.
- Recette isolée en ROLLBACK avec données **fictives** uniquement.
- **Autorisation séparée** avant installation SQL sur le projet principal,
  fusion dans `main`, puis publication sur Vercel SCHOOLNET existant.

**À ne PAS faire maintenant** : `supabase db push`, `apply_migration`,
`UPDATE school_years`, `admin_set_current_school_year`,
modification de dossiers, suppression de données, activation du flag
`VITE_SCHOOLNET_LOT5D_WRITES_ENABLED`, fusion `main` ou déploiement.

## 10. Vérification finale de ce mandat

- SQL exécuté : **SELECT uniquement**.
- Valeur année courante inchangée : **2025–2026**.
- Dossiers actifs source/cible : **1 / 1**.
- Total migrations : **43** ; RPC 5D finale toujours **absente**.
- Audit GitHub et rapport : modifications de documentation uniquement
  dans la branche `feature/schoolnet-lot5d-a-securisation-20261118`.

**Feu vert technique pour préparer le design consolidé en mode revue ;
aucun feu vert pour la bascule réelle ni l'installation SQL.**
