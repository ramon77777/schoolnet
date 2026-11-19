# SCHOOLNET — Lot 5D-A : preparation securisee du changement d'annee

**18 novembre 2026 — BRANCHE GITHUB UNIQUEMENT / AUCUNE INSTALLATION SQL.**

- Depot : `ramon77777/schoolnet`.
- Branche : `feature/schoolnet-lot5d-a-securisation-20261118` creee depuis `main`.
- Strategie : GitHub -> mise a jour locale -> tests en local -> validation explicite -> suite des travaux.
- Cette livraison **ne change ni** `school_years.is_current`, **ni** un dossier `student_enrollments`, **ni** une affectation S3-C, **ni** Vercel production.
- La proposition SQL est dans `supabase/proposals/`, **pas** dans `supabase/migrations/`. Aucune execution implicite pendant `npm run build` ou la CI.

## 1. Baseline Supabase principal (lecture seule)

Projet `schoolnet_2.0`, 43 migrations enregistrees au 18/11/2026.
Lot 5.D ancien `20261110090000_school_year_rollover_controlled.sql` : **non installe**.
Les tables `school_year_rollover_decisions` et `school_year_rollover_runs`,
les RPC `admin_save_school_year_rollover_decision` et
`admin_finalize_school_year_rollover` sont absentes.

| Annee | `is_current` | Dossiers `active` | Classes |
|---|---|---:|---:|
| 2025-2026 | true | 1 | 1 legacy |
| 2026-2027 | false | 1 | 1 legacy |
| 2027-2028 | false | 0 | 0 |

L'anomalie historique (dossier actif dans une annee non courante) **persiste**.
Il serait dangereux de corriger l'annee active uniquement d'apres la date civile.

Les modules S2-A/S2-B/S3-A/S3-B/S3-C sont deja installes.
Au controle initial, 0 classe officielle et 0 affectation officielle.
Les contrats S3-C sont toutefois reellement presents et doivent etre isoles
du passage d'annee legacy (une affectation par ecole/annee, historique local).

**Point de securite particulier :** `authenticated` et `anon` disposent
d'un privilege SQL de table `UPDATE` sur `school_years` ; les politiques
RLS restreignent actuellement l'operation aux Admin. Mais la RPC
`admin_set_current_school_year` et une modification directe admin ne
cloturent pas les dossiers annuels. Les garde-fous frontend ne corrigent
**pas** ce probleme sur la base tant qu'une migration serveur n'est
pas explicitement autorisee.

## 2. Modifications preparees dans GitHub

1. `src/features/enrollments/lib/schoolYearRolloverWritePolicy.ts` :
   toute ecriture 5.D est desactivee par defaut. Meme en production, elle
   demanderait un opt-in exact `VITE_SCHOOLNET_LOT5D_WRITES_ENABLED=true`,
   un build de production, le domaine officiel et l'URL Supabase principale.
   **Ne pas definir ce flag maintenant.** Le client n'est jamais une
   autorisation SQL.
2. `src/features/enrollments/lib/schoolYearRolloverApi.ts` :
   gardes redondants avant les RPC de decision et de finalisation.
3. `src/features/admin/pages/AdminYearRollover.tsx` :
   lecture seule, avertissement visible, refus des classes officielles
   `school_id IS NOT NULL` / `learning_context='school'`, refus du
   passage global si des classes officielles sont presentes.
4. `src/features/enrollments/lib/adminEnrollmentsApi.ts` :
   le catalogue renvoie aussi `school_id` et `learning_context`.
   Droits SELECT verifies en lecture seule pour ces colonnes.
5. `src/features/admin/pages/AdminSchoolYears.tsx` :
   suppression du bouton qui appelait `admin_set_current_school_year`
   directement ; indication du parcours controle a la place.
   La creation initiale d'une annee scolaire et la consultation restent
   independantes de ce retrait.
