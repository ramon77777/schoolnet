# SCHOOLNET 2.0 — S2-B | Garde-fous de creation de classes (17/11/2026)

## ACTUALISATION — S2-B INSTALLEE SUR SUPABASE PRINCIPAL (17/11/2026)

Cette section est l'etat le plus recent et remplace les mentions historiques
de « S2-B non installee » figurant dans les sections de recette preparatoire ci-dessous.

- Projet: `schoolnet_2.0` (`anttmbhaphkhmkoqsofd`).
- Migration installee via Supabase et historisee une seule fois:
  `20261117150838_schoolnet_s2b_school_class_rpc_and_catalog`.
- Migration canonique ajoutee sur la branche de la PR #14:
  `supabase/migrations/20261117150838_schoolnet_s2b_school_class_rpc_and_catalog.sql`.
  Le fichier documente la migration deja appliquee; **ne pas la relancer**.
- Quatre RPC (deux facades publiques invoker et deux helpers prives)
  presentes; `anon` ne peut pas executer les deux facades publiques.
- Recette reelle executee *apres installation* sous `BEGIN ... ROLLBACK`:
  droits inter-ecoles, creation autorisee, doublons, audit, cinq roles,
  revocation, suspension et refus des origines non approuvees: PASS.
- Postcontrole apres recette: **2 classes legacy intactes, 0 classe
  officielle enregistree, 2 ecoles actives, 1 school_admin actif,
  5 lignes d'audit, 4 policies sur classes**.
- Sauvegarde pre-installation fournie localement par l'utilisateur:
  `D:\\Bakary\\SCHOOLNET_BACKUPS\\S2B_2026-11-17\\schoolnet_avant_s2b.dump`.
  Archive `pg_dump` des schemas `public`, `schoolnet_private`,
  `schoolnet_student_private` (757260 octets). Ce n'est **pas** une
  sauvegarde complete des objets Storage ni une restauration validee.
  Ne jamais committer ce fichier prive.
- Tests Windows realises par l'utilisateur avant installation:
  `npm run qa:s2b` 7/7, ESLint 0 erreur (1 avertissement ancien),
  build Vite/TypeScript OK, capture UI lecture seule conforme.
- Les messages de l'interface ont ete actualises suite a l'installation;
  nouvelle recette Windows requise apres synchronisation GitHub.
- **Conservation des garde-fous**: localhost et Previews Vercel restent
  lecture seule. Les RPC restent refusees aux utilisateurs non autorises
  ou hors etablissement. Seule la production officielle peut demander une
  creation apres publication controlee.
- **PR #14 reste draft**, aucune fusion vers `main`, aucun nouveau
  deploiement/promotion Vercel. Ne pas relancer `supabase db push`.
- Suite: synchronisation locale et tests, recette lecture seule apres
  installation, puis preparation separee de la publication et du lot S3.

---

## Situation et perimetre
- **S2-A installee** sur Supabase principal (migration `20261117123824_schoolnet_s2a_classes_tenant_foundation`), tests de confinement PASS.
- **S2-B NON INSTALLEE** sur Supabase principal. Les fonctions
  `schoolnet_school_class_catalog` et `schoolnet_school_create_class` n'existent pas en production a ce stade.
- Les corrections suivantes ont ete commitees **uniquement** dans GitHub, branche
  `feature/schoolnet-s2a-classes-tenant-qa`, PR #14 **draft** (non fusionnee).
- **Aucune publication Vercel, aucune migration persistante S2-B, aucune creation reelle de classe.**

## Corrections implementées sur GitHub

1. `src/features/schools/lib/schoolClassWritePolicy.ts` (nouveau).
   Compare **exactement** l'origine navigateur
   `https://schoolnet-snowy.vercel.app`, l'URL Supabase principale
   `https://anttmbhaphkhmkoqsofd.supabase.co` et le fait d'etre un build
   de production. Tous les autres environnements sont **lecture seule**,
   notamment `localhost` et les Previews Vercel. Si le navigateur est
   absent, lecture seule par defaut.
2. `src/features/schools/lib/schoolClassesApi.ts`.
   Refuse la creation AVANT l'appel a la RPC si l'origine n'est pas
   autorisee ; renvoie un message explicite. Desormais les erreurs SQL
   generiques de colonnes ne sont plus masquees comme « activation
   en attente » : seul l'absence de la RPC S2-B est consideree comme telle.
3. `src/features/schools/pages/LocalSchoolClasses.tsx`.
   Bandeau bleu « Prévisualisation SCHOOLNET — lecture seule », controle
   du bouton et de la soumission, message S2-A installee / S2-B non installee.
   Les nouvelles classes de l'etablissement restent consultables sous
   RLS une fois la RPC catalogue S2-B installee.
