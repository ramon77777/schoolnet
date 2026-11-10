# SCHOOLNET 2.0 — Lot S2-B
## Formulaire local des classes et création sécurisée côté Supabase

**Date : 10 novembre 2026.**  
**Branche :** \`feature/schoolnet-multi-etablissements\` — PR #6 en brouillon, base \`feature/schoolnet-notifications\`.  
**Statut :** **Implémenté sur GitHub et testé en transactions SQL ROLLBACK — NON ACTIVÉ dans Supabase.**

## Parcours utilisateur livré

- \`/app/school/classes\` : route accessible seulement au rôle \`school_admin\`, depuis le menu local **Classes** et le tableau de bord local.
- Établissement pré-sélectionné parmi les écoles actives autorisées par les RLS existantes ; possibilité de choisir parmi plusieurs écoles réellement autorisées.
- Formulaire : nom de la classe, niveau et année scolaire. L'année doit être choisie explicitement (aucune année supposée, car l'état actuel des années scolaires est en cours de reprise).
- Répertoire des classes officielles de cette école uniquement, avec nom, niveau et année, sans accès aux élèves ni aux enseignants.
- Erreurs compréhensibles, notamment code \`23505\` (doublon dans la même école), \`42501\` (droits insuffisants) et \`22023\` (paramètre invalide).
- **Fail-closed :** tant que la fonction de catalogue n'existe pas sur Supabase, l'interface indique « Activation du module en attente », affiche le formulaire désactivé et n'envoie aucune création.
- Mode démo en lecture seule ; aucune classe de démonstration fictive n'est enregistrée automatiquement.

## Fichiers frontend

1. \`src/features/schools/lib/schoolClassesApi.ts\` : appels RPC Supabase, lecture des classes filtrées par établissement **et protégées par RLS**, validation du catalogue, gestion des réponses de migration non appliquée.
2. \`src/features/schools/pages/LocalSchoolClasses.tsx\` : écran premium, champs de création, liste, sélection école, états pending/ready/error et messages.
3. \`src/routes/router.tsx\` : route \`school/classes\` dans le \`RoleGate allowed={["school_admin"]}\`.
4. \`src/layouts/DashboardLayout.tsx\` et \`src/features/schools/pages/LocalSchoolDashboard.tsx\` : accès depuis menu et tableau de bord.

Le formulaire global \`AdminClasses.tsx\` n'est **pas réutilisé** pour les écoles, car il sélectionne encore des profils et des affectations globaux. Aucun accès local à l'ancien module n'est ouvert.

## Schéma serveur proposé (non déployé)

**Prérequis non encore activé :** \`supabase/proposals/s2_school_classes_tenant_foundation.sql\` (Lot S2-A). Il introduit \`classes.school_id\`, \`learning_context\`, l'unicité par école/année et une RLS SELECT limitée à l'école.

**Nouveau fichier :** \`supabase/proposals/s2b_school_class_rpc_and_catalog.sql\` (Lot S2-B).

Deux fonctions publiques **SECURITY INVOKER** servent d'interface Data API :
- \`public.schoolnet_school_class_catalog(p_school_id uuid) RETURNS jsonb\` : écoles autorisées uniquement ; renvoie une liste limitée des niveaux et des années scolaires nécessaires au formulaire ;
- \`public.schoolnet_school_create_class(p_school_id uuid,p_level_id bigint,p_school_year_id uuid,p_name text) RETURNS uuid\` : création atomique, normalisation du nom, vérification du niveau et de l'année, blocage des doublons par index par école.

Les opérations sensibles et leurs contrôles se trouvent dans deux fonctions **SECURITY DEFINER du schéma privé non exposé** :
- \`schoolnet_private.local_school_class_catalog\` ;
- \`schoolnet_private.local_school_create_class\`.

**Le corps des fonctions privées vérifie à chaque appel :**
1. \`auth.uid()\` non nul et \`profiles.role='school_admin'\` via \`get_my_role()\` ;
2. \`schoolnet_private.is_school_admin_for(p_school_id)\` : école active, appartenance active, rôle local actif dans le profil ;
3. validité du niveau et de l'année, nom entre 2 et 100 caractères, caractères de contrôle refusés ;
4. création forcée avec \`learning_context='school'\`, \`school_id\` de l'école autorisée et \`school_year_id\` validé.

Aucune policy \`INSERT/UPDATE/DELETE\` directe n'est ouverte pour \`school_admin\` sur \`public.classes\`. La liste des classes passe directement par la RLS S2-A, le filtre frontend ne représentant **jamais** une frontière de sécurité.

L'action \`school_class_created\` est ajoutée à la contrainte existante de \`public.schoolnet_school_audit\` et journalise l'ID de l'école et l'acteur, dans la transaction de création. Aucun droit global \`is_admin()\` n'est attribué au rôle local.

L'exécution des nouvelles fonctions est explicitement refusée à \`anon\` et autorisée uniquement à \`authenticated\` avec contrôle métier dans le code SQL. Le schéma privé ne doit pas être ajouté à la liste des schémas exposés de PostgREST.

## Recette réalisée en transaction annulée

**Fichier :** \`supabase/verification/20261110_s2b_school_class_rpc_rollback.sql\`.

Évaluation réelle dans Supabase :
\`BEGIN; <proposition S2-A>; <proposition S2-B>; <assertions S2-B>; ROLLBACK;\`

**Tests passés :**

- Le compte administrateur de l'école A reçoit le catalogue et crée une classe officielle **dans A uniquement**.
- Il ne peut ni consulter le catalogue ni créer une classe dans l'école B.
- Une deuxième création identique dans A est refusée par l'index unique.
- Un niveau inexistant et une année inexistante sont rejetés.
- L'action \`school_class_created\` est bien ajoutée au journal dans la transaction.
- Les comptes enseignants, apprenants, parents et même Super Administrateur ne peuvent pas se faire passer pour \`school_admin\` afin d'utiliser **ces RPC locales**.
- Après **révocation temporaire de l'appartenance**, le même administrateur perd immédiatement l'accès aux classes.
- Après **suspension temporaire de l'établissement**, même refus d'accès.
- Les classes et années historiques restent inchangées.

**Toutes les opérations fictives ont été annulées avec \`ROLLBACK\`.** Il n'y a aucun changement durable de schéma, de compte, d'invitation, d'appartenance, de classe ou d'établissement.

## Conditions avant activation

1. Autorisation distincte de l'utilisateur pour les **deux propositions SQL S2-A et S2-B**, dans cet ordre, avec migrations versionnées et sans \`supabase db push --remote\` global.
2. Contrôles des dépendances \`classes\`, index uniques historiques et anciennes insertions directes ; vérifier l'absence d'écriture non maîtrisée côté Super Admin.
3. Vérification de l'URL Preview, code frontend et CI, puis test navigateur sur le compte local déjà créé.
4. Après activation, tester la création réelle d'une classe fictive dans A, la visibilité limitée à A et le refus des doublons dans une même école.
5. **Ne pas ouvrir encore** les affectations élèves/enseignants, les notes, bulletins, présences et documents : ces tables dépendent d'autres RLS à finaliser dans les lots suivants.

**Situation actuelle :** 34 migrations déjà appliquées, deux écoles, deux classes historiques. PR #6 en brouillon ; \`main\` et Vercel Production inchangés.
