# SCHOOLNET — Workflow de reprise et avancement au 18 novembre 2026

> **DOCUMENT DE REPRISE ACTUEL — à ouvrir en premier lorsque nous reprenons SCHOOLNET.**
>
> Statuts distincts : **PUBLIÉ**, **TESTÉ LOCAL**, **PRÉPARÉ GITHUB**, **EN ATTENTE D'AUTORISATION**.
> Ce document complète [le workflow directeur historique](../WORKFLOW_DIRECTEUR_SCHOOLNET_2_0_2026-11-10.md) sans réécrire son historique.

## 1. Règles de travail à respecter

1. Le travail est enregistré sur **une branche GitHub distincte**.
2. L'utilisateur synchronise VS Code local et effectue `npm run ...`, puis teste les pages.
3. L'utilisateur valide les résultats par des captures / retours.
4. Après validation, une PR est fusionnée dans `main` **sur autorisation explicite**.
5. Le projet Vercel **existant** se met à jour depuis `main` (pas de second site).
6. Les écritures Supabase, migrations, changements Auth/Storage, et de l'année active
   nécessitent une **autorisation distincte**, une sauvegarde validée et une recette ciblée.
7. Ne pas effacer les scripts non suivis, les propositions locales SQL ou le stash.
   Jamais `git reset --hard`, `git clean -fd`, `supabase db push` sans accord.

La règle de sécurité reste **fail-closed** : Preview Vercel / localhost en lecture
seule sur les modules sensibles, écriture seulement après contrôle serveur.

## 2. État publié et déjà vérifié

| Lot | État au 18/11 | Preuve / précisions |
| --- | --- | --- |
| Lot 5C — parcours d'inscription, parent/enfant et invitations | **PUBLIÉ** | Espaces Parent et Super Admin vérifiés en production avec captures. |
| S2-A — établissements / tenant | **PUBLIÉ** | Accès limité à l'établissement autorisé ; test visuel production. |
| S2-B — classes officielles | **PUBLIÉ** | Page, formulaire et catalogue visibles en production. |
| S3-A — enseignants / rattachements | **PUBLIÉ** | Page accessible ; répertoire vide sur école de test. |
| S3-B — élèves / rattachements | **PUBLIÉ** | Page accessible ; répertoire vide sur école de test. |
| S3-C — affectations pédagogiques | **PUBLIÉ** | Page accessible ; aucun lien créé dans l'école de test. |

