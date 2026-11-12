# SCHOOLNET — Lot 5.C : demandes publiques et rattachement vérifié

**Date :** 09/11/2026  
**Branche :** `feature/schoolnet-notifications` — PR #5 en brouillon  
**État au 10/11/2026 :** migration 5.C **appliquée et enregistrée** dans Supabase `schoolnet_2.0` (30 migrations) ; tests SQL transactionnels avec `ROLLBACK` **réussis** ; recette navigateur sur la branche **à réaliser**. Aucune fusion dans `main`.

## Mise à jour du 10/11/2026 — Activation et recette transactionnelle

- Migration appliquée individuellement après autorisation explicite, enregistrée sous la version exacte `20261109170500`. Le texte SQL historisé correspond au fichier GitHub (15 637 caractères), sans application de la migration indépendante `20261109140104_harden_assessment_legacy_rpcs.sql`.
- Comptages après installation puis après recette réversible : **30 migrations**, **3 demandes publiques historiques**, **2 inscriptions annuelles**, **1 lien familial**, **1 événement historique de demande**, **0 résolution durable**, aucun enregistrement fictif persistant. Cron LIVE toujours présent.
- Vérification Admin en contexte `authenticated` et deux parcours simulés (`parent_access` et `student_enrollment`) réussis dans une transaction réversible. Tests positifs : création du lien parent-enfant, synchronisation `profiles.child_ids`, changement de statut, résolution et historique, répétition sans doublon.
- Tests négatifs réussis : absence d'attestation, passage direct à `processed` sans résolution, dossier lié à un autre apprenant, rattachement contradictoire après finalisation, double utilisation d'un même dossier scolaire. Tous les changements de test ont été annulés via `ROLLBACK`.
- Les droits RLS, la politique de lecture Admin, l'interdiction `TRUNCATE` aux clients et le contrôle d'appel RPC Administrateur ont été vérifiés. L'accès par un compte Apprenant à la RPC Admin a été refusé.
- **Encore à valider :** vraie recette navigateur depuis l'interface de la branche : sélection Parent/Apprenant, dossier cohérent, saisie de note/attestation, finalisation, rafraîchissement et consultations familiales autorisées ; vérifier aussi les messages d'erreur et l'absence de doublon sur un clic répété. Un déploiement Preview ou un environnement local sur cette branche est nécessaire : `main` ne contient pas encore le panneau.
- **Restrictions maintenues :** aucune demande réelle à modifier pour la recette, pas de migration globale Supabase, pas de fusion `main`, pas de déploiement Vercel production.

---

## Historique : implémentation 5.C préparée le 09/11/2026

Le cadrage d'origine reste documenté dans les sections suivantes. Le nouvel
état du développement est précisé ici.

- **Migration** : `supabase/migrations/20261109170500_verified_public_enrollment_resolutions.sql`.
  Crée `public.public_enrollment_request_resolutions`, PK sur `request_id`,
  FK vers `profiles` et `student_enrollments`, index unique de dossier annuel,
  RLS **Admin en lecture uniquement**.
- **Finalisation atomique** : nouvelle RPC
  `public.admin_finalize_public_enrollment_request` réservée à l'Admin,
  exigeant vérification familiale attestée, note (10–1000 caractères),
  profils Parent et Apprenant valides et dossier annuel cohérent
  uniquement si la demande est une inscription. Compte désactivé refusé.
- **Création du lien familial** : si `parent_links` ne contient pas déjà
  le couple vérifié, la RPC le crée sans doublon, puis synchronise
  `profiles.child_ids` pour les autres modules (notamment la messagerie).
  Les anciens enfants liés sont conservés ; toutes les écritures sont
  annulées en cas d'échec.
- **Statut vérifié** : le lien, la résolution, `processed` et l'événement
  historique sont enregistrés ensemble. Un déclencheur bloque le statut
  « Traitée » sans preuve relationnelle. Les anciens dossiers
  `processed` ne sont pas modifiés automatiquement ; leur liaison
  peut être régularisée explicitement après contrôle.
- **Idempotence** : verrou de la demande ; appel identique retourne
  le rattachement existant sans écriture supplémentaire. Une autre cible
  est refusée ; le même dossier annuel ne peut pas justifier deux demandes
  d'inscription finalisées.
- **Sécurité complémentaire** : retrait des permissions `TRUNCATE`
  dangereuses sur `parent_links`, RLS et lecture familiale préservées.
