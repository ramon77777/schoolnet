# SCHOOLNET — Migration de sécurité du Lot 5.C-B.2 appliquée en production

**Date :** 13 novembre 2026.  
**Projet Supabase :** `schoolnet_2.0`, ID `anttmbhaphkhmkoqsofd`.  
**Autorisation :** accord explicite de l'utilisateur après 12/12 tests locaux et recette sandbox PASS.  
**Statut :** **APPLIQUÉE** et vérifiée sur la base principale. Ne pas réexécuter.

## Traçabilité

- Migration Supabase enregistrée : `20261113124329_schoolnet_student_no_email_security_release_20261113`.
- SQL exact exécuté : `supabase/proposals/20261113_student_no_email_release_REVIEW_ONLY.sql`, blob Git `cd271659c8829e7f3933e438a3f14a17b681297f`.
- Le suffixe historique `REVIEW_ONLY` désigne le **nom du fichier source**, pas son statut actuel ; la version associée au blob ci-dessus a bien été appliquée sur la production. Le fichier est laissé en place pour la traçabilité et **ne doit pas être exécuté de nouveau**.
- Branche de travail : `feature/schoolnet-student-sans-email`. Aucune fusion vers `main`.

## Contrôles avant / après

| Contrôle | Avant | Après |
| --- | ---: | ---: |
| Comptes `auth.users` | 11 | **11** |
| Profils `public.profiles` | 11 | **11** |
| Liens `public.parent_links` | 1 | **1** |
| Inscriptions `public.student_enrollments` | 2 | **2** |
| Demandes publiques | 6 | **6** |
| Résolutions publiques | 0 | **0** |
| Niveaux scolaires | 16 | **16** |
| Classes | 2 | **2** |
| Identités Apprenant sans e-mail | absent | **0** (registre créé) |
| Compteurs de login | absent | **0** (table créée) |
| Événements d'audit | absent | **0** (table créée) |

Empreintes d'intégrité, comparées avant/après : comptes Auth `0613cd59bfa930d17e6fdbcd3fcce016`, profils `fa1b532d98e11bda22e5fea949f72c39`, liens familiaux `73c5a78e198edd56ff9ce86a13ae158e`, inscriptions `1c4c8762573fd7af36c6377abe0229af`. Elles sont **identiques** après la migration. Ces empreintes sont des contrôles logiques ciblés, **pas une sauvegarde PostgreSQL complète**.

## Droits et déclencheurs vérifiés

- `public.profiles` : suppression du droit de mise à jour de **toute la table** pour `anon` et `authenticated` ; **UPDATE** accordé sur `full_name`, `phone` et `avatar_url` uniquement à `authenticated`.
- Les droits `UPDATE` sur `role` et `child_ids` sont désormais **refusés** pour `anon` et `authenticated`.
- Schéma `schoolnet_student_private` : `anon` et `authenticated` sans `USAGE` ; `service_role` dispose de `USAGE`.
- Registre `schoolnet_student_no_email_requests` : `ENABLE/FORCE RLS = true`, **aucune politique publique**, lecture/insert/update uniquement `service_role`, pas de DELETE `service_role`.
- Table privée des compteurs : `ENABLE/FORCE RLS = true`.
- RPC `schoolnet_no_email_login_gate` : `EXECUTE` uniquement `service_role` ; refusé à `anon` et `authenticated`.
- RPC `schoolnet_no_email_my_session_enabled()` : volontairement autorisée au rôle `authenticated` ; elle renvoie **un booléen** dépendant de `auth.uid()`, ne transmet aucune identité d'un autre utilisateur.
- Quatre déclencheurs installés : `schoolnet_student_no_email_record_guard`, `schoolnet_student_no_email_resolution_guard`, `schoolnet_student_no_email_parent_links_guard`, `schoolnet_student_no_email_child_ids_guard`.
- Les **5** politiques RLS initiales de `public.profiles` sont conservées.

## Advisor Supabase après migration

- `rls_enabled_no_policy` : **4 → 7 INFO**. Trois tables fermées supplémentaires sont attendues par conception.
- `authenticated_security_definer_function_executable` : **115 → 116 WARN**. Le signalement supplémentaire est dû à `schoolnet_no_email_my_session_enabled()` ; revue de son exposition avant activation indispensable. Guide : https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- `anon_security_definer_function_executable` : **53 → 53 WARN**, sans augmentation.
- `function_search_path_mutable` : **14 → 14 WARN**, sans augmentation.
- `auth_leaked_password_protection` : **1 WARN**, déjà présent ; à traiter avant mise en service. Guide : https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Ces avis ne sont pas automatiquement des vulnérabilités exploitables ; ils nécessitent revue, particulièrement avant ouverture du login.

## En attente d'autorisation distincte

**Aucune fonction Edge de production du nouveau module n'a été déployée.** Aucune clé HMAC, Captcha, IP de confiance ou autre secret d'activation n'a été installée pendant cette migration. Les indicateurs frontend de production restent désactivés.

Pour terminer le Lot 5.C-B.2, il reste une recette de bout en bout sur environnement contrôlé : création du compte test, remise/invitation, Auth réel, vérification d'une session `pending` sans accès direct aux données métiers, activation, révocation et rattachement familial. Le domaine technique contrôlé, Turnstile, le secret HMAC et le proxy IP de confiance sont des prérequis.

**Ne pas confondre :** migration DB validée ≠ connexion Apprenant réellement activée. Le rattachement de Yao Tabra à Yao Thierno n'a pas été effectué.
