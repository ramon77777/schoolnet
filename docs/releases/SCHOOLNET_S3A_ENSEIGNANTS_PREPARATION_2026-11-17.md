# SCHOOLNET 2.0 — S3-A | Gestion des enseignants par établissement

## ACTUALISATION OFFICIELLE — S3-A INSTALLEE LE 17/11/2026

Cette section est l'etat courant et remplace toute mention historique de
« S3-A NON installee » dans les notes de preparation situees ci-dessous.

- **Migration installee sur Supabase principal :**
  `20261117155641_schoolnet_s3a_school_teachers_roster_and_memberships`,
  enregistree **une seule fois** dans l'historique Supabase.
- **Migration canonique sur GitHub :**
  `supabase/migrations/20261117155641_schoolnet_s3a_school_teachers_roster_and_memberships.sql`.
  Le fichier reflete la proposition appliquee; ne pas le rejouer.
- **Resultat :** 3 facades RPC publiques `SECURITY INVOKER` et 3 fonctions
  privees `SECURITY DEFINER` installees.
- **Privileges :** `anon` ne peut executer aucune des trois RPC ;
  `authenticated` les appelle seulement sous les gardes de role,
  session et ecole; toujours aucun droit INSERT/UPDATE direct de
  `authenticated` sur les affiliations.
- **Recette SQL apres installation :** le script de verification d'origine
  execute dans `BEGIN; ... ROLLBACK;`, avec PASS sur A/B, doublons,
  compte existant eligible, revocation/reactivation, journal d'audit,
  Preview, Origin absente, faux sous-domaine et admin local revoque.
- **Apres recette :** 2 classes historiques conservees, 0 classe
  officielle, 2 ecoles actives, 1 affiliation admin locale,
  **0 affiliation teacher** et 5 evenements d'audit, inchanges.
- **Tests avant installation sur le poste Windows :** `qa:s3a` 8/8,
  lint 0 erreur (un warning historique), TypeScript/Vite OK,
  capture de l'interface avant activation conforme.
- **UI et test automatise mis a jour** pour reflechir le backend actif ;
  nouvelle verification Windows et capture de `/app/school/teachers`
  necessaires avant cloture de la recette locale post-installation.
- **Sauvegarde :** l'archive applicative anterieure a S2-B fournie
  par l'utilisateur existe sur son poste Windows. Aucun nouvel export
  integral ni test de restauration complet n'a ete effectue pendant
  l'installation de S3-A. L'installation est additive et verifiee
  transactionnellement, mais cela ne remplace pas un vrai PRA.
- **PR #14 reste draft**. Pas de fusion dans `main`, pas de publication
  Vercel Production executee par l'assistant. Une Preview automatique
  de l'integration Git/Vercel peut etre declenchee sans promotion.
- **Important :** les mutations enseignants restent bloquees sur
  localhost et les Previews Vercel. Recette reelle des actions sur le
  domaine officiel lors de la publication autorisee distincte.
- **Prochaine priorite :** finalisation locale S3-A, puis preparation
  S3-B (eleves), sans toucher a S3-C affectations pedagogiques.

### Prochaine verification locale

```powershell
git pull --ff-only origin feature/schoolnet-s2a-classes-tenant-qa
npm run qa:s3a
npm run lint
npm run build
npm run dev
```

Sur `http://localhost:5173/app/school/teachers` : les fonctions sont
presentes, l'etat d'attente doit disparaitre, et la liste d'enseignants
de cet etablissement doit afficher **0 rattachement**. Le bouton de
rattachement doit rester inactif dans localhost.

---

## HISTORIQUE : preparation S3-A avant installation (conserve pour tracabilite)

**Date : 17 novembre 2026** — **Statut : code et proposition SQL préparés sur GitHub, aucune migration S3-A installée.**

## Objectif
Donner aux seuls administrateurs locaux actifs un répertoire d'enseignants
propre à leur établissement, le rattachement d'un compte **teacher existant**
via son e-mail confirmé, et la révocation/réactivation de son affiliation.

**Hors périmètre S3-A** : création de comptes Auth, invitation de nouveaux
enseignants, affectations de classes/matières, élèves, notes, bulletins,
modification des cours/étudiants legacy. Ces sous-lots sont séparés.

## Situation avant S3-A
- S2-A et S2-B déjà installées. Migration S2-B `20261117150838`.
- 2 profils enseignants existants, tous deux avec e-mail confirmé (comptes Auth).
- 0 affiliation enseignant, 1 affiliation administrateur local, 2 écoles actives.
- `schoolnet_school_memberships` possède `UNIQUE(school_id,user_id)` et
  le trigger imposant la cohérence entre le rôle du membre et celui du profil.
- `authenticated` ne possède pas INSERT/UPDATE sur cette table. RLS SELECT
  scoped pour les administrateurs locaux.
- Les profils enseignants ne sont pas globalement visibles au rôle local.
  Le catalogue des enseignants doit donc être fourni par un RPC contrôlé.

## Code livré sur GitHub (branche de travail, PR #14 draft)
- `src/features/schools/pages/LocalSchoolTeachers.tsx` :
  route `/app/school/teachers`, établissement autorisé, répertoire filtrable,
  compteur actif/révoqué, rattachement par e-mail, confirmation de révocation
  et réactivation, messages de lecture seule et d'attente SQL.
