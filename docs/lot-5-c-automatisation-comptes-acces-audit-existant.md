# SCHOOLNET — Lot 5.C : automatisation des inscriptions et des accès
## Audit de l'existant et périmètre strict, 10 novembre 2026

**État : audit terminé ; aucun code d'automatisation nouvellement déployé.**
**Branches :** PR #5 `feature/schoolnet-notifications` (base main) et PR #6 `feature/schoolnet-multi-etablissements` (base PR #5), toutes deux ouvertes et en brouillon.
**Principe directeur :** SCHOOLNET est déjà une plateforme d'apprentissage en ligne fonctionnelle. **Automatiser les tâches administratives manuelles**, sans créer une nouvelle application, un autre système de classes ou un module dédié aux cours à domicile.

## 1. Ce qui existe déjà — NE PAS REFAIRE

| Existant | Fichiers ou fonction | Usage |
| --- | --- | --- |
| Inscription publique | `src/features/public/pages/PublicEnrollmentRequest.tsx` et `supabase/functions/public-enrollment-request/index.ts` | Dépôt de demande, Cloudflare Turnstile, référence, types `student_enrollment` et `parent_access` |
| Gestion des demandes | `src/features/admin/pages/AdminEnrollmentRequests.tsx` | Consultation, recherche, refus, contact famille, fiche détaillée |
| Validation sécurisée | `src/features/enrollments/components/AdminRequestResolutionPanel.tsx` et RPC `admin_finalize_public_enrollment_request` | Contrôle Parent/Apprenant, lien familial, idempotence et preuve du traitement |
| Gestion des comptes | `src/features/admin/pages/AdminUsers.tsx` et Edge `admin-create-user` | Création Admin de profils avec rôle, coordonnées, classe éventuellement |
| Invitations sans mot de passe connu | `src/features/admin/pages/AdminSchoolInvitations.tsx` et Edge `schoolnet-admin-invitation` | `auth.admin.generateLink`, lien temporaire, e-mail préparé pour envoi MANUEL, déclaration de l'envoi |
| Activation | `src/features/auth/pages/ResetPasswordPage.tsx` | Choix du mot de passe puis nouvelle connexion |
| Classes et enseignants | `src/features/admin/pages/AdminClasses.tsx`, tables `classes`, `class_students`, `class_teachers` | Classes/niveaux déjà présents, apprenants et enseignants affectés |
| Inscription liée à la classe | RPC `admin_assign_student_to_class`, qui appelle `admin_upsert_student_enrollment` | Synchronise `class_students`, dossier annuel `student_enrollments` et classe du profil selon l'année |
| Cours/visio/devoirs/évaluations et suivi parental | Routes et composants existants | **Ne pas redévelopper.** Un répétiteur autorisé utilise déjà le rôle Enseignant et les outils distanciels |

## 2. Point de friction exact

Actuellement, `AdminRequestResolutionPanel` exige avant validation :
1. Un **compte parent** existant ;
2. Un **compte apprenant** existant ;
3. Pour `student_enrollment`, un **dossier annuel** existant, actif ou terminé ;
4. Une **attestation du lien familial** et une note.

L'administrateur doit donc quitter la demande pour créer les comptes dans « Utilisateurs », ajouter la classe / le dossier, puis revenir choisir les identifiants. Le composant ne crée actuellement ni compte Auth ni inscription.

Parallèlement, `admin-create-user` exige un **mot de passe temporaire fourni par l'administrateur**, alors que l'invitation d'administrateur local a déjà prouvé un chemin mieux adapté : le destinataire définit lui-même son mot de passe.

**Attention au vocabulaire :** le type public `student_enrollment` est un nom de code historique ; l'expérience « rejoindre SCHOOLNET et sa classe » ne doit pas être présentée comme une demande d'adhésion à un établissement.

## 3. Contrôles techniques effectivement réalisés