4. `src/features/schools/pages/LocalSchoolDashboard.tsx`.
   Affiche la distinction fondation S2-A installee / activation S2-B a venir.
5. `supabase/proposals/s2b_school_class_rpc_and_catalog.sql`.
   **PROPOSITION UNIQUEMENT** : la RPC privee de creation refuse tout
   header PostgREST `request.headers.origin` absent ou different de
   `https://schoolnet-snowy.vercel.app`. Cette defense empeche les
   creations accidentelles via localhost / Preview, meme si une ancienne
   version du client etait executee.

   **Limite importante :** le header HTTP `Origin` est forgeable
   hors navigateur et n'est pas une authentification. Les **vraies**
   autorisations sont toujours imposees par `auth.uid()`, le role
   `school_admin` en base, l'appartenance active a l'ecole,
   le statut actif de l'etablissement, les verifications de niveau/annee
   et les constraints/indices. Le client ne transmet jamais un ID de
   parent ou un role pour autoriser cette action.
6. `supabase/verification/20261110_s2b_school_class_rpc_rollback.sql`
   ajoute les cas negatif Preview, origine absente, faux sous-domaine.
7. `scripts/test-schoolnet-s2b-preview-guard.mjs` : 7 tests
   de regression (politique stricte des origines et du projet, aucune
   invocation RPC depuis l'aperçu, messages UI, protections SQL).
8. `package.json` : ajout de `npm run qa:s2b`.

## Recette SQL reelle et reversible

La proposition S2-B (avec ses functions, GRANTs et extension de l'audit)
a ete testee **dans une transaction explicite unique** :

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '45000ms';
-- precontrole du schema et des effectifs S2-A
-- proposition S2-B
-- tests SQL S2-B
ROLLBACK;
-- verification des effectifs et absence des RPC S2-B
```

La premiere tentative a detecte l'emploi incorrect de
`pg_catalog.nullif()`. La proposition a ete corrigee pour utiliser
`NULLIF()`. Le **second passage de la recette est reussi**, avec
`ROLLBACK`. Les scenarios de creation autorisee et refusee,
roles, doublons, audit, revocation et suspension sont PASS.

**Postcontrole Supabase apres annulation :**
- **2 classes historiques**, intactes.
- **2 etablissements actifs**.
- **1 school_admin actif**.
- **4 policies RLS classes**, S2-A intacte.
- **RPC S2-B catalogue absente**.
- **RPC S2-B creation absente**.

Aucun des objets, comptes de test ou creations de la recette S2-B
n'a ete persiste.

## Verification locale requise (poste Windows)

Depuis la branche deja ouverte :

```powershell
git status --short
git fetch origin
git pull --ff-only origin feature/schoolnet-s2a-classes-tenant-qa
npm run qa:s2b
npm run lint
npm run build
npm run dev
```

Ouvrir `http://localhost:5173/app/school/classes` en session
`school_admin` si un compte local autorise est disponible.

**Attendu avant activation backend S2-B** : la page affiche la
previsualisation en lecture seule et le bandeau « Activation du module
en attente ». Aucun bouton ne peut creer une classe en local.

**A NE PAS FAIRE :**
- `supabase db push` : ne jamais pousser l'ancien fichier
  `supabase/proposals/staged/20261117103321_schoolnet_s2a_classes_tenant_foundation.sql`.
- Ne pas copier la proposition S2-B dans les migrations actives.
- Ne pas re-appliquer S2-A, deja installee.
- Ne pas fusionner la PR ni publier Vercel sans validation.
- Ne pas effacer les scripts locaux non suivis ni
  `tsconfig.app.tsbuildinfo` du poste Windows.

## Etapes restant a valider

1. Validation locale des 7 tests `qa:s2b` et compilation Vite.
2. Capture et validation manuelle de la page école en lecture seule.
3. Accord **distinct** avant installation persistante de S2-B sur
   Supabase principal ; a ce stade creer une migration canonique portant
   le timestamp **attribue par Supabase** et verifier l'historique SQL.
4. Test post-installation RLS/RPC, bouton et droits sur le domaine
   officiel apres deploiement autorise, puis gestion des niveaux,
   affectation d'apprenants et enseignants dans des sous-lots isoles.

## Reprise dans une nouvelle conversation

SCHOOLNET, `ramon77777/schoolnet` :
**S2-A installee** (version `20261117123824`), **S2-B uniquement
proposee et recette transactionnelle reussie**. Branche
`feature/schoolnet-s2a-classes-tenant-qa`, PR #14 draft ; aucun
merge, aucun deploiement Vercel. Garde-fous Preview / local dans
client et SQL S2-B. Reste : tests locaux `npm run qa:s2b`,
`npm run lint`, `npm run build`, capture UI, puis autorisation
separee pour installer S2-B.
