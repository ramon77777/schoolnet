# SCHOOLNET — Lot 5D-A+B | Candidat SQL consolidé et recette isolée

**Date :** 18 novembre 2026  
**Statut :** CANDIDAT TECHNIQUE GITHUB — **NON INSTALLÉ** — EN ATTENTE DES RÉSULTATS DE RECETTE SQL RÉELLE  
**Travail :** PR [#15](https://github.com/ramon77777/schoolnet/pull/15), brouillon, branche `feature/schoolnet-lot5d-a-securisation-20261118`.  
**Production :** `main` et `schoolnet-snowy.vercel.app` non modifiés pour le Lot 5D.  
**Supabase :** aucune exécution SQL de migration sur `schoolnet_2.0`.

## 1. Objet de l'autorisation

L'utilisateur a autorisé la **conception GitHub** du mécanisme transactionnel consolidé
5D-A et 5D-B, la préparation de **tests avec données fictives en environnement isolé**
et la mise à jour du workflow. Cette autorisation **n'inclut pas** l'installation
dans la base Supabase principale, la mutation d'inscriptions réelles, la fusion
dans `main` ni la publication Vercel.

## 2. Livrables sur la branche GitHub

| Fichier | Utilisation |
| --- | --- |
| `supabase/proposals/20261118_schoolnet_lot5d_ab_consolidated_SANDBOX_ONLY.sql` | **Proposition SQL exécutable pour PostgreSQL 17 isolé uniquement**. Jamais dans `migrations/`. |
| `scripts/lot5d/fixture_postgresql17.sql` | Schéma et profils / années / classes / inscriptions **fictifs**, sans copie de données personnelles. |
| `scripts/lot5d/test_consolidated_postgresql17.sql` | Scénarios d'intégration PostgreSQL avec transaction `BEGIN ... ROLLBACK`. |
| `scripts/test-schoolnet-lot5d-consolidated-sandbox.mjs` | Tests statiques hors réseau : garde-fous, droits, verrouillage, traçabilité, périmètre et CI. |
| `package.json` | Nouvelle commande `npm run qa:lot5d:c`. |
| `.github/workflows/schoolnet-quality.yml` | Job PostgreSQL 17 éphémère `schoolnet_lot5d_ci`, **sans secrets Supabase** ni déploiement. |

## 3. Fonctionnement proposé : jamais déclenché en production à ce stade

La proposition intègre dans une **seule transaction de migration** :

1. Un verrou de la modification directe de `school_years.is_current` :
   trigger `BEFORE UPDATE`, protection des insertions `is_current=true`
   et des suppressions de l'année active.
2. La neutralisation de `public.admin_set_current_school_year(uuid)` :
   fonction conservant sa signature pour compatibilité mais refusant
   explicitement la bascule directe.
3. Une preuve privée interne `schoolnet_private.lot5d_year_switch_permits`,
   associée à l'ID de transaction PostgreSQL, créée et retirée par le
   finaliseur dans **la même** transaction. Aucun simple GUC envoyé
   par le navigateur n'accorde une autorisation.
4. Les tableaux `school_year_rollover_decisions`,
   `school_year_rollover_runs` et `school_year_rollover_audit`,
   RLS activée, consultations réservées au Super Admin,
   aucun `INSERT/UPDATE/DELETE` direct par les rôles publics.
5. Deux fonctions **privées non exécutables** par `anon`,
   `authenticated` ou `service_role` :
   `schoolnet_private.save_lot5d_legacy_decision` pour enregistrer
   une décision et `schoolnet_private.finalize_lot5d_legacy_year`
   pour le passage transactionnel à construire derrière un futur
   backend Admin authentifié et autorisé.
6. Une recette complète de source/cible/années/dossiers/classes,
   vérifiée **après acquisition des verrous**.
7. Une clôture de l'année source et une inscription cible distincte
   pour chaque décision autorisée, avec contrôles d'intégrité,
   historiographie via les triggers existants, journal immuable
   et idempotence par `operation_id`.

### Frontière des données

- Les enregistrements de `student_enrollments` de la source ne sont
  **pas supprimés** : leur statut est clôturé, puis l'historique automatique
  est journalisé.
- Les anciens liens `class_students` sont **conservés** pour le contexte
  historique ; de nouveaux liens sont ajoutés pour l'année cible.
  Ce comportement exige une recette métier dédiée sur la visibilité des
  anciennes classes (enseignants, notes, anciens bulletins).
- `profiles.class_name` est modifié **uniquement** lorsque le champ
  initial est vide ou correspond à la classe legacy source.
  Un profil incohérent provoque un refus et un rollback.
- Les liens parents, invitations, notes, bulletins, cours, documents,
  membres d'établissement et affectations S3-C ne sont jamais déplacés
  ou modifiés par ce finaliseur legacy.
- Toute classe officielle ou affectation S3-C associée à la source
  ou la cible interdit cette procédure globale : **circuit scolaire séparé**.

### Restriction volontaire supplémentaire

**Tout** `student_enrollments` déjà présent dans l'année cible
(`active`, `completed`, `draft`, `withdrawn` ou `cancelled`) bloque
le candidat v1. C'est plus strict que le projet historique de migration,
qui envisageait de réutiliser certains brouillons, et cela évite tout
écrasement ou résurrection implicite.

L'audit réel a montré **1 dossier actif en 2026–2027**, concernant un
autre apprenant que celui de 2025–2026. Tant que cette situation métier
n'est pas **explicitement qualifiée**, aucune bascule sur le projet réel
n'est envisageable, même si la proposition isolée réussit ses tests.

## 4. Recettes isolées : périmètre et limites

Le job GitHub Actions **`Test 5D-A+B sur PostgreSQL 17 jetable`** utilise
exclusivement un serveur PostgreSQL 17 créé pour cette exécution. Sa base
est `schoolnet_lot5d_ci` ; le code de la CI refuse de passer si l'hôte
ou le nom de base sont inattendus. Elle n'a ni connexion Supabase,
ni clef `service_role`, ni projet Vercel.

Les **18 vérifications SQL prévues** couvrent : existence du calendrier,
permissions de fonctions, refuser UPDATE/RPC legacy/DELETE, décisions
manquantes, rôle étudiant, redoublement invalide, dossier actif d'un autre
élève en cible, présence d'une classe officielle, injection d'erreur
après bascule et rollback, succès nominal, idempotence, rejet d'une
seconde clé, immutabilité du journal, blocage d'un **brouillon** cible,
**départ sans dossier cible** et **réinscription vers un niveau supérieur**.

Les tests **`qa:lot5d:c`** sont des tests **statiques**. Ils ne prouvent
**pas** l'exécution du SQL par PostgreSQL. Le schéma fictif est une
**représentation partielle** : il ne valide pas à lui seul tous les
triggers, policies, dépendances et fonctions du Supabase réel.

**Statut de recette** : le premier job PostgreSQL 17 éphémère (15 scénarios)
et la vérification GitHub Actions de build/tests ont **réussi** pour le
commit `10d7912` (run `44316739463`). Le scénario a ensuite été enrichi
à **18 vérifications**, dont le résultat GitHub Actions doit être confirmé
à nouveau. La validation locale par l'utilisateur n'est pas encore faite.
Le caractère **entièrement fictif** de la recette reste inchangé. Même après réussite, les
contrôles de concurrence à deux sessions, permissions via véritable
backend Admin et compatibilité exhaustive avec le schéma existant
restent à effectuer avant installation.

## 5. Exécution locale du développeur : uniquement QA hors réseau

Dans PowerShell, dans `D:\Bakary\10 autres\schoolnet` :

```powershell
git status --short
git branch --show-current
git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118
npm run qa:lot5d:a
npm run qa:lot5d:b
npm run qa:lot5d:c
npm run lint
npm run build
git status --short
```

La recette SQL d'intégration tourne dans le **job PostgreSQL GitHub Actions
isolé**, jamais dans le Supabase principal ni depuis le navigateur.
Ne pas coller le fichier `SANDBOX_ONLY.sql` dans le SQL Editor
de `schoolnet_2.0`. Les fichiers locaux non suivis doivent être préservés.

## 6. Points encore bloquants

1. Confirmer la nouvelle exécution des **18 cas** du job SQL isolé et corriger tout échec
   de compilation, de trigger ou de scénario **sur cette branche uniquement**.
2. Réaliser l'examen métier du dossier actif 2026–2027 :
   aucun statut modifié automatiquement.
3. Auditer les usages historiques de `class_students` et
   `profiles.class_name` en consultation enseignant/parent.
4. Définir le **backend Admin** à rôle SQL dédié avec vérification
   forte de l'identité et origine officielle (aucun `GRANT`
   privilégié vers une API publique).
5. Mettre en place un banc de test de **concurrence multi-sessions** et
   une recette de schéma cible fidèle à Supabase, toujours hors production.
6. Soumettre un **nouveau GO distinct** pour préparer la migration
   Supabase canonique et un **autre GO** avant toute application réelle.
7. Ne pas fusionner la PR #15 ni publier sur Vercel tant que le parcours
   métier et la migration ne sont pas validés séparément.

### Avertissement sur la migration historique

Le fichier historique
`supabase/migrations/20261110090000_school_year_rollover_controlled.sql`
est toujours dans le dépôt mais **n'est pas installé**. Il comporte
l'ancienne logique et ne doit **pas** être exécuté ou être poussé
implicitement avec le nouveau candidat. Cette dette de migration doit
être résolue avant tout futur `supabase db push`.

**Workflow confirmé :** branche GitHub → mise à jour locale → QA et
tests visibles → autorisation de fusion → `main` → Vercel **existant**,
et séparément permissions SQL / sauvegarde / installation Supabase
après GO explicites.