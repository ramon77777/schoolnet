# SCHOOLNET V2 — S4-D.3j · Architecture technique sécurisée du futur workflow de bulletins

**27 novembre 2026 · Spécification technique proposée, non déployée · PR brouillon.**

**Décision produit déjà adoptée :** D1=A à D7=A, 7/7, voir `docs/governance/SCHOOLNET_S4D3I_BUSINESS_DECISIONS_2026-11-27.md`. **État technique :** 0 autorisation effective, 0 table/SQL nouvellement installé, 0 validation ou publication réelle. L'accord produit n'est **pas** un GO Supabase, `main` ni Vercel.

## 1. Inventaire de l'existant et principe anti-collision

Des migrations **V1** existent déjà, notamment :
- `supabase/migrations/20261103120000_create_report_cards_core.sql` : `public.report_cards`, `public.report_card_subjects` ;
- `supabase/migrations/20261103150000_report_card_admin_workflow.sql` : RPC historiques de contrôle et de publication V1.

**Ne jamais réutiliser ni appeler** `public.publish_admin_report_card`, `public.update_admin_report_card_review`, ni modifier `public.report_cards` pour activer le circuit scolaire V2. Les privilèges historiques de V1 ne constituent pas des autorisations V2. Prévoir un audit séparé de V1 avant toute mise en production du module consolidé.

Sources V2 préparées, **non installées sur l'instance principale** :
- `supabase/proposals/s4c3c3_official_curriculum_and_general_average_kernel.sql` : programmes approuvés et noyau numérique ;
- `supabase/proposals/s4c3c3_school_admin_official_general_averages_rpc.sql` : vérification d'école / classe / période et projections ;
- `supabase/proposals/s4d3b_school_report_card_authorized_preview.sql` : projection individuelle, même noyau C3-C3, aucune note brute V1.
- `src/features/official-documents/lib/schoolAuthorizedReportCardModel.ts` : validation stricte du contrat de prévisualisation.

**Dépendance bloquante :** il faudra installer et vérifier C3-C3 et S4-D.3b dans une **base jetable** avec de vrais JWT de test et vérifier le contenu serveur exact avant de concevoir le stockage immuable. Aucun snapshot ne doit être calculé ou signé dans le navigateur.

## 2. Schéma cible prévisionnel — toutes les tables dans `schoolnet_private`

Ceci est un **dictionnaire de conception**, pas un script SQL/migration. Types, CHECK, FK, index et unicités seront écrits puis vérifiés sur PostgreSQL jetable dans un sous-lot ultérieur.

| Objet futur | Colonnes principales à prévoir | Invariants |
|---|---|---|
| `school_bulletin_v2_policy_versions` | `id, school_id, learning_context, policy_revision, required_fields, approved_by, approved_at, effective_from, effective_to` | Politique effective validée par établissement/cycle ; sans politique scolaire complète, aucun bulletin réel |
| `school_bulletin_v2_grants` | `id, school_id, user_id, capability, school_year_id?, class_id?, period_id?, valid_from, valid_until, revoked_at, granted_by, mandate_evidence_ref` | Habilitation nominative, par action, école et portée, mandat vérifié, temps serveur et révocation ; jamais d'auto-délégation |
| `school_bulletin_v2_snapshots` | `id, school_id, school_year_id, class_id, period_id, student_id, curriculum_revision, policy_version_id, projection_schema_version, source_digest, canonical_payload, captured_at` | Version immuable et scellée par le serveur : cohérence du programme, des notes publiées, des évaluations et de la politique ; pas de référence au V1 |
| `school_bulletin_v2_cases` | `id, snapshot_id, school_id, school_year_id, class_id, period_id, student_id, state, requester_id, approver_id?, publication_authorizer_id?, row_version, created_at, updated_at` | État courant lié à **un seul snapshot** ; version concurrente obligatoire, pas de diffusion par changement de statut client |
| `school_bulletin_v2_events` | `id, case_id, snapshot_id, school_id, actor_id, capability_grant_id, event_name, from_state, to_state, reason?, expected_version, resulting_version, idempotency_key, created_at, previous_event_id?, snapshot_digest` | Historique append-only ; `UNIQUE(case_id, idempotency_key)` ; horodatage serveur ; auteur et version liés ; motif pour refus/correction/retrait |
| `school_bulletin_v2_publications` | `id, case_id, snapshot_id, school_id, artifact_ref, artifact_digest, published_at, published_by, withdrawn_at?, withdrawal_event_id?` | Un artefact **privé**, versionné et contrôlé ; aucune URL publique permanente ; accès familial après événement de publication effective uniquement |

### Contraintes relationnelles indispensables