**Supabase, en lecture seule au 10/11/2026 :**
- 34 migrations appliquées ; 4 demandes publiques ; **0 demande finalisée** avec résolution ; 2 classes ; 2 élèves affectés ; 2 enseignants affectés ; 2 inscriptions annuelles existantes ;
- Migration 5.C `20261109170500` présente et active ;
- 2 établissements et 1 responsable local ; SQL S2-A / S2-B et migration 5.D non activés ;
- Edge Functions `public-enrollment-request`, `admin-create-user` et `schoolnet-admin-invitation` **ACTIVE** ;
- `public_enrollment_request_resolutions` est contrainte à exiger `enrollment_id` pour `student_enrollment` et à l'interdire pour `parent_access` ;
- `admin_assign_student_to_class` fait déjà appel à `admin_upsert_student_enrollment`. **Ne pas dupliquer le rattachement en INSERT direct côté frontend.**

**GitHub :** PR #5 contient 110 commits, PR #6 ajoute 74 commits à sa base ; `main` non fusionnée. Les contrôles lint/build sur la dernière branche sont réussis. Vercel signale une limitation de fréquence de déploiement sur le dernier commit — la dernière Preview n'est pas garantie au même SHA.

## 4. Nouveau workflow cible — seulement les tâches manuelles à automatiser

```text
Demande publique reçue
  ↓
Administrateur SCHOOLNET : ouvrir la demande
  ↓
Assistant : rechercher comptes existants par e-mail / identité interne
  ↓
Administrateur : vérifier identité et lien familial (obligatoire)
  ↓
Assistant : réutiliser ou préparer les comptes manquants
  ↓
Assistant : proposer une classe existante du niveau demandé
  ↓
Administrateur : confirmer la classe, sans affectation automatique aveugle
  ↓
SCHOOLNET : appeler la fonction existante d'affectation/dossier
  ↓
SCHOOLNET : finaliser la demande + lien parent-enfant vérifié
  ↓
SCHOOLNET : préparer les liens d'activation et deux messages personnalisés
  ↓
Administrateur : envoyer les messages depuis sa messagerie et déclarer l'envoi
  ↓
Parent et apprenant : choisir le mot de passe et se connecter
```

**Une seule fiche, un seul assistant, pas de navigation forcée vers trois modules.**
Le traitement doit être **rejouable** : une coupure entre Auth et Postgres ne doit pas effacer la demande ni créer un deuxième compte.

### Ce que l'assistant peut automatiser

- Recherche de comptes et préremplissage, sans fusionner des homonymes ;
- Préparation sécurisée d'un compte nouveau après l'approbation humaine, sans mot de passe temporaire partagé ;
- Réutilisation des RPC de classes et dossiers existantes, idempotence et suivi d'étape ;
- Génération du message avec un **objet d'e-mail**, bon destinataire et lien temporaire ;
- Un suivi clair : compte prêt, invitation préparée, envoi déclaré, activation vérifiée ;
- Renvoi d'un lien expiré avec limitation de fréquence ; ne jamais enregistrer le jeton en clair dans l'historique.

### Ce que l'assistant NE DOIT PAS faire

- Approuver automatiquement la demande dès la réception publique ;
- Rattacher un parent à un enfant sur leur seul nom, numéro ou e-mail ;
- Réutiliser telle quelle la fonction `schoolnet-admin-invitation` pour les familles : elle est réservée au rôle `school_admin` et exige une école. **Réutiliser le modèle de sécurité et d'invitation, pas ses privilèges.**
- Créer une deuxième classe ou déplacer arbitrairement un élève existant ;
- Appliquer une migration 5.D / S2 dans ce chantier ;
- Confondre « invitation préparée », « envoyée », « reçue » et « activée ».

## 5. Cas particuliers à traiter sans élargir le chantier

| Situation | Règle |
| --- | --- |
| Parent et apprenant déjà inscrits | Réutiliser les comptes après contrôle de rôle, identité et lien |
| Parent nouveau, apprenant nouveau, chacun possède son e-mail | Préparer 2 accès distincts par invitation, sans mot de passe partagé |
| Enfant mineur sans e-mail propre | **Ne pas inventer d'adresse fictive ou réutiliser celle du parent pour deux comptes Auth.** Le profil d'accès de l'enfant devra être décidé et testé avant l'automatisation de ce cas |
| Accès Parent à un enfant déjà inscrit | Même contrôle familial ; **aucun nouveau dossier annuel** |
| Demande scolaire d'un établissement | Plus tard : appliquer l'assistant avec une école autorisée et l'administrateur local, sans élever son rôle en Admin central |
| Répétiteur utilisant SCHOOLNET à distance | Compte Enseignant créé/activé par administration ; élèves inscrits et affectés ; **aucun module spécial domicile** |

