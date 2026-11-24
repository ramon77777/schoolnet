# SCHOOLNET V2 — S4-B.3-C.1 : résultats officiels parents

**Date :** 24 novembre 2026.

**Périmètre :** G1 validé par l’utilisateur ; développement sur branche dédiée et livraison initiale en pull request brouillon. L’installation SQL C.1 sur `schoolnet_2.0` a ensuite reçu un GO distinct et a réussi le 24 novembre 2026. Le même jour, l’utilisateur a autorisé le rattachement du parent de recette, puis la fusion dans `main` et la publication officielle des modules validés.

**Branche :** `feature/schoolnet-s4b3c1-parent-official-results-20261124`.

**Base :** PR #29, commit `de7f6aee72ff7bb84f27be40dcb2bf30218a654d`.

**Source SQL approuvée et installée :** commit `289a8aa05be1d1d69fecbaea0e21f414983d322d`.

**État de livraison :** SQL principal installé et postflight réussi ; recette parent réelle limitée à la liste et au détail observée sur `localhost` ; 11 contrôles CI réussis au commit `444c177`. La fusion dans `main` et la publication officielle sont autorisées. Leur exécution reste à consigner dans la [PR #30](https://github.com/ramon77777/schoolnet/pull/30) ; cette note ne les déclare pas déjà réalisées.

## 1. Résultat livré et dépendances

Le menu Parent → **Résultats** ouvre désormais les résultats officiels publiés. La vue **Cours libres** conserve le parcours historique. Un enfant scolarisé dans les cours officiels peut apparaître sans inscription V1.

Chaque résultat présente l’enfant, l’établissement, la classe, l’année scolaire, la matière, le cours, l’évaluation, sa note, son barème et sa date de publication. Le détail reste dans l’espace Parent et ajoute uniquement l’appréciation globale publiée. Il affiche le texte tel quel, sans interpréter du HTML.

La sélection d’un enfant et « Tous mes enfants » sont conservées au retour du détail. La liste propose recherche, type d’évaluation et pagination. Les états distinguent absence de lien familial, absence de résultat publié, résultat indisponible, chargement et erreur. Une erreur du volet officiel laisse la vue Cours libres accessible.

Cette branche dépend de B.4 / PR #29, elle-même dépendante de B.3 / PR #28 et B.2 / PR #27. La comparaison avec `main` contient aussi leurs changements. La revue propre à C.1 compare le commit de base ci-dessus à la tête de cette branche. L’intégration autorisée via la PR #30 est cumulative : elle doit conserver ces dépendances et leur historique.

## 2. Autorisations et état réel de la livraison

La validation G1 a autorisé le code, les tests isolés, la branche et la PR brouillon. L’utilisateur a ensuite autorisé explicitement l’installation SQL C.1 sur Supabase principal. **Cette installation est réalisée**, sous la version `20261124090800`, avec le nom `schoolnet_s4b3c1_parent_official_results`.

L’opération porte sur les fonctions et leurs permissions. Elle ne crée aucun compte ni lien familial et n’écrit aucune note, copie ou notification métier. Le postflight réel a utilisé des claims vides et des arguments `NULL` pour ses essais de refus, sans prendre l’identité d’un parent ou d’un enfant réel.

Après l’installation technique, l’utilisateur a désigné un parent existant et autorisé son rattachement au compte élève de recette. Le lien a été créé et vérifié dans `parent_links`, `profiles.child_ids` a été synchronisé et le lien familial antérieur a été conservé. Cette opération familiale distincte ne fait pas partie de la migration SQL C.1. La recette réelle observée ensuite est détaillée en section 8, sans donnée permettant d’identifier les comptes.

Le 24 novembre 2026, l’utilisateur a ensuite autorisé explicitement la fusion dans `main` et la publication officielle des modules validés. Cette nouvelle autorisation complète le GO SQL ; elle couvre la livraison cumulative décrite en section 9.

La propriété `git.deploymentEnabled` de `vercel.json` désactive le déploiement automatique pour le nom exact de la branche C.1. Elle ne change pas les règles des autres branches.

## 3. Autorité et confidentialité

`parent_links(parent_id, student_id)` est la source du lien familial. `profiles.child_ids` ne crée aucun droit. La liste des cours libres a également été raccordée à cette source d’autorité.

Chaque lecture officielle vérifie le parent authentifié, le rôle élève de l’enfant et son lien familial, puis le contexte scolaire actif : école, classe, année, affiliations, affectations, matière, enseignant, cours et évaluation. Les vérifications reprennent les conditions scolaires B.2/B.3-A avec l’enfant autorisé ; aucun JWT élève n’est fabriqué ou substitué.

Le parent n’a pas besoin d’une adhésion scolaire de rôle « parent ». Une fratrie peut avoir des résultats dans plusieurs établissements. Aucun filtre implicite « année courante seulement » n’est ajouté : les affectations et l’année doivent être cohérentes. L’accès historique après transfert ou révocation n’est pas garanti par ce lot.

Une copie est exposée seulement si son statut est `published`, sa date de publication est présente et finie, et sa note est finie et comprise entre zéro et le barème strictement positif et fini. Un statut privé accompagné d’une ancienne date de publication reste privé.

La réponse ne contient ni questions, ni réponses, ni corrigé détaillé, ni fichiers, ni liste d’autres élèves. Le catalogue n’inclut pas d’appréciation. Le détail refuse explicitement une appréciation historique dépassant 4 000 caractères Unicode ; il ne la tronque pas silencieusement. Le garde de correction B.3 protège déjà les nouvelles appréciations.

Les réponses réseau sont associées au compte, au rôle, au mode démo et à la requête courante. Une réponse tardive ne doit pas réafficher un résultat de l’ancien compte ou de l’ancien détail.

## 4. Contrat SQL et frontend

| Point d’entrée public | Réponse |
|---|---|
| `schoolnet_parent_official_results()` | `{ children, results }`, enfants liés et résultats publiés accessibles. |
| `schoolnet_parent_official_result(p_child_id uuid, p_assessment_id uuid)` | `{ found: false }`, ou `{ found: true, result, feedback }`. |

Le résultat comporte exactement les champs `childId`, `childName`, `courseId`, `assessmentId`, `schoolId`, `schoolName`, `classId`, `className`, `schoolYear`, `subjectName`, `courseTitle`, `title`, `type`, `maxScore`, `score`, `publishedAt`. Le modèle frontend valide les UUID, dates, nombres, types, doublons, associations enfant-résultat et l’absence de champs supplémentaires.

Le catalogue est limité à 1 000 enfants et 5 000 résultats. Le dépassement provoque une erreur explicite ; aucune famille n’est tronquée silencieusement.

Les deux façades publiques sont `SECURITY INVOKER`. Les deux wrappers privés et le helper partagé sont `SECURITY DEFINER`, `STABLE`, avec `search_path=pg_catalog`. Les wrappers vérifient l’appelant en base. Le helper `schoolnet_private.parent_official_result_rows(uuid,uuid)` n’est exécutable ni par `PUBLIC`, ni par `anon`, ni par `authenticated`, ni par `service_role`.

Un appelant absent ou non-parent est refusé avec `42501`. Pour un parent valide, le détail renvoie le même `{ found: false }` lorsque l’enfant n’est pas lié, lorsque la copie n’est pas publiée ou lorsque le contexte scolaire est refusé.

### Sources principales

- `src/features/parent/lib/parentOfficialResultsModel.ts` : contrat, validation et routes.
- `src/features/parent/lib/parentOfficialResultsApi.ts` : appels RPC et contrôle des identifiants retournés.
- `src/features/parent/lib/useParentResultRequest.ts` : isolation du chargement et réponses tardives.
- `src/features/parent/components/ParentOfficialResults.tsx` : catalogue et états.
- `src/features/parent/components/ParentOfficialResultDetail.tsx` : résultat et appréciation.
- `src/features/parent/components/ParentOfficialResultSummary.tsx` : contexte scolaire et note.
- `src/features/parent/pages/ParentResults.tsx` et `ParentResultsDetail.tsx` : intégration au parcours existant.

## 5. Cloisonnement des anciens accès parent

Les trois fonctions historiques suivantes conservent leurs signatures et comportements pour les évaluations qui n’ont jamais été officielles :

| Fonction historique | Empreinte initiale auditée | Empreinte après protection |
|---|---|---|
| `get_parent_child_assessment_detail(uuid,uuid)` | `b609cd47364424e5b28eaa0f692f0db3` | `b89c4719c8b5b5fa427cf634328da45e` |
| `get_parent_child_assessment_submissions(uuid)` | `7bb34d159b8090d0104a43e6ccba9829` | `56a21d53edfc0dc8b5eb5addfe0e8a0c` |
| `get_parent_child_homework_submissions(uuid)` | `c784095a394514bbab780ac2ba6c1b77` | `deddc10f89c5f3d7623161440d7922e7` |

La protection exclut toute évaluation présente dans `school_assessment_links`, même si ce rattachement est révoqué. Le détail historique refuse l’objet avant de charger sa copie ou ses corrections.

Les définitions réelles, modes de sécurité, propriétaires, volatilité, `search_path` et ACL ont été sauvegardés dans `s4b3c1_legacy_parent_rpcs_original_snapshot.json`. Le remplacement SQL est strictement contrôlé par les empreintes avant et après ; une dérive impose une nouvelle revue. Les huit policies restrictives B.0 restent intactes.

## 6. Installation réalisée, contrôles et retour arrière

| Fichier dans `supabase/` | Usage |
|---|---|
| `verification/s4b3c1_parent_official_results_preflight_readonly.sql` | Préflight utilisé avant installation : prérequis, absence des nouvelles fonctions et versions/ACL historiques en transaction `READ ONLY`. |
| `proposals/s4b3c1_parent_official_results.sql` | Source approuvée du commit `289a8aa`, exécutée atomiquement pour créer cinq fonctions de lecture et protéger les trois anciennes RPC. |
| `migrations/20261124090800_schoolnet_s4b3c1_parent_official_results.sql` | Archive exacte des octets installés ; ne pas réinstaller la migration déjà enregistrée. |
| `verification/s4b3c1_parent_official_results_postflight_readonly.sql` | Contrôles après installation : corps, ACL, modes de sécurité, huit policies B.0 et refus sans sujet Auth, en transaction `READ ONLY`. |
| `verification/s4b3c1_parent_official_results_installation_2026-11-24.json` | Preuve d’installation : autorisation, version, empreintes, postflight et métadonnées comparées avant/après. |
| `verification/s4b3c1_parent_official_results_rollback_manual.sql` | Retirer les cinq nouvelles fonctions, conserver les protections V1. |
| `verification/s4b3c1_legacy_parent_rpcs_restore_original_manual.sql` | Restauration historique exceptionnelle et séparée, réouvrant l’ancien chemin insuffisamment cloisonné. |

Le préflight en lecture seule sur `schoolnet_2.0` a retourné `S4B3C1_PREFLIGHT_READONLY_PASS`. Après le GO distinct, l’installation a utilisé le fichier exact du commit approuvé et a réussi. Le postflight réel a ensuite retourné **`S4B3C1_POSTFLIGHT_READONLY_PASS`**, avec `transactionReadOnly=on` et refus des accès sans sujet Auth ou sous rôle `anon`.

### Preuve de la version installée

| Élément | Valeur observée |
|---|---|
| Projet | `schoolnet_2.0`, PostgreSQL `17.6` |
| Version de migration | `20261124090800` |
| Nom de migration | `schoolnet_s4b3c1_parent_official_results` |
| Commit source approuvé | `289a8aa05be1d1d69fecbaea0e21f414983d322d` |
| Historique SQL | Une entrée de script SQL de **18 932 caractères**, identique à la source approuvée. |
| Archive source | **18 932 octets**, conservés à l’identique. |
| MD5 source et historique | `cad54e9eb2549abb734eafac40012bb3` |
| SHA-256 source | `e579a5ca055fd1c487072a3b1eeeb969601645e58d4d35e5bf4bf583622b79be` |

Le postflight a validé les cinq corps de fonctions C.1 et leurs propriétaires, modes de sécurité, volatilité, `search_path` et ACL. Il a également confirmé les trois empreintes historiques après protection figurant en section 5, avec leurs ACL conservées.

Les huit policies restrictives B.0 sont identiques avant et après : leur empreinte composite reste `b955ce92ac762770641cc876db2c08e6`. L’empreinte des définitions et ACL des autres fonctions des schémas `public` et `schoolnet_private` incluses dans le contrôle reste `eb77a814959843255148d455460be7c5`. Les tables protégées contrôlées conservent leur propriétaire `postgres` et leur RLS active. Ces comparaisons portent sur les métadonnées enregistrées dans la preuve JSON ; elles ne sont pas une recette utilisateur parent.

Les advisors de sécurité sont identiques avant et après l’installation. Aucune nouvelle alerte C.1 n’a été constatée :

| Groupe existant | Niveau | Nombre avant et après |
|---|---|---|
| [rls_enabled_no_policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) | INFO | 13 |
| [function_search_path_mutable](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) | WARN | 14 |
| [anon_security_definer_function_executable](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) | WARN | 45 |
| [authenticated_security_definer_function_executable](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) | WARN | 114 |
| [auth_leaked_password_protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) | WARN | 1 |

### Retour arrière uniquement sur décision distincte

Le rollback normal attend `S4B3C1_PARENT_OFFICIAL_RESULTS_ROLLBACK_PASS`. Il ne doit jamais entraîner automatiquement la restauration des anciennes RPC non protégées.

La restauration exceptionnelle exige les API C.1 déjà retirées, les empreintes protégées exactes et le paramètre transactionnel explicite `schoolnet.c1_allow_legacy_restore='yes'`. Son marqueur est `S4B3C1_LEGACY_PARENT_RPCS_RESTORE_PASS`. Son existence dans le dépôt n’autorise pas son exécution sur la base principale.

## 7. Vérifications et preuves reproductibles

La commande `npm run qa:s4b3c1` vérifie le contrat strict, les dates/notes, les associations d’enfants, les données interdites, les routes et les bornes Unicode. La suite parent V1 reste couverte par `scripts/test-schoolnet-lot5c-parent-children.mjs`.

Les **209 tests Node** de C.1 et des régressions sélectionnées ont passé lors de la préparation du commit approuvé. Ce commit `289a8aa` a également obtenu une CI verte, incluant les trois jobs décrits ci-dessous et **12 tests navigateur**. `npm run lint` passe sans erreur, avec quatre avertissements préexistants hors du lot. `npm run build` passe, avec l’avertissement de taille du bundle déjà présent.

Le commit de traçabilité `444c17791f15a2cd437e4bfe1d9fa2a60da5dad8` ajoute l’archive d’installation et un test de parité, octet par octet, entre la proposition approuvée et l’archive de migration. La suite C.1 comporte ainsi **17 tests**, pour **210 tests Node** dans l’ensemble sélectionné. Ces **210 tests ont été réexécutés localement après archivage et ont tous passé**. Les 12 tests navigateur sont inchangés. Le 24 novembre 2026, les **11 contrôles CI rattachés à ce commit `444c177` ont été vérifiés avec le statut `success`**. Ce constat identifie précisément la version contrôlée ; les résultats du commit de documentation et du commit final d’intégration devront être rattachés à leurs propres SHA.

Les fixtures `tests/s4b3c1-tenant-ci/fixtures/` reconstituent les anciennes RPC exactes puis des familles A/B/fratrie entièrement fictives. Elles vérifient notamment :

- enfant officiel sans inscription V1, fratrie dans plusieurs écoles et aucun enfant lié ;
- enfant d’une autre famille, lien retiré, `child_ids` sans lien et changement de rôle ;
- contextes scolaires révoqués ou incohérents, cours ou école inactifs ;
- copies privées, dates résiduelles, notes/barèmes non valides ;
- appréciations de 4 000 caractères Unicode et refus au-delà ;
- exclusion des évaluations officielles actives ou révoquées dans les trois RPC V1 ;
- maintien des résultats libres et du masquage de leurs notes privées ;
- permissions des helpers, absence d’écriture et conservation de la protection après rollback.

La chaîne PostgreSQL a aussi été exécutée localement dans PGlite/PostgreSQL 19 éphémère. Ce contrôle rapide ne remplace pas la validation canonique PostgreSQL 17 de la CI.

Le workflow `.github/workflows/schoolnet-s4b3c1-parent-results-ci.yml` comporte trois jobs :

1. **Contrats, régressions, lint et build** : mêmes tests du projet.
2. **Familles A/B et rollback** : Supabase CLI 2.122.1, PostgreSQL 17 local jetable, reconstruction B.0 à B.4, installation C.1, tests fonctionnels, rollback protégé, restauration historique refusée sans paramètre et vérification du refus en cas de dérive. La configuration propre à C.1 se trouve dans `tests/s4b3c1-tenant-ci/supabase/config.toml`. Elle suit la version majeure du projet principal, dont `server_version=17.6` a été vérifié en lecture seule le 24 novembre 2026 ; les configurations CI antérieures restent inchangées.
3. **Parcours parent et mobile** : Chromium et réponses réseau fictives, navigation liste/détail/retour, filtres, appréciation en texte, états vides/erreur et réponse tardive après changement de compte. Les requêtes externes sont bloquées. Les captures ordinateur et mobile sont conservées comme artefact de CI pendant sept jours.

Les tests navigateur ont été transférés vers ce job car le bac à sable local interdit les sockets nécessaires à Chromium. Ils ne constituent pas une recette réelle d’un parent connecté à Supabase principal. Les résultats de chaque job et leur commit sont consultables depuis la pull request.

## 8. Recette parent réelle observée le 24 novembre 2026

Le parent existant a été désigné par l’utilisateur et son lien avec le compte élève de recette a été autorisé, créé puis vérifié. La synchronisation de `profiles.child_ids` conserve sa fonction de donnée de compatibilité ; l’autorité d’accès reste `parent_links`. Le lien familial antérieur a été conservé.

Les captures partagées à **09:35 et 09:36**, sur `localhost`, montrent une session Parent normale et les observations suivantes :

| Écran observé | Résultat de la recette réelle |
|---|---|
| Liste des résultats officiels | Un résultat publié, noté **20/20**, pour l’enfant autorisé. |
| Détail du résultat | La même note et le même contexte scolaire, accompagnés de l’appréciation globale. |

Cette recette réelle valide la consultation de la liste et de ce détail depuis le compte parent désigné. Le retour, les filtres, la vue Cours libres et les autres configurations familiales n’ont pas été revendiqués comme testés sur ce compte réel. La couverture plus large des **12 scénarios navigateur** repose sur les familles fictives de CI et reste une preuve distincte. Les captures, identités et identifiants privés ne sont pas reproduits dans cette note.

## 9. Intégration cumulative et publication officielle autorisées

L’autorisation du 24 novembre 2026 porte sur la fusion dans `main` et la publication officielle des modules validés. La PR #30 regroupe les travaux des PR #27, #28, #29 et #30. Au commit `444c177`, sa branche comprend **29 commits supplémentaires par rapport à la base `main` utilisée pour la préparation**, dont le correctif B.1 des imports sur Windows. Cet historique doit être conservé lors de l’intégration cumulative.

La livraison vise le projet Vercel existant **`schoolnet`**, à l’adresse officielle [schoolnet-snowy.vercel.app](https://schoolnet-snowy.vercel.app). La PR #30 doit porter la trace de la fusion et de la publication : commit intégré, contrôles CI correspondants, déploiement retenu et vérification de l’adresse officielle. L’autorisation est acquise ; ces opérations ne sont pas présentées comme déjà exécutées dans cette note de préparation.

La présente mise à jour est documentaire : elle n’altère aucun code, comportement d’exécution ni SQL. Elle consigne la recette limitée et l’autorisation nouvelle sans réinstaller la migration déjà appliquée.

La supervision administrative, les bulletins, les moyennes trimestrielles, les fichiers, les corrections détaillées et les notifications parent restent hors de C.1.