- Une **FK sur id seul** ne prouve pas l'isolation multitenant : prévoir des FK composites ou vérifications transactionnelles `(school_id, id)` pour snapshots, dossiers, événements et publications, avec `UNIQUE(school_id,id)` lorsque nécessaire.
- Les références de classe/année/période/élève et leur appartenance à l'établissement doivent être vérifiées au serveur : une FK isolée vers un élève ne valide pas son inscription dans une classe.
- Cohérence des états, non-nullité et plages horaires via `CHECK` ; `row_version > 0` ; index sur `(school_id, school_year_id, class_id, period_id, student_id)` et sur `(case_id,created_at)`.
- Empêcher les doublons de versions et **une seconde publication active** d'un même élève/période, en décidant les règles d'unicité partielle après modélisation des corrections.
- `snapshots` et `events` interdits en UPDATE/DELETE aux clients ; toute rectification crée une **nouvelle version**, jamais une mutation silencieuse. Ne pas confondre une chaîne de hachage avec une garantie autonome d'immutabilité : contrôler aussi les permissions et les sauvegardes.
- Éviter les notes et les pièces personnelles dans `events` ou les logs génériques ; les données de `canonical_payload` restent sensibles et soumises à la politique de rétention applicable.

## 3. Contractualisation des capacités et identité

**Rôles applicatifs existants** : `school_admin`, `admin`, `teacher`, `parent`, `student`. Ils ne deviennent pas des permissions de signature.

| Transition future | Capability explicite requise | État initial | État futur | Condition critique |
|---|---|---|---|---|
| `review_submitted` | `submit` | draft | submitted | Admin de l'établissement autorisé, programme et résultats complets, version figée |
| `correction_requested` | `decide` | submitted | correction_requested | Décideur distinct du demandeur ; motif obligatoire |
| `approval_refused` | `decide` | submitted | refused | Décideur distinct ; motif obligatoire |
| `approval_granted` | `decide` | submitted | approved | Décideur distinct, snapshot intact |
| `publication_authorized` | `authorize_publication` | approved | authorized_for_publication | Droit de diffusion distinct, approbation préalable |
| `publication_executed` | `execute_publication` | authorized_for_publication | published | Autorisation et nouvelle vérification avant diffusion ; artefact versionné |
| `publication_revoked` | `withdraw` | published | withdrawn | Motif, traçabilité, accès en ligne révoqués |

**D3=A adopté :** l'approbateur et le diffuseur **peuvent être la même personne** si chaque capability a été **accordée séparément** ; le demandeur et l'approbateur sont des comptes **différents**. L'administration `admin` de plateforme n'obtient pas de dérogation. Une petite école sans deuxième responsable habilité **reste bloquée** jusqu'à une délégation valide.

La proposition `publication_executed` (S4-D.3h) n'est **pas** une fonction déjà installée. Retours de correction et reprises après refus entraînent un **nouveau cas et/ou une nouvelle version**, selon le contrat définitif à tester ; ne pas ajouter de transition automatique qui contournerait les vérifications.

### Autorisations serveur requises à **chaque** action

1. Déduire l'identité **du contexte authentifié serveur** (`auth.uid()`) ; jamais accepter `actorId`, rôle ou `service_role` du navigateur.
2. Vérifier `profiles.role = school_admin`, `schoolnet_school_memberships` actif/non révoqué, statut de l'école et habilitation explicite, datée, correspondant au périmètre et à la capability.
3. Contrôler les cinq identifiants de portée et leurs appartenances (école/année/classe/période/élève). **Rejeter les doublons et les transferts actifs ambigus**.
4. Comparer la version attendue à `row_version` sous verrou de ligne `FOR UPDATE`, puis vérifier `UNIQUE(case_id,idempotency_key)` dans **la même transaction**. Pour une répétition légitime identique, renvoyer le résultat déjà enregistré sans doublonner les événements ; refuser le réemploi de la clé pour une autre action.
5. Reconstituer et comparer **côté serveur** l'empreinte de source à celle du snapshot **avant toute publication**, y compris en présence de changement de notes/coefficient ou politique scolaire. **Retrait** toujours possible par responsable habilité même si le bulletin source a changé ou que l'élève a été transféré ; ne pas permettre une diffusion supplémentaire d'une version obsolète.
6. Pour correction, refus et retrait, imposer un **motif** raisonnablement borné ; horodater côté serveur et ajouter un événement immuable. Lier `approved`, `authorized_for_publication` et `published` à trois événements distincts.
7. Publication : transaction confirmée + création/visibilité d'un artefact privé contrôlé, avec stratégie d'idempotence de génération de fichier et d'annulation si stockage externe indisponible. Un échec de génération ne doit **jamais** produire `published`.

## 4. API proposée — uniquement noms de contrat, aucune RPC créée

