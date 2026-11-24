# SCHOOLNET V2 — S4-B.3-C.1 : résultats officiels parents

**Date :** 24 novembre 2026.

**Périmètre :** G1 validé par l’utilisateur ; développement sur branche dédiée et livraison en pull request brouillon.

**Branche :** `feature/schoolnet-s4b3c1-parent-official-results-20261124`.

**Base :** PR #29, commit `de7f6aee72ff7bb84f27be40dcb2bf30218a654d`.

## 1. Résultat livré et dépendances

Le menu Parent → **Résultats** ouvre désormais les résultats officiels publiés. La vue **Cours libres** conserve le parcours historique. Un enfant scolarisé dans les cours officiels peut apparaître sans inscription V1.

Chaque résultat présente l’enfant, l’établissement, la classe, l’année scolaire, la matière, le cours, l’évaluation, sa note, son barème et sa date de publication. Le détail reste dans l’espace Parent et ajoute uniquement l’appréciation globale publiée. Il affiche le texte tel quel, sans interpréter du HTML.

La sélection d’un enfant et « Tous mes enfants » sont conservées au retour du détail. La liste propose recherche, type d’évaluation et pagination. Les états distinguent absence de lien familial, absence de résultat publié, résultat indisponible, chargement et erreur. Une erreur du volet officiel laisse la vue Cours libres accessible.

Cette branche dépend de B.4 / PR #29, elle-même dépendante de B.3 / PR #28 et B.2 / PR #27. Ces branches étant encore en brouillon lors de la préparation, la comparaison avec `main` contient aussi leurs changements. La revue propre à C.1 doit comparer le commit de base ci-dessus à la tête de cette branche. La PR C.1 ne doit pas être fusionnée indépendamment de ces dépendances.

## 2. Limite de l’autorisation actuelle

La validation G1 autorise le code, les tests isolés, la branche et la PR brouillon. **Le SQL C.1 n’est pas installé sur Supabase principal.** Aucun compte, lien familial, résultat, note ou notification réels n’a été créé ou modifié pour ces tests.

L’installation SQL principale, le choix et le rattachement éventuel d’un parent réel de recette, la fusion dans `main` et la publication Vercel demandent leurs validations distinctes prévues au cadrage. Le compte élève de recette B.4 n’avait aucun `parent_links` lors de l’audit ; les tests positifs C.1 utilisent donc des familles fictives isolées.

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

## 6. Préflight, installation proposée et retour arrière

| Fichier dans `supabase/` | Usage |
|---|---|
| `verification/s4b3c1_parent_official_results_preflight_readonly.sql` | Vérifier les prérequis, l’absence des nouvelles fonctions et les versions/ACL historiques en transaction `READ ONLY`. |
| `proposals/s4b3c1_parent_official_results.sql` | Proposition atomique : créer cinq fonctions de lecture et protéger les trois anciennes RPC. |
| `verification/s4b3c1_parent_official_results_rollback_manual.sql` | Retirer les cinq nouvelles fonctions, conserver les protections V1. |
| `verification/s4b3c1_legacy_parent_rpcs_restore_original_manual.sql` | Restauration historique exceptionnelle et séparée, réouvrant l’ancien chemin insuffisamment cloisonné. |

Le préflight a été exécuté en lecture seule sur `schoolnet_2.0` le 24 novembre 2026 et a retourné `S4B3C1_PREFLIGHT_READONLY_PASS`. Il faudra le relancer juste avant toute installation autorisée.

Après un GO distinct, l’installation devra utiliser le fichier exact du commit approuvé, dans une transaction atomique, avec arrêt à la première erreur. Le marqueur attendu est `S4B3C1_PARENT_OFFICIAL_RESULTS_PASS`. Aucun schéma de données ni aucune donnée familiale n’est modifié par la proposition ; elle change des fonctions et leurs permissions.

Le rollback normal attend `S4B3C1_PARENT_OFFICIAL_RESULTS_ROLLBACK_PASS`. Il ne doit jamais entraîner automatiquement la restauration des anciennes RPC non protégées.

La restauration exceptionnelle exige les API C.1 déjà retirées, les empreintes protégées exactes et le paramètre transactionnel explicite `schoolnet.c1_allow_legacy_restore='yes'`. Son marqueur est `S4B3C1_LEGACY_PARENT_RPCS_RESTORE_PASS`. Son existence dans le dépôt n’autorise pas son exécution sur la base principale.

## 7. Vérifications et preuves reproductibles

La commande `npm run qa:s4b3c1` vérifie le contrat strict, les dates/notes, les associations d’enfants, les données interdites, les routes et les bornes Unicode. La suite parent V1 reste couverte par `scripts/test-schoolnet-lot5c-parent-children.mjs`.

Les 209 tests Node de C.1 et des régressions sélectionnées ont passé localement lors de la préparation. `npm run lint` passe sans erreur, avec quatre avertissements préexistants hors du lot. `npm run build` passe, avec l’avertissement de taille du bundle déjà présent.

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

## 8. Prochaine recette, après validation de l’installation

La prochaine étape est le GO ciblé pour le SQL C.1, puis le choix explicite du parent de test. Si un lien doit être créé pour cette recette, son parent et son enfant doivent être identifiés et autorisés séparément.

Pour récupérer le code dans le checkout Windows de test, conserver d’abord les modifications locales éventuelles, puis créer une branche locale dédiée suivant la branche distante C.1. Ne pas écraser la branche locale B.4. Relancer le serveur Vite après changement de branche.

La recette utilisateur devra vérifier la note publiée de l’enfant autorisé, son contexte scolaire, l’appréciation, le retour vers l’enfant choisi et la vue Cours libres. Un second compte ou enfant réellement autorisé sera nécessaire pour une recette familiale réelle plus large ; les tests fictifs ne doivent pas être présentés comme cette preuve.

La supervision administrative, les bulletins, les moyennes trimestrielles, les fichiers, les corrections détaillées et les notifications parent restent hors de C.1.
