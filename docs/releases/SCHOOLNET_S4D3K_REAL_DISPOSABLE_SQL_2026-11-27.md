# SCHOOLNET V2 — S4-D.3k : vrai backend SQL sur Supabase jetable

**27 novembre 2026 — PR brouillon, aucune production modifiée.**

## Objectif et périmètre

Ce sous-lot passe de la conception à des opérations PostgreSQL réellement exécutées sur une instance Supabase **locale et jetable dans GitHub Actions**, avec 11 comptes de test GoTrue créés au démarrage, des JWT authentiques, des requêtes PostgREST et des transactions SQL.

**Parcours opérationnel sur la base fictive :** vérifier un élève et ses résultats V2 → ouvrir un dossier et figer un snapshot → soumettre une demande → approuver/refuser ou demander une correction par un autre administrateur → autoriser la publication avec une permission distincte. Chaque opération enregistre une transition et un événement d'audit dans la même transaction.

**La génération et l'émission effectives du PDF restent explicitement interdites**, faute de stockage privé et de contrôle des accès familiaux. Le prototype distingue l'autorisation de publication du document publié.

## Livrables codés (non installés en production)

- SQL exécutable exclusivement en tests : tests/s4d3k/disposable-bulletin-workflow.sql.
- Six tables privées : versions de politiques scolaires fictives, habilitations nominatives, snapshots immuables, dossiers, audit append-only et publications (cette dernière volontairement vide).
- Deux RPC de prototype : schoolnet_bulletin_v2_prototype_open_case et schoolnet_bulletin_v2_prototype_transition.
- Grilles de sécurité : autorisation côté serveur fondée sur auth.uid(), rôle school_admin, affiliation active et permission explicite. Pas d'accès direct du navigateur aux tables.
- Contrôles d'intégrité : isolation A/B, programme scolaire approuvé, zéro numérique différent de NULL, empreinte des résultats et version du dossier, refus d'auto-approbation, clé d'idempotence et verrou SQL FOR UPDATE.
- Tests HTTP : tests/s4d3k/real-auth-workflow-http.mjs, avec 11 vrais comptes fictifs du Supabase local, dont deux administrateurs de l'école A.
- Fixtures fictives : tests/s4d3k/disposable-seed.sql. Aucun mandat d'une école réelle n'est créé.
- Workflow GitHub Actions : .github/workflows/schoolnet-s4d3k-real-auth-sql-ci.yml.

## Preuves demandées dans la CI

La CI doit démontrer de vrais INSERT/UPDATE/SELECT sous PostgreSQL et les requêtes via JWT GoTrue et PostgREST. Parmi les scénarios :
- Rejeter anonymes, enseignants, parents, établissements croisés, élèves absents et transferts ambigus.
- Accepter une moyenne publiée de 0,00/20 ; bloquer une note manquante.
- Refuser une modification des notes après un snapshot, une affiliation ou un mandat révoqué.
- Accepter une décision par un décideur distinct du demandeur, refus motivé, et autorisation séparée de diffusion.
- Empêcher les doublons idempotents et les décisions concurrentes, protéger l'audit contre UPDATE/DELETE.
- Vérifier qu'aucune publication ni fichier PDF n'est créé.

La réussite de cette CI ne constitue pas une validation de sécurité du schéma de production : le prototype utilise un **jeu de données et une structure minimale jetables**. Les validations réglementaires et politiques par établissement restent hors de ce sous-lot.

## Mise à jour Windows uniquement après CI réussie

Depuis un worktree propre :

~~~powershell
cd "D:\Bakary\10 autres\schoolnet-tests"
git status -sb
git fetch origin
git switch -c local/schoolnet-s4d3k --track origin/feature/schoolnet-s4d3k-disposable-sql-workflow-20261127
git log -1 --oneline
npm run qa:s4d3k
npm run build
git restore -- tsconfig.app.tsbuildinfo
git status -sb
~~~

Aucune recette écran nouvelle ne se justifie pour ce prototype de base jetable ; l'exécution réelle s'observe dans GitHub Actions.

## Vers la livraison de Bulletins V2

1. **S4-D.3k** : base SQL réelle et Auth/JWT sur environnement jetable.
2. **Intégration fonctionnelle** : raccorder les vrais écrans de soumission, décision et autorisation à l'API sur une préproduction isolée.
3. **Publication** : génération PDF, stockage privé, diffusion aux parents/élèves autorisés, correction et retrait.
4. **Recette et déploiement** : vérifications de sécurité, préparation de la migration principale, GO distinct, intégration des PR empilées et déploiement Vercel.

**Verrous :** aucune exécution SQL sur Supabase principal ; aucun nouveau fichier sous supabase/migrations ; aucune modification des bulletins V1 ; aucune fusion dans main ni aucun déploiement Vercel. La PR reste en brouillon.
