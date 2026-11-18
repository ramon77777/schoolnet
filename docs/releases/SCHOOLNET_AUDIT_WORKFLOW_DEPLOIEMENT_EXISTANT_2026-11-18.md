# SCHOOLNET — Audit du workflow de livraison existant et du sandbox facultatif

**Date : 18 novembre 2026 — audit et documentation uniquement.**
**Aucun déploiement, création de ressource, migration ou modification de données autorisé par ce rapport.**

## Décision de continuité

La méthode historique validée par le porteur de projet est conservée :

1. Développer et sauvegarder sur une branche GitHub ;
2. Synchroniser le poste Windows par `git pull --ff-only` ;
3. Vérifier localement les interfaces, scénarios automatisés, ESLint et compilation ;
4. Recevoir la validation explicite de la recette locale ;
5. Avec **autorisation distincte**, intégrer les commits contrôlés dans le circuit Git de production et **déployer sur le projet Vercel `schoolnet` EXISTANT** ;
6. Recetter en ligne le module publié et consigner ses résultats, puis poursuivre le lot suivant.

**Un nouveau projet Vercel n'est PAS requis pour ce workflow.**
Les prévisualisations Vercel automatiques sont utiles pour vérifier le rendu
mais les opérations scolaires S2-B à S3-C sont intentionnellement bloquées
en écriture hors du domaine officiel.

## Constat GitHub / Vercel en lecture seule

- Projet Vercel **existant** : `schoolnet`, domaine officiel
  `https://schoolnet-snowy.vercel.app`.
- Les déploiements **Production** observés utilisent `main` ; dernier déploiement
  Production READY relevé : **13 novembre 2026**, commit
  `07a2a2c76fed9e0c7c9a54c732036d2d328cba86`.
- La branche en cours est
  `feature/schoolnet-s2a-classes-tenant-qa` (au début de cet audit :
  `e36135995dca513c95b4b96852760619bbdb205f`).
- **PR n° 14** : ouverte en brouillon, branche cible
  `integration/schoolnet-lot5c-local-first`, **pas `main`**.
  Toute publication officielle doit donc étudier le chemin
  d'intégration vers `main`, et non fusionner sans examen.
- Les nouveaux fichiers
  `LocalSchoolTeachers.tsx`, `LocalSchoolStudents.tsx`,
  `LocalSchoolAssignments.tsx` et
  `schoolClassWritePolicy.ts` sont présents sur la branche de travail
  **mais absents de `main`** lors de cette vérification.
  La page `LocalSchoolClasses.tsx` existe sur les deux branches mais
  diffère. Cela confirme que le frontend des lots récents n'est
  pas encore publié via la branche Production.

## Pourquoi les écritures ne marchent pas en local / Preview

`src/features/schools/lib/schoolClassWritePolicy.ts` impose simultanément :

- origine exacte `https://schoolnet-snowy.vercel.app` ;
- URL du **Supabase principal** `https://anttmbhaphkhmkoqsofd.supabase.co` ;
- build Vite en mode Production.

Les politiques classes, enseignants, élèves et affectations utilisent
ce contrôle. Les procédures SQL imposent en plus les droits du rôle,
l'appartenance à l'établissement et des contrôles d'origine côté serveur.

Ce choix interdit l'écriture depuis `localhost` et depuis les URL
Preview Vercel ; il **n'empêche pas la publication contrôlée sur
le Vercel existant**. La validation locale porte donc sur le rendu,
les accès en lecture, les tests statiques et la compilation.
Les écritures fonctionnelles réelles doivent être vérifiées sur
le domaine officiel après publication et sous contrôle métier.

**Attention :** les tests de création en Production touchent la
base de données réelle. Aucune opération de test destructrice,
aucun compte/élève réel réaffecté et aucune mutation de production
sans stratégie de sauvegarde, identifiants de test prévus et
autorisation expresse. Les journaux d'audit peuvent persister.
Un rollback Vercel ne restaure pas automatiquement le contenu SQL.

## Audit rapide de compatibilité du sandbox Auth préexistant

- Supabase principal `schoolnet_2.0` : **73 tables publiques**,
  tables classes/niveaux/années/matières/affiliations et tables
  d'affectations S3-C présentes.
- Projet `schoolnet-auth-sandbox` : **8 tables publiques**, **22 comptes
  Auth**, **18 profils**, **7 migrations**, 0 objet Storage lors de l'audit.
- Ce projet sandbox contient des modules Auth et famille,
  **mais pas** les tables `schoolnet_schools`,
  `schoolnet_school_memberships`, `classes`, `levels`,
  `school_years`, `academic_subjects` ni les affectations S3-C.
- Il **n'est pas un clone pédagogique** de la production et n'est pas
  immédiatement compatible avec une recette scolaire S2-B à S3-C.
- Il est maintenu intact et reste facultatif, en cas de besoin
  ultérieur de tests destructifs/isolés. Ne pas y appliquer
  les migrations de production sans audit approfondi des dépendances,
  des comptes Auth, des politiques RLS et de leurs données.
- Le Supabase principal et le sandbox ne sont pas fusionnés.

## Contrôle à effectuer AVANT la prochaine publication sur le Vercel existant

1. Examiner la différence de la branche `feature/...` vers
   `integration/schoolnet-lot5c-local-first` puis vers `main`.
   Déterminer le lot exact à publier et résoudre les conflits sans
   écraser des travaux historiques.
2. Confirmer l'état des migrations déjà installées S2-A, S2-B,
   S3-A, S3-B et S3-C : **ne pas rejouer les SQL** et ne pas lancer
   `supabase db push` sur principal.
3. Exécuter en local :
   `qa:s2b`, `qa:s3a`, `qa:s3b`, `qa:s3c`,
   `qa:e2e:readiness`, `qa:sandbox:prepare`,
   puis `lint` et `build`.
   Les captures antérieures confirment 15/15 S3-C, 16/16
   préparation E2E, 17/17 préparation sandbox. La prochaine recette
   de publication devra réutiliser un commit gelé.
4. Examiner le statut des contrôles GitHub/Vercel et la configuration
   du domaine, sans révéler de secrets ni changer les variables.
5. Préparer un plan de rollback **frontend** Vercel, et une sauvegarde
   et procédure de traitement des données d'essai Supabase.
   **Aucune sauvegarde complète récente n'est attestée ici.**
6. Demander la **permission explicite** avant chaque merge/promotion
   Vercel et avant chaque scénario en ligne avec écriture.
7. Après publication, tester les quatre parcours en ligne avec le
   rôle `school_admin`, vérifier l'absence de régression
   élèves/enseignants/classes/affectations et les droits multi-écoles.

## À ne pas faire maintenant

- Aucun second projet Vercel ni nouvelle instance Supabase.
- Aucune modification du domaine officiel ni des garde-fous SQL.
- Aucun merge de PR n° 14 vers une branche de release sans examen.
- Aucune migration, écriture SQL, mutation Auth ou données scolaires.
- Aucun déploiement Vercel Production sans accord séparé.

**Conclusion :** la solution la plus simple pour maintenir le rythme
validé est de reprendre **sur le Vercel `schoolnet` actuel** après
recette locale et contrôle du chemin `feature → intégration → main`.
Le sandbox Auth reste une option complémentaire et non un prérequis
à cette mise en ligne.