- `src/features/schools/lib/schoolTeachersApi.ts` :
  RPCs typées et validation des réponses, erreurs compréhensibles,
  refus d'écriture AVANT l'envoi réseau hors origine autorisée.
- `src/features/schools/lib/schoolTeacherWritePolicy.ts` :
  réutilise la politique stricte S2-B (origine HTTPS officielle, Supabase
  principal et build de production). Tous les autres environnements sont
  en lecture seule.
- `src/routes/router.tsx`, `src/layouts/DashboardLayout.tsx`,
  `src/features/schools/pages/LocalSchoolDashboard.tsx` : navigation locale.
- `scripts/test-schoolnet-s3a-preview-guard.mjs` :
  8 vérifications statiques et de régression (`npm run qa:s3a`).

## SQL : proposition UNIQUEMENT, non installée
**Fichier :** `supabase/proposals/s3a_school_teachers_roster_and_memberships.sql`

- `public.schoolnet_school_teacher_roster(p_school_id uuid)` :
  répertoire de membres teachers de l'école autorisée uniquement, sans
  recherche globale; e-mail, nom et statut seulement pour cette affiliation.
- `public.schoolnet_school_teacher_attach(p_school_id uuid,p_email text)` :
  recherche exacte par e-mail d'un **compte Auth teacher déjà vérifié** ;
  aucun nouvel utilisateur créé ; refus si une affiliation existe déjà.
- `public.schoolnet_school_teacher_set_active(p_school_id uuid,
  p_membership_id uuid,p_active boolean)` :
  révocation ou réactivation explicite d'un membre teacher de son école.
- Chaque fonction publique est **SECURITY INVOKER**. Les opérations
  privilégiées sont dans `schoolnet_private` avec contrôle systématique
  de `auth.uid()`, rôle `school_admin`, affiliation et école actives.
- La vérification `Origin` ajoute une protection contre les mutations
  via localhost et Previews Vercel, **sans** être prise pour une identité
  fiable (forgable hors navigateur).
- Interdiction d'EXECUTE pour `anon` ; aucun GRANT d'écriture directe
  sur les memberships pour le client.
- Journal d'audit conservé et étendu avec trois événements :
  `school_teacher_linked`, `school_teacher_revoked`,
  `school_teacher_reactivated`.
- Aucune affectation automatique à `class_teachers`, `classes`,
  `courses` ou `profiles`.

## Recette Supabase avec annulation
**Fichier :** `supabase/verification/20261117_s3a_school_teacher_membership_rollback.sql`.

La proposition et ses tests ont été exécutés dans une transaction
`BEGIN; ... ROLLBACK;` sur le projet principal. Résultat :
`S3A_CROSS_SCHOOL_ATTACH_REVOKE_REACTIVATE_AUDIT_PREVIEW_ROLLBACK_PASS`.

Contrôles positifs et négatifs : répertoire initial vide, affiliation
d'un enseignant existant, visibilité école A, refus école B, doublon,
adresse inconnue, refus Preview, origine absente et faux sous-domaine,
révocation, réactivation, journalisation, révocation du school_admin.
Après annulation : 0 membership teacher, 1 membership school_admin,
5 événements d'audit, 2 classes historiques, 2 écoles actives,
aucune fonction S3-A persistante et aucune migration S3-A.

## Contraintes de livraison
- **Ne pas** installer le SQL avant autorisation explicite distincte.
- **Ne pas** déplacer la proposition dans `supabase/migrations` pour l'instant.
- **Ne pas** relancer `supabase db push`. Le dossier local
  `supabase/proposals/staged/` doit être préservé.
- **Ne pas** fusionner PR #14 ni publier/promo Vercel sans accord.
- Ne jamais créer d'enseignant de test réel en prod pour cette recette.
- L'administrateur peut voir la page sur localhost, mais le catalogue
  restera en attente d'activation SQL (et toute écriture refusée).
- Les comptes teacher peuvent être affiliés à plusieurs écoles ; l'accès
  aux classes et cours reste bloqué jusqu'à S3-C.

## Validation locale attendue
```powershell
git pull --ff-only origin feature/schoolnet-s2a-classes-tenant-qa
npm run qa:s3a
npm run qa:s2b
npm run lint
npm run build
npm run dev
```
Puis ouvrir `http://localhost:5173/app/school/teachers` avec
le compte administrateur local. Attendu : la page, les écoles autorisées,
le bandeau bleu de lecture seule et le message ambre
« S3-A — Activation du module en attente », aucune action opérationnelle.
Ne pas tenter d'ajouter un enseignant réel.

## Étapes après recette locale
1. Contrôle visuel et tests locaux, correctifs si nécessaire.
2. Validation et accord distinct avant installation S3-A côté Supabase.
3. Contrôle post-installation SQL, puis publication Vercel **séparée**
   pour recette réelle de création/révocation.
4. Passer au sous-lot S3-B puis S3-C sans réutiliser les RLS legacy.

## Reprise
GitHub `ramon77777/schoolnet`, branche
`feature/schoolnet-s2a-classes-tenant-qa`, PR #14 draft.
S2-B installée et recette locale validée. S3-A préparée sur GitHub
et testée sous transaction annulée, **non installée** dans Supabase,
**non publiée** sur Vercel.