- `public.schoolnet_bulletin_v2_open_case(p_school_id,p_period_id,p_class_id,p_student_id,p_idempotency_key)` : résolution serveur de l'année, calcul contrôlé V2, contrôle des mentions du cycle, création de l'instantané si éligible.
- `public.schoolnet_bulletin_v2_transition(p_case_id,p_event,p_expected_version,p_idempotency_key,p_reason)` : lecture transactionnelle du cas, identité depuis JWT, vérifications capability, états, concurrence, source immuable ; mise à jour du cas **et** ajout d'événement dans une seule transaction.
- `public.schoolnet_bulletin_v2_published_for_me(p_case_id)` : vue limitée aux bulletins **effectivement publiés**, avec vérification côté serveur de l'élève ou du lien parent/enfant actif ; vérification précise du mécanisme familial existant requise avant codage.

Pour les procédures sensibles, le schéma privé `schoolnet_private` reste non exposé ; ne pas accorder `SELECT/INSERT/UPDATE/DELETE` sur les tables aux rôles `anon` ou `authenticated`. Activer RLS sur les objets comme défense supplémentaire, y compris en schéma privé. Les wrappers RPC publics doivent limiter `EXECUTE` aux rôles requis après `REVOKE ... FROM PUBLIC` et appeler des routines privées auditées ; toute routine `SECURITY DEFINER` justifiée doit utiliser un `search_path` fixé, des références qualifiées et des contrôles `auth.uid()` et d'affiliation **à l'intérieur**. Éviter tout contournement RLS justifié uniquement par « ça marche ».

La [documentation Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), les [functions](https://supabase.com/docs/guides/database/functions) et la [sécurisation Data API](https://supabase.com/docs/guides/api/securing-your-api) distinguent notamment **GRANT** et **RLS**. Depuis le changement annoncé pour octobre 2026, **ne jamais supposer qu'une nouvelle table publique est automatiquement exposée** : définir explicitement ses grants. Nous ne créons toutefois aucune table dans S4-D.3j.

## 5. Risques et tests nécessaires pour le futur backend effectif

| Risque | Exigence de preuve sur Supabase jetable avant tout GO SQL principal |
|---|---|
| BOLA/IDOR multi-établissements | vrais JWT A et B, élève étranger / transfert / classe hors école, 403 sans fuite de notes |
| Autorisation forgée | rôle dans métadonnées client, profil `admin`, enseignant, usurpation `actorId` : refus |
| Auto-approbation | acteur demandeur = acteur décideur : refus sans événement |
| Escalade de capability | droit `decide` sans `authorize_publication` ou `execute_publication` : refus de diffusion |
| Expiration/révocation des délégations | retrait entre lecture et action, réauthentification et refus |
| Notes absentes vs zéro | zéro publié accepté comme nombre, note `NULL` incomplète : soumission bloquée |
| Version modifiée | notes, coefficients ou politique scolaire changés : blocage avant approbation/diffusion |
| Replays et concurrence | double clic, identifiant idempotent, deux décisions simultanées, rollback : **un événement final maximum** |
| Publication partielle | panne Storage/transaction, PDF non créé, URL non contrôlée : statut non publié |
| Accès famille | parent inconnu, ancien tuteur, enfant d'une autre école, bulletin retiré : refus |
| Audit et intégrité | événements immuables, auteur depuis JWT, motif/horodatage, aucune suppression par navigateur |

### Travaux réellement exécutés dans S4-D.3j

Le fichier `tests/s4d3j/approval-contract-simulator.ts` est un **simulateur purement local**, sans connexions réseau, SQL, Supabase ou UI. Les tests `npm run qa:s4d3j` vérifient les conditions de transition **sur des données artificielles**. Même un test vert **ne prouve pas** la sécurité d'un backend non créé. Les tests avec PostgreSQL et JWT GoTrue/HTTP restent une **porte future distincte**.

Aucun nouveau code d'interface ni de règles de calcul des notes. Aucun nouveau fichier dans `supabase/migrations` et aucun SQL exécutable sur Supabase principal.

## 6. Portes de livraison et prochaine décision

- **S4-D.3j** : document d'architecture, simulateur isolé, tests/CI, PR brouillon ; aucune recette écran nécessaire puisque l'interface ne change pas.
- **Étape suivante envisageable** : validation de cette architecture, puis autorisation **spécifique** d'un prototype SQL sur une base **jetable**, avec prévol, tests JWT, RLS, transactions et restauration. **Aucun script de migration principal** n'est autorisé à ce stade.
- Garder PR empilée #70 → #69 → #68 → #67 → #66 → #65 → #64 → #63 non fusionnée, avec Vercel Preview désactivé. La fusion `main` déclencherait Vercel : ne pas l'exécuter sans GO utilisateur explicite et vérification des dépendances cumulées.

**Validation produit ≠ sécurité serveur vérifiée ≠ adoption scolaire ≠ autorisation de publication.**
