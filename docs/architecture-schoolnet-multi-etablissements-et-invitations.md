# SCHOOLNET 2.0 — Administration multi-établissements et accès assistés

**Date de cadrage et développement initial :** 10 novembre 2026  
**Branche :** `feature/schoolnet-multi-etablissements` (créée depuis `feature/schoolnet-notifications`, PR #5 toujours en brouillon)  
**État :** fondation SQL + écran central préparés ; tests SQL réversibles, ESLint et compilation **réussis** ; Preview Vercel construite (statut GitHub de déploiement réussi). Migration SQL **non appliquée**. Comptes scolaires locaux et invitations **non activés**. Pas de fusion `main`, pas de déploiement de production.

## Décision métier validée

SCHOOLNET conserve trois publics :
1. **Apprenants libres**, pris en charge directement par SCHOOLNET et répartis en groupes pédagogiques.
2. **Établissements**, chacun ayant son administration et ses classes scolaires, distinctes des groupes pédagogiques libres.
3. **Cours à domicile**, pouvant compléter l'apprentissage libre ou la scolarité dans un établissement.

Un apprenant conserve un **compte unique** même s'il suit plusieurs offres. Les liens parent-enfant restent vérifiés et ne sont jamais déduits uniquement des noms.

## Hiérarchie et séparation de responsabilités

- **Super Administrateur SCHOOLNET :** correspond au `profiles.role = 'admin'` déjà existant. Il supervise les établissements et les parcours centraux.
- **Administrateur local :** nouveau `profiles.role = 'school_admin'` ; une appartenance active `schoolnet_school_memberships` à un établissement actif est requise pour qu'il soit reconnu localement.
- **Enseignant / Apprenant / Parent :** rôles historiques inchangés. Les appartenances à l'établissement sont des affectations distinctes des liens familiaux.
- **Aucun administrateur local ne doit recevoir le rôle global `admin`**.

Important : les anciens modules administratifs utilisent `public.is_admin()` et ne distinguent **pas encore** les établissements. La première migration introduit seulement les institutions et leurs appartenances, **sans accorder d'accès aux classes, bulletins, évaluations, documents, messagerie ou comptes d'autrui**. Avant de donner accès à un `school_admin`, chaque flux sensible devra être audité et isolé par établissement (RLS, SQL, Edge Functions et écran).

## Livrables de la phase 1

| Fichier | Fonction |
|---|---|
| `supabase/migrations/20261110103500_schoolnet_schools_security_foundation.sql` | Nouveau rôle non global, tables établissements, appartenances et audit, policies RLS, RPC centralisées |
| `src/features/schools/lib/schoolManagementApi.ts` | API de lecture et création sécurisée |
| `src/features/admin/pages/AdminSchools.tsx` | Gestion centrale depuis la navigation Admin, blocage affiché tant que SQL absent |
| `src/routes/router.tsx`, `src/layouts/DashboardLayout.tsx` | Route centrale `/app/admin/schools`, réservée au rôle global `admin` |
| `supabase/verification/20261110_multi_school_foundation_readonly.sql` | Audit non mutatif de la future activation |

### Sécurité de la fondation

- `schoolnet_schools`, `schoolnet_school_memberships` et `schoolnet_school_audit` ont le RLS actif.
- Aucun droit d'INSERT/UPDATE/DELETE sur ces tables n'est accordé aux clients `anon` et `authenticated`.
- La fonction `schoolnet_admin_create_school` exige un JWT utilisateur `admin` existant et historise la création.
- La fonction `schoolnet_admin_assign_school_admin` exige également le super-administrateur et vérifie que le profil cible possède vraiment le rôle `school_admin`. Elle refuse les rôles incompatibles et les affectations contradictoires.
- Les membres ne peuvent lire que leur appartenance ; seul un administrateur local habilité peut accéder à la liste d'appartenance à **son** établissement.
- L'ajout d'une école ne crée aucun compte, classe, dossier ni lien familial.
- Les fonctions privilégiées disposent d'un `search_path` fixé et les droits d'exécution anonymes sont révoqués.

### Tests exécutés — tous en transaction avec `ROLLBACK`

- Création structurelle de trois tables, trois policies, fonctions et trigger : **OK**.
- Création fictive de deux établissements par l'admin global : **OK**.
- Journal d'audit des deux créations : **OK**.
- Création d'un établissement avec un code déjà utilisé : **refusée**.
- Affectation du rôle local à un compte Enseignant : **refusée**.
- Tentative de lecture d'établissements non attribués par un Apprenant : **aucune donnée retournée**.
- Tentative d'utiliser les RPC de création/affectation par un Apprenant : **refusée**.
- Après annulation : les **30 migrations** et le rôle enum restent inchangés, aucune nouvelle table persistante.

### Tests restant obligatoires avant autorisation et activation

1. **Lint et compilation GitHub : réussis.** Recette navigateur de l'écran à 412 px, tablette et ordinateur encore à effectuer.
2. Création d'un compte `school_admin` sans mot de passe communiqué en clair, activation réelle par lien unique.
3. Lecture d'une école par son admin et refus d'accès à une autre école, par les trois autres rôles, et après révocation.
4. Revue approfondie des RLS de **toutes** les tables historiques avant ouverture d'un espace de gestion scolaire à un administrateur local.
5. Tests de robustesse en cas d'échec entre Supabase Auth et PostgreSQL (pas de faux compte actif ni de double invitation).

## Phase 2 — Comptes et invitations assistées (à développer)

Parcours recommandé : le Super Administrateur valide l'école et le responsable → SCHOOLNET identifie ou prépare le compte `school_admin` → associe le compte à l'établissement dans un traitement serveur contrôlé → prépare un lien d'activation temporaire via Supabase Admin `generateLink()` **sans envoi SMTP** → ouvre un brouillon d'e-mail pré-rempli ou copie une invitation → l'administrateur l'envoie depuis sa messagerie → le destinataire choisit son mot de passe.

Aucun mot de passe ni jeton d'activation ne doit être conservé en clair dans les données ou logs. Les liens restent temporaires ; chaque nouvelle génération rend invalide l'ancien selon la politique de Supabase Auth. Les statuts « préparé », « envoi déclaré » et « activé » doivent être distingués : sans connecteur e-mail, l'application ne peut pas prouver l'envoi/l'arrivée du message.

**Attention :** `auth.admin.generateLink()` nécessite un secret service côté serveur. Il ne doit jamais être exécuté depuis le navigateur. Une opération Auth et une écriture SQL ne constituent pas une transaction unique ; prévoir idempotence, journal d'audit et reprise/compensation.

## Phase 3 — Multi-tenant métier et parcours d'apprentissage

- Ajouter le rattachement scolaire à l'organisation et contrôler chaque accès en SQL/RLS.
- Séparer les **classes officielles des établissements** des **groupes pédagogiques des apprenants libres**.
- Gérer les cours à domicile avec affectations et séances distinctes.
- Réutiliser les modules existants (cours, classes, résultats, documents) sans copier les comptes et sans révéler les données d'autres établissements.
- Reprendre ensuite le Lot 5.D (réinscriptions) puis les Lots 6, 7 et 8 selon le workflow.

## Restrictions maintenues

Ne pas appliquer `supabase db push --remote` global : les migrations `20261110090000_school_year_rollover_controlled.sql` et `20261109140104_harden_assessment_legacy_rpcs.sql` restent en attente. La migration multi-établissements exige une autorisation séparée. `main` et Vercel production ne doivent pas être modifiés sans validation.

### État de la revue GitHub

- **PR #6** ouverte en brouillon, base `feature/schoolnet-notifications`, non fusionnée : https://github.com/ramon77777/schoolnet/pull/6.
- **GitHub Actions lint/build : réussi** (exécution `42801891531`).
- **Statut Vercel : success** sur le commit testé de la branche. L'accès direct à la Preview devra être confirmé avant recette navigateur.
- **Après ROLLBACK :** 30 migrations, 4 demandes publiques, 2 inscriptions, 1 Super Administrateur historique ; aucun objet nouveau persistant.