6. `supabase/proposals/20261118_schoolnet_lot5d_a_guard_REVIEW_ONLY.sql` :
   **proposition NON appliquee** de trigger de refus sur
   `school_years.is_current` en presence de donnees legacy ou officielles.
   Fonction privee a lecture privilegiee, execute non accorde aux clients.
   Le futur 5D complet devra **remplacer** ce verrou temporaire dans une
   migration consolidee, pas appliquer les deux propositions sans revue.
7. `scripts/test-schoolnet-lot5d-a-guard.mjs` :
   neuf tests hors reseau verifies via `npm run qa:lot5d:a`.
   Le workflow GitHub de qualite lance ces tests, `lint` et `build`
   sur les pull requests sans deploiement SQL.

## 3. Frontieres du Lot 5D-A

- Pas de bascule de l'annee courante, pas de test d'ecriture sur la base
  principale, pas de migration sur Supabase, pas de creation d'inscription.
- Pas d'affectation automatique S3-C et pas de mouvement de classes d'une
  ecole a une autre : le workflow global doit etre concu avec des limites
  d'etablissement avant la phase 5D-B.
- Les documents, notes, bulletins, liens Parent/Enfant, cours et archives
  ne sont pas modifies par ce lot preparatoire.
- Les inscriptions nouvelles et les demandes de validation encore ouvertes
  restent des processus distincts ; pas de resolution automatique.
- La migration historique 5D du 10/11 n'est **pas compatible telle quelle**
  avec le nouveau fonctionnement S2/S3 : **ne pas l'installer**.
- La migration de securite des corrections
  `20261109140104_harden_assessment_legacy_rpcs.sql` est encore
  independante et non autorisee : ne pas lancer de `supabase db push`
  global.

## 4. Recette locale : procedure Windows

Dans VS Code / PowerShell, depuis `D:\Bakary\10 autres\schoolnet` :

```powershell
git status --short
git fetch origin
git switch --track origin/feature/schoolnet-lot5d-a-securisation-20261118
npm run qa:lot5d:a
npm run lint
npm run build
npm run dev
```

**Important :** le repertoire local comportait des fichiers hors suivi
(`scripts/schoolnet-student-auth-sandbox-local.mjs` et
`supabase/proposals/staged/`) ainsi que
`tsconfig.app.tsbuildinfo` modifie. Ne rien supprimer, ne pas utiliser
`git reset --hard`, `git clean -fd` ni un stash oublie. En cas de
refus de `git switch`, conserver les donnees existantes et signaler le
message exact avant tout deplacement de fichier.

Sur localhost, se connecter en Super Admin et visiter :

- `http://localhost:5173/app/admin/school-years`
  - Les annees restent visibles ; aucun bouton « Definir active ».
  - Le parcours de re-inscription est indique.
- `http://localhost:5173/app/admin/year-rollover`
  - Affichage de la situation et des alertes, dont l'incoherence 2026-2027.
  - **Aucune decision / finalisation possible**, aucun changement d'annee.
  - Les classes et affectations officielles ne sont jamais proposees
    comme destination du workflow legacy.

La verification navigateur et les commandes locales doivent etre
validees sur capture par l'utilisateur. L'existence de tests statiques
ne prouve ni un bout-en-bout SQL ni une recette d'ecriture.

## 5. Prochaine autorisation, apres recette locale

Une validation distincte sera indispensable pour :

1. analyser et valider les corrections de l'anomalie scolaire existante ;
2. concevoir la **migration finale 5D-B** compatible S3-C et les droits
   d'etablissement, avec un calendrier global explicite et des journaux ;
3. faire la recette SQL transactionnelle avec `ROLLBACK` puis, seulement
   apres accord, installer une migration ciblee sur Supabase ;
4. merger le code et promouvoir Vercel production uniquement apres
   autorisation specifique.

**Regle : aucun SQL, e-mail, compte Auth, enregistrement, deployment ou
fusion `main` dans cette premiere intervention 5D-A.**