- Dépôt : [`ramon77777/schoolnet`](https://github.com/ramon77777/schoolnet).
- Branche de production : `main`, commit fusion du Lot 5C/S2/S3 : **`2761d73`**.
- PR #13 et PR #14 fusionnées sur `main`.
- Production Vercel **existante** : https://schoolnet-snowy.vercel.app .
- Les **interfaces** ont été validées en production par captures ; cela ne
  remplace pas une recette d'écriture de données réelles pour chaque module.
- Supabase principal `schoolnet_2.0` : projet **`anttmbhaphkhmkoqsofd`**,
  **43 migrations** enregistrées lors du dernier audit en lecture seule.
- Les tables / RPC S2 et S3 sont présentes ; les fonctions de passage 5D
  historique, elles, **ne sont pas installées**.

## 3. Poste Windows / état local avant 5D-B

- Répertoire : `D:\Bakary\10 autres\schoolnet`.
- Branche locale activée pour le Lot 5D : `feature/schoolnet-lot5d-a-securisation-20261118`.
- Backup des fichiers locaux : `D:\Bakary\SCHOOLNET_BACKUPS\LOCAL_BEFORE_MAIN_20261118_114501`.
- Sauvegarde PostgreSQL + Storage préalable à la publication 5C
  déjà effectuée (archive `pg_restore --list` vérifiée,
  Storage : **24/24** fichiers dans 7 buckets, manifeste SHA256).
- Fichiers non suivis à conserver : `scripts/schoolnet-student-auth-sandbox-local.mjs`,
  `scripts/test-schoolnet-student-auth-flow-mock.mjs`,
  `scripts/test-schoolnet-student-auth-sandbox-local.mjs`,
  `supabase/proposals/staged/`.
- `tsconfig.app.tsbuildinfo` peut changer à chaque build ; ancien stash sauvegardé.
- Recette locale 5D-A **validée** : 9/9 tests + lint (0 erreur, 1 avertissement connu)
  + build + captures des pages Années scolaires / Passage d'année.

## 4. Lot 5D — là où nous en sommes

### 5D-A : **TESTÉ LOCAL, PR #15 EN BROUILLON, NON PUBLIÉ**

Branche : `feature/schoolnet-lot5d-a-securisation-20261118`.
[PR #15](https://github.com/ramon77777/schoolnet/pull/15).

- Blocage des écritures 5D par défaut, même sur production non explicitement ouverte.
- Retrait du bouton Admin « Définir année active ».
- Séparation des classes historiques et des classes officielles d'établissement.
- Proposition SQL 5D-A en `supabase/proposals/`, **non exécutée**.
- La recette visuelle des deux pages, le code et les tests ont été validés.
- **La PR est volontairement toujours en brouillon, sans fusion et sans déploiement**.

### 5D-B : **PRÉPARATION GITHUB, RECETTE LOCALE À EFFECTUER**

Dans la **même branche et la même PR #15** :

- `src/features/enrollments/lib/schoolYearRolloverPreflight.ts`
  - Diagnostic pur : année source/cible, année unique, dossiers cible
    actifs/terminés, classes d'origine manquantes/incompatibles,
    classes S3-C, doublons, incohérences.
  - **Le résultat n'autorise jamais l'écriture**. Les tests sur les données
    visibles dans le navigateur ne remplacent pas une inspection serveur.
- `src/features/admin/pages/AdminYearRollover.tsx`
  - Synthèse du diagnostic en lecture seule, boutons de décision et
    de finalisation visuellement grisés si désactivés.
  - Un résultat « 0 anomalie locale » n'autorise pas une bascule.
- `supabase/verification/20261118_schoolnet_lot5db_readonly_preflight.sql`
  - Requête agrégée **WITH/SELECT uniquement** pour audit futur.
  - N'écrit aucune donnée.
- `supabase/proposals/20261118_schoolnet_lot5db_TRANSACTION_DRAFT_NOT_INSTALLABLE.sql`
  - **Document SQL intégralement commenté, non exécutable**.
  - Définit les contraintes à respecter pour la future transaction :
    verrous, décisions complètes, cible déjà peuplée, isolation des
    établissements, idempotence, événements d'audit et retour arrière.
- `scripts/test-schoolnet-lot5d-b-preflight.mjs`
  - Tests d'anomalies, absence d'écriture et non-déploiement SQL.
- `package.json` : `npm run qa:lot5d:b`.
- `.github/workflows/schoolnet-quality.yml` : contrôle B ajouté aux PR.

**Attention : le SQL transactionnel 5D-B n'est PAS encore implémenté et
aucune fonction serveur n'est installée.** Ce jalon constitue un diagnostic
et une spécification sécurisée, pas une activation.

### Anomalie principale à résoudre

| Année | Année courante | Dossiers actifs | Impact |
| --- | --- | ---: | --- |
| 2025–2026 | Oui | 1 | Source legacy du passage envisagé. |
| 2026–2027 | Non | 1 | Dossier déjà actif dans la cible : **blocage obligatoire**. |
| 2027–2028 | Non | 0 | Aucune bascule décidée. |

**Interdictions absolues :**
- Ne pas utiliser la RPC historique `admin_set_current_school_year` en production :
  son serveur n'est pas encore protégé par le correctif 5D-A/B.
- Ne pas fixer `VITE_SCHOOLNET_LOT5D_WRITES_ENABLED=true`.
- Ne pas installer `20261110090000_school_year_rollover_controlled.sql` telle quelle.
- Ne pas installer la proposition 5D-A et 5D-B séparément : la migration finale
  devra **consolider** les protections, sans contournement par simple GUC.
- Ne jamais modifier ou « corriger » le dossier actif 2026–2027 par déduction
  ou à partir de la date système. Faire un audit métier et un choix approuvé.

## 5. Étape IMMÉDIATE au retour utilisateur — recette B locale

Dans le terminal PowerShell de VS Code :

```powershell
git status --short
git branch --show-current
git pull --ff-only origin feature/schoolnet-lot5d-a-securisation-20261118
npm run qa:lot5d:a
npm run qa:lot5d:b
npm run lint
npm run build
git status --short
npm run dev
```

Si `git pull` refuse à cause d'un fichier modifié/non suivi :
**arrêter, conserver les fichiers et transmettre le message**. Ne pas
supprimer ou masquer les modifications locales.
Le résultat attendu est `qa:lot5d:a` **9/9**, `qa:lot5d:b` **17/17**
(sous réserve de la recette réelle), ESLint 0 erreur et build réussi.

Pages à contrôler avec compte Super Admin, sans aucune écriture :
- `http://localhost:5173/app/admin/school-years` : activation directe
  suspendue, années courantes inchangées.
- `http://localhost:5173/app/admin/year-rollover` : nouveau panneau
  « Lot 5D-B — diagnostic préparatoire local » ; année source 2025–2026,
  cible 2026–2027, dossier cible actif signalé, **boutons réellement désactivés
  ET visiblement grisés**.

**La validation de cette étape dépend des résultats réels de l'utilisateur.
Aucune validation de B par simple ajout du code dans GitHub.**

## 6. Ce qui suivra, sur validations distinctes

**5D-B / ÉTAPE SERVEUR (NON ENCORE AUTORISÉE)** :
1. Auditer le dossier actif 2026–2027 avec le responsable du cas (sans
   écraser ni changer de statut automatiquement).
2. Concevoir la migration SQL **consolidée** 5D-A+B, explicitement
   anti-contournement, compatible transactions et contrôles S3-C.
3. Séparer les réinscriptions legacy des affectations des établissements
   ; définir la politique de passage d'année établissement par établissement.
4. Tester sur environnement isolé : cas conformes et rejets, concurrence,
   idempotence, RLS/permissions, journal et rollback intégral, **sans
   toucher aux données réelles**.
5. Soumettre l'installation SQL à autorisation explicite, avec préflight
   et sauvegarde, avant toute écriture sur le projet principal.

**APRÈS ACTIVATION SQL AUTORISÉE** :
- Recette métier contrôlée, puis fusion PR #15 et publication sur le **Vercel
  SCHOOLNET existant** uniquement après validation.
- Traiter les demandes d'inscription publiques encore ouvertes, sans lien
  automatique avec les dossiers et familles existants.
- Étendre le cycle annuel aux établissements S3-C, classes/enseignants/élèves
  et renouvellement des affectations, **sans déplacer les inscriptions historiques**.
- Reprendre le backlog de la feuille de route (salles / emploi du temps,
  présences, bulletins, notification, finances, documents) au fil des GO.

## 7. Dettes techniques distinctes, non bloquantes pour la recette locale

- ESLint : avertissement `useEffect` dépendance `user` dans
  `src/features/enrollments/pages/EnrollmentRecordsPage.tsx:161`.
- Browserslist : base `caniuse-lite` ancienne.
- Bundle Vite principal important : code splitting à planifier.
- Migration séparée `20261109140104_harden_assessment_legacy_rpcs.sql`
  encore à traiter ; ne pas l'installer implicitement avec le Lot 5D.

## 8. Règle de reprise

> **À la prochaine conversation :** « SCHOOLNET — reprise depuis
> `docs/releases/SCHOOLNET_WORKFLOW_REPRISE_LOT5D_2026-11-18.md`.
> Branche `feature/schoolnet-lot5d-a-securisation-20261118`, PR #15 brouillon.
> 5D-A local validé ; 5D-B diagnostic et spécification sur GitHub,
> attendre `npm run qa:lot5d:b` + captures locales. Pas de SQL,
> pas de merge `main`, pas de Vercel sans mon GO. »