- **Écran** : `src/features/enrollments/components/AdminRequestResolutionPanel.tsx`
  intégré à `AdminEnrollmentRequests.tsx`. Sélection de comptes existants,
  recherche par nom/e-mail, indicateur du lien parental, liste des
  inscriptions valides, note et attestation, avertissement des noms
  discordants. L'ancien bouton « Traitée » non vérifié est remplacé.
- **Avant activation SQL** : affiche « migration en attente » et bloque
  toute finalisation, tout en conservant l'examen et les statuts
  « Famille contactée » et « Refusée ».
- **Contrôle en lecture seule** :
  `supabase/verification/20261109_lot_5c_public_request_resolution_readonly.sql`
  exécuté avec succès. État actuel : 29 migrations, table/RPC 5.C absentes,
  3 demandes publiques préservées. Aucun test DDL appliqué.

**Historique au 09/11/2026 :** une autorisation explicite était alors requise
pour la migration 5.C. Cette autorisation a depuis été reçue et la migration a été appliquée le 10/11/2026. La migration `20261109140104` sur les corrections
reste non autorisée : **ne pas faire de `supabase db push --remote` global**.
Aucune fusion `main` ni déploiement Vercel n'a eu lieu.

---

## 1. Socle déjà présent à réutiliser

- Site public : `PublicEnrollmentRequest.tsx`, formulaire à deux motifs :
  `student_enrollment` (demande d'inscription d'un enfant) et
  `parent_access` (demande d'accès Parent/Tuteur).
- Administration : `AdminEnrollmentRequests.tsx`, recherche, filtres,
  détail, notes et états `new`, `contacted`, `processed`, `rejected`.
- RPC `admin_review_public_enrollment_request` vérifie `auth.uid()`
  et `is_admin()`, puis met à jour l'état avec événement d'historique.
  **Il ne crée ni compte Auth, ni lien Parent/Enfant, ni inscription scolaire.**
- Administration → Utilisateurs : flux de création ou identification des comptes.
- Administration → Inscriptions : dossier annuel `student_enrollments`,
  numéro automatique, classe, année, statut, historique et pièces privées (5.B).
- Liens parentaux `parent_links` : relation vérifiée et utilisée dans les
  politiques RLS du Lot 5.A.
- **Audit anonymisé de la base** : 3 demandes publiques
  (2 `parent_access/new`, 1 `student_enrollment/rejected`),
  2 dossiers annuels, 1 lien parent-enfant. Aucune demande d'inscription
  acceptée en attente de liaison au moment du contrôle.
  **Ne pas utiliser les demandes existantes pour une recette mutative.**

## 2. Problème à résoudre

L'action actuelle **« Traitée »** demande à l'agent de confirmer qu'il a
réalisé les étapes, mais enregistre seulement un statut. Elle ne fournit
**aucune preuve relationnelle en base** du compte créé/identifié, de
l'apprenant retenu, du Parent/Tuteur vérifié ou du dossier annuel.

Il faut distinguer :
1. **La demande reçue** (objet `public_enrollment_requests`) ;
2. **La vérification administrative** (identité, relation familiale) ;
3. **Les comptes existants dans Auth/Profiles** ;
4. **Le rattachement familial** dans `parent_links` ;
5. **L'inscription annuelle réelle** dans `student_enrollments` ;
6. **Le traitement terminé et traçable**, sans doublons.

Une demande publique ne doit jamais devenir automatiquement un utilisateur
authentifié sur la seule base d'un nom, téléphone ou courriel déclaré.

## 3. Workflow proposé — deux chemins distincts

### A. Demande `student_enrollment`

1. Le visiteur soumet sa demande : état `new`, référence `DEM-...`.
2. L'administration examine la demande, contacte le responsable et
   passe éventuellement à `contacted`.
3. Après vérification de l'identité et de l'autorité parentale,
   l'administrateur **sélectionne ou crée via le module Utilisateurs**
   les comptes Parent/Tuteur et Apprenant nécessaires. Aucun compte
   n'est créé directement par l'ouverture ou l'acceptation d'une demande.
4. L'administrateur vérifie/établit le lien `parent_links`, puis
   **sélectionne ou crée via le module Inscriptions** le dossier
   annuel correspondant et sa classe (sans dupliquer les lignes).
5. Une action unique **« Finaliser et rattacher »** enregistre la preuve
   relationnelle `request_id + parent_id + student_id + enrollment_id`
   et place la demande à `processed` dans une transaction contrôlée.
6. Le dossier conserve son numéro et les notifications existantes.
   Les éventuels événements de traitement restent auditables.

### B. Demande `parent_access`

1. Vérifier le responsable et identifier l'enfant existant.
2. Identifier/créer le compte Parent, contrôler la relation légale
   et établir le lien `parent_links`.
3. **Finaliser et rattacher** avec `request_id + parent_id + student_id`.
   Un dossier annuel n'est **pas** exigé : la demande porte sur l'accès
   du Parent, et non sur l'inscription de l'enfant.
4. Afficher dans l'administration le compte et l'enfant liés.

## 4. Garanties attendues du backend

- Préparer une migration dédiée après validation du workflow :
  table de résolution (nom à déterminer), `request_id` unique + clés
  étrangères réelles vers `profiles` et éventuellement
  `student_enrollments`. Contrôle des rôles Parent/Apprenant.
- Fonction transactionnelle **réservée à l'Admin** : vérifier type,
  statut, existence de la relation `parent_links`, cohérence du dossier
  `enrollment_id.student_id = student_id` et absence de résolution
  concurrente ou dupliquée ; rejeter la finalisation en cas d'incohérence.
- Inscription nouvelle : un dossier annuel valide doit exister.
  Demande Parent : pas d'inscription créée par la finalisation.
- Ne pas exposer les informations de contact publiques aux espaces
  Parent/Apprenant ou aux rôles Enseignant.
- Ne jamais se baser **uniquement** sur l'e-mail, le numéro de téléphone,
  le prénom ou le nom pour affirmer la relation parentale.
- Traiter les dossiers `processed` historiques sans écraser leur statut.
  Une résolution manquante se signale comme **rattachement à vérifier**.
- Toute finalisation doit être idempotente : nouveau clic identique ne
  crée pas un deuxième dossier/lien ; nouvelle cible différente doit être
  refusée ou imposer une correction auditée.
- Préserver la gestion des refus et l'historique actuels ; aucun
  changement silencieux des demandes de la base existante.

## 5. Écran administratif à préparer

Dans **Demandes publiques → Détail** :

- Afficher la demande, son type et son statut actuel.
- Zone distincte **« Rattachement vérifié »** pour rechercher des
  comptes existants, vérifier les liens et, seulement pour
  `student_enrollment`, sélectionner l'inscription annuelle.
- Raccourcis « Utilisateurs » et « Inscriptions » conservés.
- Bouton « Finaliser et rattacher » activé seulement une fois les
  vérifications de cohérence validées côté serveur.
- Afficher les comptes/dossiers liés, la date et l'auteur de la
  finalisation. Ne pas ajouter de données sensibles dans les URL.
- Un refus reste indépendant et ne crée aucun compte ou dossier.

## 6. Tests ciblés futurs

- Demande fictive de nouvelle inscription, association aux comptes
  vérifiés et au dossier annuel ; confirmer le même numéro et l'absence
  de doublons.
- Demande fictive de Parent/Tuteur, rattachement à un enfant existant
  **sans créer d'inscription annuelle**.
- Contre-exemples : parent non lié, dossier appartenant à un autre enfant,
  compte du mauvais rôle, double clic, traitement concurrent, accès
  Enseignant/Parent/Apprenant à l'API de finalisation.
- Vérifier l'historique existant, les notifications et la
  non-régression des inscriptions familiales.
- Aucun changement sur les 3 demandes publiques historiques pendant
  les tests, sauf autorisation spécifique.

## 7. Sécurité et étapes de livraison

1. Valider le workflow **avant** de le coder ; c'est une décision
   métier, pas une simple évolution technique.
2. Préparer une migration SQL et une vérification réversible
   `BEGIN ... ROLLBACK` sur la branche.
3. Implémenter l'écran et l'API sans écrire dans la base réelle.
4. Lint, build, revue RLS, autorisation SQL spécifique, application
   individuelle et recette ciblée avec comptes et demandes fictifs.
5. **Ne pas exécuter `supabase db push --remote` global** :
   `20261109140104_harden_assessment_legacy_rpcs.sql` (corrections)
   reste non autorisée.
6. Ne fusionner ni déployer sans validation des lots.

**Aucun logiciel de paiement, email automatique ou provisioning Auth
automatique n'est introduit dans ce sous-lot.**