## 6. Découpage de réalisation, un bloc testé à la fois

**5.C-A — Assistant de reconnaissance (première étape de code).**
- Lire la demande en cours, rechercher les comptes correspondants **avec les services existants et l'authentification Admin**, proposer la classe du niveau ; afficher les divergences et avertissements.
- Aucune création réelle de compte, classe, inscription ou lien familial pendant ce premier test.
- **Recette :** une demande fictive affiche les informations connues, les comptes plausibles et les classes existantes ; aucune donnée de production modifiée.

**5.C-B — Préparer comptes et invitations sans mot de passe manuel.**
- Nouvelle opération serveur administrateur **spécifique aux familles** (ne pas modifier l'Edge d'invitation des écoles), réutilisant le schéma `generateLink` et le parcours de mot de passe existant.
- Traitement idempotent et reprise explicite après erreur Auth/SQL, avec journal limité au nécessaire.
- **Recette :** invitation parent/apprenant, activation sécurisée et aucune promotion de rôle.

**5.C-C — Relier l'affectation et la finalisation.**
- Réutiliser `admin_assign_student_to_class` et `admin_finalize_public_enrollment_request`. Vérifier leur ordre, les conséquences sur l'année et le statut ; **ne pas faire deux opérations non atomiques sans mécanisme de reprise**.
- Recette avec parent déjà inscrit, nouvelle famille, double clic, compte déjà existant et refus.
- Si une adaptation SQL de 5.C est réellement nécessaire, préparer une migration distincte, testée en `BEGIN ... ROLLBACK`, **puis solliciter une autorisation explicite avant toute application durable**.

**5.C-D — Envoi manuel assisté et suivi.**
- Objet + corps + destinataire + lien temporaire, « Copier », « Ouvrir la messagerie », « Envoi déclaré », « Régénérer ».
- **Recette :** activation, connexion, Parent lié au bon apprenant, accès Enseignant/Apprenant, aucun dossier étranger ; vérification spam/objet de l'e-mail.

**Ensuite seulement :** reprise du chantier des administrateurs d'établissements et de leurs classes (PR #6/S2), puis 5.D et les lots futurs. Les outils existants de cours, LIVE et évaluations restent inchangés.

## 7. Points de blocage à traiter avant mise en service

1. L'authentification actuelle exige une adresse e-mail unique pour chaque compte. L'absence d'e-mail de l'enfant est un **cas métier** à résoudre proprement, sans mot de passe visible par l'administration.
2. `admin_assign_student_to_class` enregistre aussi un dossier annuel existant dans le modèle SCHOOLNET. **Préserver ce comportement pour le premier pilote ; ne pas entreprendre une refonte des dossiers.**
3. Les classes et années scolaires actuellement enregistrées doivent être contrôlées avant une affectation réelle (état futur / année courante).
4. `admin-create-user` et la résolution 5.C existante ne constituent **pas un mécanisme transactionnel partagé** avec Supabase Auth. Nécessité de reprise, de non-duplication et d'une journalisation contrôlée.
5. **La sécurité RLS, les rôles Admin/Enseignant/Parent/Apprenant et les permissions des établissements doivent être testés**, y compris les demandes non autorisées et la visibilité croisée.

## 8. Bornes des autorisations

**Autorisé pour ce sous-lot :** audit du code et de Supabase en lecture seule, conception et code préparatoire sur une branche de travail ; tests non persistants.
**Non autorisé sans nouvel accord spécifique :** créer des utilisateurs réels, envoyer des invitations, finaliser une demande en base, appliquer une migration, fusionner `main`, déployer en production ou supprimer/modifier des données existantes.

**Prochaine action de développement :** réaliser le bloc **5.C-A reconnaissance** sur le module déjà existant « Demandes publiques », avant tout mécanisme d'écriture.
