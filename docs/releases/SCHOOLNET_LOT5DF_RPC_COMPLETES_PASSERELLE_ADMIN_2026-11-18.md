# SCHOOLNET — Lot 5D-F | Compatibilité des RPC historiques complètes et architecture Admin

**Date :** 18 novembre 2026  
**Statut :** GitHub Actions PostgreSQL 17 **5/5 jobs SUCCESS** ; recette locale F **12/12 VALIDÉE par l'utilisateur le 18/11/2026**  
**Branche :** `feature/schoolnet-lot5d-a-securisation-20261118`  
**PR :** [#15](https://github.com/ramon77777/schoolnet/pull/15), **brouillon, à ne pas fusionner**.  
**Production :** aucun SQL exécuté en écriture dans Supabase principal ; `main` et Vercel production inchangés.

## 1. Périmètre et méthode

Le 18/11/2026, les définitions **effectivement installées** sur Supabase principal
`schoolnet_2.0` ont été examinées **avec SELECT/pg_get_functiondef uniquement**.
La vérification porte sur les noms et le code des fonctions, non sur des fiches personnelles.
Aucun compte, inscription, année ou bulletin réel n'a été modifié.

Cinq RPC `SECURITY DEFINER` du périmètre inscriptions ont été reprises **intégralement**
dans la proposition de simulation :

| Fonction | Comportement réel préservé | Pourquoi verrouiller |
| --- | --- | --- |
| `admin_upsert_student_enrollment` | Vérifie Admin, profil élève et classe, crée ou met à jour un dossier annuel ; conserve son numéro et sa date si déjà créé ; synchronise les liens `class_students` et `profiles.class_name` pour l'année courante ; retourne le reçu détaillé. | Lisait `is_current` **avant** les écritures ; une bascule pouvait rendre le statut lu obsolète. |
| `admin_set_student_enrollment_status` | Met à jour le statut et éventuellement la note ; synchronise les liens et le profil ; refuse la réactivation d'une année non courante. | Verrouillait `student_enrollments FOR UPDATE` **avant** la lecture de l'année. |
| `admin_upsert_student_enrollment_with_gender` | Valide `male/female`, appelle l'upsert central puis actualise `profiles.gender` en une transaction. | L'opération complète doit partager le verrou annuel ; un échec annule aussi l'écriture du genre. |
| `admin_assign_student_to_class` | Relit le type d'admission, l'ancien établissement et la note, puis appelle l'upsert central. | Lisait l'année et le dossier **avant** d'appeler l'upsert : sécuriser seulement ce dernier était insuffisant. |
| `admin_remove_student_from_class` | Supprime le lien de classe, conserve le dossier sous statut `withdrawn`, recalcule `profiles.class_name` pour l'année courante. | Manipule directement les anciennes affectations et leur statut. |

Cette revue a aussi confirmé deux chemins **distincts** qui restent à examiner :
`admin_set_current_school_year` peut encore basculer directement l'année
**tant que le garde 5D n'est pas installé** ;
`admin_finalize_public_enrollment_request` vérifie un dossier existant pour
créer une résolution et un lien familial, mais ne crée pas lui-même de dossier
annuel. La lecture et la cohérence de ce dernier circuit doivent être testées
en parallèle d'un changement d'année. Les écritures directes autorisées par les
RLS historiques nécessitent une politique de fermeture séparée.

## 2. Candidat SQL : complet, mais réservé à la fixture

[Proposition complète 5D-F](../../supabase/proposals/20261118_schoolnet_lot5df_legacy_full_lock_SANDBOX_ONLY.sql)

Elle provient des cinq définitions complètes `pg_get_functiondef` du 18/11.
Les **seules modifications** apportées à leur code métier sont :

1. `SET search_path TO 'pg_catalog'`, en conservant les références explicites
   `public.*` et `auth.*` (à revérifier sur un schéma réellement fidèle) ;
2. `LOCK TABLE public.school_years IN SHARE MODE` juste après le contrôle Admin,
   **avant la première lecture métier**, y compris dans les wrappers.

La fonction de finalisation 5D-A+B, dans sa **proposition distincte non installée**,
utilise un verrou `SHARE ROW EXCLUSIVE` sur cette table. Le verrou `SHARE`
du parcours historique est incompatible avec lui : l'année ne peut pas changer
pendant que la fonction d'inscription calcule ses écritures.

La proposition 5D-F vérifie **en SQL** que la base courante s'appelle exactement
`schoolnet_lot5d_ci`, que PostgreSQL est en version 17 ou ultérieure et
que la structure fictive 5D est chargée. Elle ne se trouve **pas** dans
`supabase/migrations`. Aucun `GRANT` de la fonction privée, aucune clé,
aucune modification des rôles ou du vrai schéma n'est fournie.

**Ce fichier n'est PAS une migration installable sur le projet principal.**
Une éventuelle migration finale exigera un candidat consolidé
5D-A+B+D+E+F, de nouveaux examens de sécurité et un accord distinct.

## 3. Tests et preuves

[GitHub Actions #44336667446](https://github.com/ramon77777/schoolnet/actions/runs/44336667446)
: **5 jobs sur 5 SUCCESS**, commit de test `8448ebf`.

| Job | Résultat et portée |
| --- | --- |
| Qualité, Node/TypeScript/Vite et Edge checks | **SUCCESS** ; `npm run qa:lot5d:f` **12/12 assertions statiques** et lots précédents vérifiés. |
| PostgreSQL 17 A+B/D | **SUCCESS** : tests de l'existant en sandbox. |
| PostgreSQL 17 E | **SUCCESS** : ancienne simulation abrégée, 11 assertions d'archives. |
| PostgreSQL 17 F — **upsert complet** | **SUCCESS** : 12 assertions SQL avant bascule sous `ROLLBACK`, deux sessions concurrentes (timeout attendu), 13 assertions après bascule sous `ROLLBACK`. |
| PostgreSQL 17 F — **statut complet** | **SUCCESS** : deuxième base éphémère distincte, deux sessions concurrentes (timeout attendu), 13 assertions SQL après bascule sous `ROLLBACK`. |

Dans les deux scénarios F, la finalisation termine **une seule fois**, puis
le client concurrent reçoit un **lock timeout** avant toute lecture métier
de la fonction protégée. Les essais après clôture rejettent affectation,
retrait, modification du statut et wrapper du genre sur l'ancienne année.
La cible courante accepte toujours les inscriptions, le retrait/rattachement
et le retour à l'état actif dans les transactions de test.

Les snapshots fictifs vérifient la conservation des anciennes
`class_students`, des liens `parent_links`, des `profiles.child_ids`,
des bulletins et des documents. **Cela ne prouve pas l'intégrité d'une
base de production : les tables fictives restent simplifiées.**

**Recettes locales déjà confirmées par l'utilisateur :** Lots A à E =
**73/73**. **Lot F : 12/12 tests hors réseau validés en local**,
séparément des scénarios SQL exécutés dans GitHub Actions.

## 4. Passerelle Admin réelle : architecture proposée (PAS implémentée)

Le frontal SCHOOLNET est une application **React/Vite** hébergée sur
le **Vercel existant**. La logique métier de 5D devra s'exécuter dans une
fonction serveur privée, **jamais dans le bundle Vite**, et **jamais par un
appel direct `supabase.rpc(...)` vers la fonction SQL privée**.

```text
SCHOOLNET React (Super Admin connecté)
  └─ POST action Admin ; Authorization: Bearer <session valide>
       ↓
Passerelle Admin privée (hébergement à valider, non créée)
  1. Refuser si opération non explicitement activée côté serveur
  2. Vérifier origine de production EXACTE, méthode, type et taille du JSON
  3. Confirmer le JWT auprès de Supabase Auth (getUser / vérification réelle)
  4. Contrôler le compte encore actif ET profiles.role = admin en base
  5. Refuser school_admin, teacher, student, parent et tout acteur fourni en JSON
  6. Refaire le preflight serveur, année cible et décisions complètes
  7. Ouvrir une transaction PG sous un rôle SQL dédié de privilèges minimaux
  8. Fournir l'acteur vérifié en contexte transactionnel (pas le corps client)
  9. Appeler seulement la fonction privée autorisée / journaliser / COMMIT
 10. Retour minimal (statut, operation_id), sans données familiales sensibles
       ↓
PostgreSQL privé schoolnet_private (finaliseur NON INSTALLÉ)
  └─ Verrous année/dossiers, idempotence, historique et rollback atomique
```

### Contrat serveur proposé

- **Hébergement à arbitrer :** fonction Vercel sur le site existant
  (nécessite la vérification du routage `vercel.json`) ou fonction Edge
  sécurisée ; ne pas ouvrir de second site. Aucun endpoint `/api`
  ni fonction Edge de 5D-F n'est créé ici.
- **Identité :** le serveur appelle Auth pour vérifier le jeton et ne se fie
  jamais aux `user_metadata`, au rôle déclaré par le navigateur ou à
  `actorId` transmis dans le JSON. Il relit `profiles.role`
  dans la base et vérifie l'état du compte / de la session.
- **Anti-CSRF et origine :** `POST` uniquement, `application/json` strict,
  limite de taille, allowlist de l'origine officielle exacte,
  aucune écriture depuis localhost ni Preview. CORS ne remplace jamais
  l'authentification. Ajouter des limites de débit.
- **Actions autorisées :** sauvegarder une décision ou finaliser l'année,
  avec schéma JSON strict, années source/cible et confirmation du nom
  exact. L'acteur, le nom de fonction SQL et le rôle ne sont **pas**
  sélectionnables par le navigateur.
- **Idempotence :** un identifiant stable d'opération est attribué
  et vérifié côté serveur ; le double clic et le retry ne doivent pas
  produire deux passages. Toute erreur doit annuler l'ensemble.
- **Connexion :** identité SQL dédiée et secret dans l'hébergement serveur
  seulement (pas `VITE_*`), accès limité au schéma et aux deux fonctions
  privées nécessaires. Aucun `GRANT EXECUTE` de finalisation à
  `anon`, `authenticated` ou `service_role` via la Data API.
  Les permissions et la session doivent être revalidées à chaque action.
- **SQL :** `BEGIN` puis contexte d'identité issu **uniquement du jeton
  vérifié**, et appel de la fonction privée en transaction. Un rôle SQL
  disposant d'une connexion compromise ne doit pas permettre de
  s'attribuer arbitrairement un rôle Admin : concevoir l'authentification
  de bout en bout et vérifier les droits minimaux avant le GO.
- **Réponses :** refuser par défaut, n'exposer ni requête SQL brute,
  ni secret, ni liste d'enfants, ni détail de famille dans les erreurs.

La maquette hors réseau de 5D-E,
`scripts/lot5d/admin_gateway_dryrun.mjs`, reste un **contrat de tests**,
**pas** une implémentation Auth, PostgreSQL ou HTTP.

## 5. Points bloquants avant tout GO réel

1. **Année cible occupée :** l'année 2026–2027 possède déjà un dossier
   actif d'un autre apprenant que celui actif en 2025–2026. C'est un
   **blocage métier**. Aucun nettoyage ni changement automatique n'est
   autorisé ; décision d'un responsable habilité nécessaire.
2. **Compatibilité schéma :** reconstruire le banc de tests depuis les
   migrations **réellement installées**, y compris déclencheurs,
   contraintes, `profiles`, RLS et documents ; comparer avec un export
   de structure non personnelle et faire des transactions `ROLLBACK`.
3. **Contournements :** la RPC directe
   `admin_set_current_school_year` demeure accessible côté serveur
   jusqu'à la consolidation finale ; certaines opérations directes RLS
   sur `student_enrollments` / `class_students` ou d'autres RPC
   devront également être bridées **sans interrompre le fonctionnement
   des inscriptions existantes**.
4. **Relations et écrans :** les pages Parent déduisent actuellement
   une **dernière classe connue** de `class_students.created_at`.
   Elle n'est **pas nécessairement la classe de l'année active**.
   Concevoir une lecture sur les dossiers annuels validés, sans supprimer
   l'historique ni les liens de famille. Recette Enseignant à réaliser.
5. **Demande publique :** vérifier la concurrence et la cohérence de
   `admin_finalize_public_enrollment_request` avec une clôture annuelle
   (elle relie une demande à un dossier existant).
6. **Passerelle :** choisir l'hébergement, le rôle SQL dédié, la
   vérification de session Auth et le rate-limit ; effectuer une recette
   en sandbox fidèle. Aucune clé de connexion réelle fournie ni déployée.
7. **Migration / release :** revue de sécurité, sauvegarde validée,
   migration canonique unique puis **GO séparés** pour installation
   Supabase principal, PR `main` et production Vercel.

**À ce stade : ni les protections F, ni le finaliseur, ni la passerelle
Admin réelle ne sont installés ou disponibles en production.**

## 6. Recette locale du Lot 5D-F — **VALIDÉE**

Le 18 novembre 2026, l'utilisateur a transmis la sortie complète du
terminal PowerShell dans `D:\Bakary\10 autres\schoolnet`, branche
`feature/schoolnet-lot5d-a-securisation-20261118` :

- `git pull --ff-only` **réussi** (`4920c68..f3ec13f`), sans conflit.
- `npm run qa:lot5d:f` : **12/12 tests réussis, 0 échec**.
- `npm run lint` : **0 erreur**, 1 avertissement connu
  `react-hooks/exhaustive-deps` dans
  `src/features/enrollments/pages/EnrollmentRecordsPage.tsx:161`.
- `npm run build` : **succès**, Vite v7.3.1, 867 modules transformés.
  Browserslist obsolète et gros bundle signalés sans bloquer le build.
- L'état Git est inchangé pour les fichiers locaux préexistants :
  `tsconfig.app.tsbuildinfo` modifié, les trois scripts
  `schoolnet-student-auth-*-local.mjs` et
  `test-schoolnet-student-auth-flow-mock.mjs` ainsi que
  `supabase/proposals/staged/` **conservés**.

**Total des recettes locales A+B+C+D+E+F : 85/85 tests validés.**
Ne pas compter les assertions SQL PostgreSQL 17 CI une deuxième fois
dans ce total.

**Portée de la validation :** exécution locale des tests de contrat,
lint et build, ainsi que CI PostgreSQL fictive validée auparavant.
**Aucun backend Admin authentifié n'est déployé**, les cinq RPC
historiques réelles de Supabase principal restent inchangées et le
dossier déjà actif dans l'année cible interdit encore toute bascule.
La migration finale nécessite une revue sur schéma fidèle, une
qualification métier et de **nouveaux accords spécifiques**.

**Interdictions maintenues :** aucune écriture dans Supabase principal,
aucun `supabase db push`, aucune activation du flag de passage annuel,
aucune fusion dans `main` ni publication Vercel.
