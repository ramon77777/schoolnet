# SCHOOLNET — WORKFLOW COMPLET DE DÉVELOPPEMENT POST-V1
## Édition consolidée V2.2 : inscriptions automatisées, établissements et continuité en local

**Mise à jour : 10 novembre 2026.** **Statut : document directeur de pilotage.**  
**Source métier originelle :** « Workflow_complet_SchoolNet_post_V1(7).pdf », édition d'octobre 2026, 19 pages, version V1.0.0. Ses **Lots 0 à 8, les dépendances et la méthode de recette sont préservés**.  
**Sources techniques :** GitHub ramon77777/schoolnet, PR #5 et #6, audit du Lot 5.C, dossiers des établissements, sécurité S1, proposition S2 et passage d'année 5.D.  
**Guide opératoire associé :** [Synchronisation GitHub, branche locale et tests sans Vercel](./guide-synchronisation-et-tests-local-schoolnet.md).

> **OBJECTIF.** SCHOOLNET est déjà une plateforme d'apprentissage en ligne fonctionnelle. **Nous n'en reconstruisons pas la pédagogie.** Nous achevons l'automatisation des inscriptions et des identifiants, puis étendons les outils existants aux établissements partenaires, avec une administration et des données isolées par école. Les répétiteurs à distance sont des **enseignants SCHOOLNET** qui utilisent les cours, LIVE, devoirs et évaluations existants. Aucun « nouveau module de cours à domicile » n'est ouvert.

---

## 1. Positionnement de SCHOOLNET et périmètre fonctionnel

### 1.1. Fonctionnement historique, à préserver

Un apprenant ou son parent demande l'accès. L'Administration SCHOOLNET vérifie la demande, prépare les comptes et les identifiants, regroupe les apprenants **par niveau dans les classes existantes**, affecte les enseignants autorisés et ouvre l'accès aux cours, devoirs, évaluations, classes virtuelles, LIVE, résultats et suivi familial.

**Problème réel à résoudre :** la phase **validation → préparation des comptes → rattachement Parent/Apprenant → invitation → première connexion** demande trop de manipulations manuelles. Le but est un **assistant administratif supervisé**, pas une nouvelle plateforme.

### 1.2. Évolution : établissements scolaires partenaires

SCHOOLNET conserve sa communauté d'**apprenants libres** et accueille en parallèle des écoles ayant leurs propres classes et leurs propres administrateurs. Le **Super Administrateur SCHOOLNET** conserve le pilotage global ; chaque **administrateur d'établissement** ne gère que les données de ses écoles autorisées.

**Un seul moteur pédagogique** pour tous les parcours : comptes, cours, enseignements à distance, quiz, devoirs, examens et résultats sont réutilisés. Les écoles ajoutent un **contexte organisationnel vérifié**, pas une application supplémentaire.

### 1.3. Répétiteurs et soutien à distance

Les répétiteurs reçoivent un compte Enseignant après validation par l'administration, et leurs élèves sont inscrits comme apprenants SCHOOLNET puis affectés dans les classes ou cours autorisés. Ils peuvent enseigner à distance via les fonctions déjà présentes. Un éventuel catalogue commercial « cours à domicile » est **hors périmètre actuel**.

### 1.4. Acteurs et frontières de sécurité

| Acteur | Missions / accès | Limites |
| --- | --- | --- |
| Super Administrateur SCHOOLNET (role admin actuel) | Gouvernance, utilisateurs, demandes publiques, référentiels, création d'écoles et délégation locale | Validation humaine des demandes sensibles, audit |
| Administrateur d'établissement (school_admin) | Informations, inscriptions, classes et personnel **de l'école autorisée**, progressivement selon les modules activés | Jamais de droits admin centraux, pas de lecture des autres écoles |
| Enseignant | Classes / cours affectés, LIVE, devoirs, évaluations et corrections | Pas de droits sur une classe ou une école non affectée |
| Apprenant | Cours, activités, progression et informations personnelles | Données de ses propres parcours et classes |
| Parent / Tuteur | Inscrire ou demander accès, suivre ses enfants après lien familial vérifié | Ne voit pas les enfants d'un autre responsable |

**Vérification obligatoire par RLS/serveur**, pas seulement par le menu React. Réutiliser les comptes Auth existants, sans recréer un compte par établissement.

---

## 2. Socle SCHOOLNET déjà disponible — non-régression

L'ancien workflow (pages 2–3) qualifie la V1 de fonctionnelle avec les quatre espaces **Administration, Enseignant, Parent/Tuteur et Apprenant**. Les développements post-V1 ont étendu ce socle.

| Périmètre | Fonctionnalités existantes à conserver |
| --- | --- |
| Site public | Accueil, Bibliothèque, Niveaux, Tarifs, À propos, Contact, CMS, demandes publiques |
| Apprenant | Connexion, cours, devoirs, quiz, examens, notes, moyennes, progression, messagerie, espace de classe |
| Enseignant | Cours, classes et affectations, évaluations, corrections, moyennes, messagerie, espace de classe, LIVE |
| Parent/Tuteur | Enfants liés, résultats, moyennes, présences, bulletins, messagerie, suivi |
| Administration SCHOOLNET | Utilisateurs, classes, années scolaires, contenus, paramètres, inscriptions, notifications, plannings, bulletins |
| Administration locale | Écoles, invitations et rôle local, tableau de bord et profil ; formulaire de classes S2-B préparé **mais non activé** |

**Interdictions de principe :** ne pas créer un second système de cours ou de notes ; ne pas migrer arbitrairement les classes historiques vers une école ; ne pas créer automatiquement des identités ou des liens familiaux non vérifiés.

---

## 3. Roadmap historique conservée : Lots 0 à 8

| Lot | Module original | Avancement constaté | Recette / suite |
| --- | --- | --- | --- |
| 0 | Stabilisation transverse | Socle en place et contrôles de sécurité successifs | RLS, cohérence des profils, mobile, CI, stockage |
| 1 | Présences et Absences | Développé avec recettes ciblées | Contrôler Présent, Absent, Retard, Justifié, parents, enseignants et écoles |
| 2 | Emploi du temps (et salles) | Développé, salles et codes automatiques travaillés | Conflits classe/enseignant/salle, vues des 4 rôles, contexte école |
| 3 | Bulletins scolaires | Développé avec contrôles ciblés | Calculs, appréciations, publication, confidentialité, PDF |
| 4 | Notifications enrichies | Développé et enrichi | Événements, préférences, absence de doublons, nouveaux flux d'inscription |
| **5** | **Inscriptions et dossiers élèves** | **EN COURS : 5.C automatisation et 5.D préparé** | **Priorité immédiate : 5.C-A à 5.C-D ; 5.D attend** |
| 6 | Vie scolaire | Prévu dans le workflow historique | Retards, observations, incidents, sanctions, encouragements, visibilité contrôlée |
| 7 | Scolarité / Finances | Prévu dans le workflow historique | Frais, échéances, paiements, soldes, reçus, audit |
| 8 | Documents scolaires | Prévu dans le workflow historique | Certificats, attestations, relevés, reçus, archives, droits d'accès |

### Gates métier héritées de l'ancien workflow

- **Lot 1 :** appel complet, absent/retard/justification, traces, parent et élève autorisés.
- **Lot 2 :** emploi du temps hebdomadaire, détection de conflit classe/enseignant/salle, vues par rôle.
- **Lot 3 :** bulletin complet, note manquante, validation/publication, famille autorisée, PDF sans débordement.
- **Lot 4 :** alerte note, absence, devoir, bulletin et changement d'emploi du temps ; préférences et dédoublonnage.
- **Lot 5 :** demande, dossier, pièces éventuellement requises, décision, classe, accès et réinscription sans doublon.
- **Lot 6 :** observation/incident, visibilité adaptée, validation et traçabilité des modifications.
- **Lot 7 :** paiement partiel/complet, annulation contrôlée, soldes, reçu PDF et accès limité au parent.
- **Lot 8 :** certificat, relevé, reçu, numérotation unique, archivage et accès fichiers sécurisé.

**À retenir :** « développé » ne veut pas dire « production validée pour tous les établissements » ; les extensions seront recettées sur deux écoles distinctes avant ouverture des droits locaux.

---

## 4. Priorité active — Lot 5.C : automatiser les inscriptions existantes

### 4.1. Parcours visé, sans rupture de SCHOOLNET

~~~text
Apprenant / Parent : remplit la demande publique
  -> ADMIN SCHOOLNET : ouvre la demande, vérifie identité et autorité parentale
  -> Assistant : retrouve ou prépare les comptes existants / manquants
  -> Admin : valide le bon parent, apprenant, niveau et classe existante
  -> SCHOOLNET : réutilise les fonctions de classe et dossier existantes
  -> SCHOOLNET : rattache le parent après vérification et finalise la demande
  -> SCHOOLNET : prépare les liens temporaires et messages personnalisés
  -> Admin : envoie lui-même les invitations et déclare l'envoi réel
  -> Parent / Apprenant : définit le mot de passe et se connecte
  -> Cours / LIVE / devoirs / suivi : fonctionnement déjà en place
~~~

**L'administrateur décide ; SCHOOLNET exécute les opérations répétitives.** La vérification humaine reste obligatoire pour les liens familiaux et l'identité. Une correspondance de nom ou d'e-mail n'est pas une preuve.

### 4.2. État technique de 5.C vérifié le 10 novembre 2026

- Fonction publique de dépôt de demande et module **Demandes publiques** : existants.
- RPC **admin_finalize_public_enrollment_request** : migration 5.C appliquée, tests SQL effectués, mais l'interface exige encore des comptes et un dossier préexistants.
- Edge Function **admin-create-user** : création de comptes possible, mais saisie manuelle d'un mot de passe temporaire.
- Edge Function **schoolnet-admin-invitation** : invitations sécurisées pour admin local **déjà testées en navigateur** ; réutiliser le **modèle** de lien sans mot de passe, pas les privilèges scolaires locaux.
- RPC **admin_assign_student_to_class** : classe et dossier annuel sont déjà synchronisés ; ne pas écrire une seconde fois ces associations.
- Dans Supabase, **35 migrations au 11/11/2026 après application de la migration familiale ciblée**. Les chiffres de test historiques avant cette opération étaient : **4 demandes publiques**, **0 résolution finalisée**, **2 classes historiques**, **2 affectations apprenant**, **2 affectations enseignant** et **2 dossiers annuels** ; ils n'ont pas été recalculés lors du contrôle technique du registre.

### 4.3. Sous-lots d'automatisation (enchaînement obligatoire)

| Étape | Livrable | Statut / gate |
| --- | --- | --- |
| **5.C-A — Reconnaissance** | Dans la fiche de demande, proposer comptes plausibles et classes existantes selon le niveau ; aucune écriture | **Recette locale validée le 11/11/2026** (compte Parent, apprenant sans e-mail, classe 5e non créée), sans écriture |
| **5.C-B — Comptes et identifiants** | **B.1** : présélection assistée sans écriture ; **B.2** : création Auth sans mot de passe, invitation et reprise idempotente sous contrôle ; **B.3** : téléphone propre ou accès enfant supervisé par le Parent | **B.1 et ergonomie validés ; B.2 registre et audit appliqués dans Supabase, migration `20261111101351` vérifiée (tables vides, RLS). Fonction Edge et créations Auth toujours désactivées** ; B.3 non activé |
| **5.C-C — Affectation et finalisation** | Choix de classe, réutilisation des RPC existantes, vérification lien familial, traitement idempotent | À développer et tester après GO 5.C-B |
| **5.C-D — Transmission et activation** | Objet, corps, destinataire, lien temporaire, copier, ouvrir messagerie, déclarer l'envoi, renouveler, première connexion | À terminer puis recette complète Parent/Apprenant |

**Décision 11/11/2026 — enfants sans e-mail :** le numéro propre de l'apprenant peut servir à une connexion Supabase après activation/vérification du fournisseur téléphone ; le **numéro du parent ne peut pas être partagé comme identifiant Auth** (index unique). L'e-mail du parent est un **contact de transmission**, mais ne doit pas être utilisé comme identifiant Auth de plusieurs enfants. Le parcours d'activation supervisée d'un enfant sans téléphone propre nécessite une réalisation serveur distincte. [Cadrage technique du Lot 5.C-B](./lot-5-c-b-comptes-invitations-et-acces-sans-email.md).

**Recette 11 novembre 2026 — 5.C-B.1 :** sur le dossier fictif Koffi Amani, le bouton de présélection retrouve Koffi Bernard et met à jour le champ Parent/Tuteur, tandis que la case de vérification familiale reste décochée. Le dossier n'a pas été finalisé. **Amélioration ergonomique ensuite codée :** fiche élargie avec informations à gauche et assistant à droite sur PC ; plan d'accès, note de suivi et formulaire manuel repliables ; affichage vertical sur petit écran. ESLint et build Vite réussis sur GitHub. **La nouvelle ergonomie reste à valider visuellement en local.** Aucune migration Supabase ni déploiement de fonction d'invitation.

**Recette SQL 5.C-B.2, 11 novembre 2026 :** [Brouillon du registre](./sql/lot_5_c_b2_family_invitation_registry_DRAFT.sql) créé dans `docs/sql/` (pas dans les migrations applicables). Test sur Supabase dans `BEGIN ... ROLLBACK` : unicité dossier/destinataire, unicité e-mail, rôles, normalisation, transitions de statuts, immutabilité, permissions SQL, RLS et FORCE RLS **conformes**. Un premier test a révélé le droit DELETE attribué par défaut à `service_role`, ensuite révoqué explicitement ; le second passage est réussi. Contrôle après transaction : **table inexistante, toujours 34 migrations appliquées**. [Procès-verbal et limites](./lot-5-c-b2-invitations-familiales-serveur-et-activation.md). Aucune migration n'a été appliquée, aucune invitation envoyée ; tests réels Edge/concurrence et reprise d'échec restent à réaliser.

**Protocole de reprise 5.C-B.2, 11 novembre 2026 :** la fonction serveur sépare désormais `createUser` sans mot de passe, liaison du compte au registre, préparation du profil et `generateLink(recovery)`. Les actions `resume`, `renew` et `flag_review` sont codées avec contrôle de rôle Super Admin, anti-doublon, délais et verrouillage par changement d'état atomique. Le registre proposé conserve un **historique append-only** sans jeton, ainsi qu'une unicité par demande, e-mail et compte Auth. Les [tests SQL reproductibles](./sql/lot_5_c_b2_family_invitation_registry_TEST_ROLLBACK.sql) sont réussis en `BEGIN/ROLLBACK` : **34 migrations appliquées, 0 nouvelle table conservée**. [Protocole, incidents et limites](./lot-5-c-b2-invitations-familiales-serveur-et-activation.md). **Les essais Auth réels, la concurrence de deux appels et l'activation complète restent à faire après autorisation.**

**Application SQL ciblée 5.C-B.2 — 11/11/2026 :** l'autorisation explicite a été donnée. Après une dernière recette réversible, la migration [`20261111101351_schoolnet_family_invitation_registry.sql`](../supabase/migrations/20261111101351_schoolnet_family_invitation_registry.sql) a été appliquée dans Supabase et vérifiée : **35 migrations au total, 2 nouvelles tables vides, 2 triggers, RLS + FORCE RLS, accès directs anon/authenticated interdits, aucun DELETE accordé à service_role**. La vérification SQL ne crée aucun compte ni invitation. L'historique de 34 migrations dans les paragraphes de recette précédente est le **constat avant l'application**, conservé pour traçabilité. [Rapport d'application et prochaine étape](./lot-5-c-b2-invitations-familiales-serveur-et-activation.md). **La fonction Edge n'est toujours pas déployée et son flag d'écriture reste désactivé.**

**Recette ergonomique 11/11/2026 :** sur Chrome local, la nouvelle fiche en deux colonnes est affichée avec les sections secondaires repliables. **5.C-B.2 :** fichier serveur séparé schoolnet-family-invitation et contrat client adminFamilyInvitationApi préparés sur GitHub. L'Edge n'est PAS déployée ; le registre SQL a été approuvé et appliqué ensuite, mais le flag serveur des créations reste désactivé. [Audit et règles d'activation B.2](./lot-5-c-b2-invitations-familiales-serveur-et-activation.md). Aucun e-mail envoyé, aucun compte créé et aucune migration appliquée.

### 4.4. Cas de recette obligatoires

1. Compte Parent déjà présent ; compte Apprenant déjà présent ; deux personnes homonymes.
2. Nouveau Parent et nouvel Apprenant ; e-mails distincts et réutilisation des comptes si déjà créés.
3. Enfant sans e-mail personnel : **pas de fausse adresse ni de partage automatique du compte Parent** ; solution métier à valider.
4. Accès Parent à un apprenant déjà inscrit : lien vérifié **sans créer une deuxième inscription**.
5. Affectation dans une **classe déjà existante**, bonne année et enseignant autorisé.
6. Double clic, expiration d'une invitation, erreur entre création Auth et enregistrement SQL, reprise sans doublon.
7. Refus d'une demande, tentatives non autorisées, conservation des historiques, aucune divulgation Parent/Enfant.

**GO final Lot 5.C :** le parcours peut être effectué dans une seule fiche sans naviguer manuellement entre plusieurs modules, le responsable et l'apprenant accèdent aux bons espaces et aucune donnée d'un autre compte n'est divulguée.

---

## 5. Gestion des établissements scolaires — extension structurée de SCHOOLNET

**Ce chantier est intégré au workflow global, sans effacer les lots historiques et sans ouvrir une seconde application pédagogique.** Il reprend directement le développement déjà enregistré dans la PR #6.

### 5.1. Modèle organisationnel

~~~text
                        SUPER ADMIN SCHOOLNET
                      Référentiels / supervision
                                 |
              +------------------+------------------+
              |                                     |
     École A : administrateur local         École B : administrateur local
              |                                     |
   Classes A / enseignants A / élèves A   Classes B / enseignants B / élèves B
              |                                     |
       Cours, LIVE, notes, bulletins : fonctionnalités SCHOOLNET communes
                                 |
             Communauté SCHOOLNET des apprenants libres
                  Classes/groupes historiques distincts
~~~

Les **apprenants libres** ne sont pas déplacés automatiquement dans une école. Une « 6e A » de l'école A et une « 6e A » de l'école B sont distinctes, même pour la même année.

### 5.2. Avancement par sous-étapes ÉTABLISSEMENTS

| Sous-lot | Contenu | Statut / ordre |
| --- | --- | --- |
| **E1 — Organisation et accès locaux** | Création établissement, code SCH automatique, rôle school_admin, invitation sécurisée, première connexion, audit | **Développé ; migrations S0/S1 appliquées, recette ciblée réussie** |
| **E2 — Cloisonnement de sécurité** | Protection RLS, école active, appartenance active, suspension/révocation, interdiction d'accès aux autres écoles | **Première phase S1 appliquée ; protections métier complètes à poursuivre** |
| **E3 — Classes officielles par école** | Fiche classes, niveau/année, unicité par école, consultation locale, création sécurisée | **S2-A/S2-B codés et testés en ROLLBACK ; SQL non activé** |
| **E4 — Enseignants et élèves de l'école** | Affectations, liens classe/cours, demandes et invitations de familles, comptes existants réutilisés | **À construire par extension contrôlée des modules existants après 5.C** |
| **E5 — Pédagogie et vie scolaire de l'école** | Cours, LIVE, devoirs, présences, emploi du temps, notes, bulletins, messages et notifications, avec filtrage de l'école | **Moteur existant ; isolation et recettes inter-écoles à terminer** |
| **E6 — Années, documents et finances par école** | Réinscriptions, passage d'année, documents et paiements dans le contexte de l'école | **Après les gates 5.C / 5.D et Lots 6 à 8** |

### 5.3. Parcours du Super Administrateur

1. Vérifie l'établissement et son responsable légal ; crée la fiche école.
2. SCHOOLNET attribue un **code permanent automatique** de type SCH-000001.
3. Prépare l'invitation d'un responsable local avec un lien personnel temporaire ; **le Super Admin envoie l'e-mail manuellement** depuis sa messagerie.
4. Suit l'activation et contrôle la disponibilité de l'école et les droits d'accès.
5. Peut suspendre l'établissement ou révoquer son responsable ; la visibilité des données est immédiatement restreinte selon les règles en base.
6. Supervise les écoles depuis le centre, sans confondre une administration locale avec des privilèges globaux.

### 5.4. Parcours de l'Administrateur d'établissement

Après activation de ses droits : consulte **uniquement ses établissements actifs**, crée et organise leurs classes, gère les enseignants/élèves autorisés, vérifie les demandes et prépare les invitations, puis supervise les cours, présences, évaluations et bulletins **grâce aux modules SCHOOLNET existants**.

**Limite actuelle importante :** l'espace local, le profil et le catalogue des établissements sont testés ; **les fonctions complètes de gestion des classes et des affectations ne sont pas encore activées en base**. Ne pas annoncer aux écoles qu'elles peuvent déjà tout administrer.

### 5.5. Critères de recette de l'extension établissements

- Deux écoles A et B, chacune avec une classe de même nom ; aucun doublon intra-école.
- Un responsable de A ne voit **aucun** compte, classe, évaluation, message ni document privé de B.
- Une école suspendue ou une affiliation révoquée perd immédiatement les droits correspondants.
- Le Super Admin conserve les droits centraux ; le responsable local n'hérite jamais du rôle admin global.
- Les **classes historiques** et les apprenants libres restent accessibles aux acteurs historiquement autorisés et ne sont pas déplacés arbitrairement.
- Le lien Parent/Enfant reste vérifié et l'affectation à l'école/année/classe reste explicite.
- Les photos, justificatifs, bulletins et documents exigent aussi une isolation côté Storage.
- Les migrations SQL S2 ne sont appliquées **qu'après autorisation explicite** et test en transaction ROLLBACK.

**Ordre recommandé :** terminer 5.C, puis reprendre **E3**, ensuite E4/E5. Conserver E1/E2 acquis sans les recommencer.

---

## 6. Lot 5.D et Lots 6, 7, 8 — dépendances préservées

### 6.1. Lot 5.D — Réinscriptions et passage d'année

Le code et la proposition SQL du passage d'année existent, **sans activation SQL durable**. L'année en cours et certaines inscriptions de test présentent une incohérence connue ; aucun correctif automatique n'est autorisé.

Gate avant activation : année cible valide, décisions de réinscription/redoublement/départ, prévisualisation, absence de doublon, historique conservé, RLS, audit et recette sur la communauté SCHOOLNET puis sur les écoles concernées. L'année scolaire d'une école et la notion de « période globale » devront être rapprochées sans perte de données.

### 6.2. Lot 6 — Vie scolaire

Retards, incidents, observations, sanctions et encouragements, avec création par acteur autorisé, validation selon catégorie, visibilité Parent/Apprenant et traçabilité. Réutiliser présences, classes, notifications et messagerie.

### 6.3. Lot 7 — Scolarité et finances

Définition des frais applicables, échéanciers, paiements, soldes et reçus. Les **tarifs pédagogiques du site public** ne sont pas, par défaut, les frais de scolarité d'une école. Les transactions financières exigent audit, annulation contrôlée, calcul fiable côté données et isolation par école.

### 6.4. Lot 8 — Documents scolaires

Certificats, relevés, attestations, reçus et archives à numéro unique, données figées après publication et contrôle d'accès aux fichiers. Réutiliser les notes, bulletins, inscriptions et finances existants ; ne pas dupliquer les référentiels.

---

## 7. Architecture des dépendances — pas de fonctionnalités isolées

~~~text
Profils / Auth / liens familiaux / organisations
                      |
        Classes existantes / niveaux / années
                      |
        +-------------+--------------+
        |                            |
Cours + enseignants + évaluations    Inscriptions + dossiers
        |                            |
Notes -> moyennes -> bulletins        Pièces / année / documents
        |                            |
        +------- Notifications -------+
                      |
  Présences / emploi du temps / vie scolaire
                      |
     Écoles = contrôle de périmètre
       et administration locale
~~~

**Modèle de données :** privilégier les relations vers les tables existantes, plutôt que créer une deuxième table de notes, une deuxième table de profils ou un deuxième système de cours.

**Alerte de sécurité :** l'isolation multi-écoles n'est pas acquise du seul fait que la barre latérale ne montre pas certains modules. Les politiques RLS, fonctions serveur, relations classe/cours et autorisations Storage doivent être vérifiées séparément.

---

## 8. Continuer le développement malgré une limitation Vercel

### 8.1. Deux voies de test pour le même code GitHub

| Situation | Vérification | Décision |
| --- | --- | --- |
| **Preview Vercel disponible au bon commit** | GitHub CI réussi, déploiement Ready, **SHA identique** à celle testée, URL Preview | Recette navigateur sur Preview ; pas de publication Production |
| **Preview bloquée, limitée ou sur ancien commit** | GitHub CI réussi, branche locale **synchronisée avec GitHub**, npm run lint, npm run build | **Recette fonctionnelle sur localhost:5173** ; poursuivre les petits lots sans attendre Vercel |
| **Code local différent du remote** | git status, diff, historique, git fetch et comparaison des SHA | **STOP :** préserver le travail local, ne pas forcer la synchronisation |
| **Besoin d'une migration ou d'une création de comptes** | Vérifier l'environnement Supabase et le caractère réel des données | Autorisation distincte ; localhost **n'est pas** une base isolée |

### 8.2. Procédure locale sur Windows 11 — résumé opérationnel

Depuis la racine du dépôt SCHOOLNET dans PowerShell, **contrôler avant d'agir** :

~~~powershell
git status --short
git branch --show-current
git remote -v
git log -1 --oneline
git fetch origin --prune
~~~

Si **aucune modification locale** n'est à conserver sans traitement et si la branche existe sur le PC :

~~~powershell
git switch feature/schoolnet-multi-etablissements
git pull --ff-only origin feature/schoolnet-multi-etablissements
git rev-parse HEAD
git rev-parse origin/feature/schoolnet-multi-etablissements
~~~

Si la branche **n'existe pas** localement : après git fetch, exécuter **git switch --track origin/feature/schoolnet-multi-etablissements**. Les deux commandes git rev-parse doivent fournir **exactement la même SHA**. Ne jamais exécuter git reset --hard, un push forcé ou un rebase aveugle pour « réparer » une divergence.

Puis :

~~~powershell
npm ci
npm run lint
npm run build
npm run dev -- --host localhost --port 5173 --strictPort
~~~

Ouvrir **http://localhost:5173**. Conserver les variables d'environnement locales **hors de Git** ; seules l'URL Supabase et la clé publique/anon du projet autorisé peuvent être exposées à Vite, jamais une service-role key.

**Attention :** le frontend local peut appeler les **Edge Functions et la base Supabase distante**. Pour le test 5.C-A, ouvrir une demande fictive et **ne faire que des lectures** ; n'inviter, ne valider, ne rattacher et ne créer aucun compte réel sans procédure de test approuvée.

La procédure détaillée, y compris la gestion des changements locaux non enregistrés et les limites Cloudflare/Supabase Auth, se trouve dans le [guide de synchronisation et tests locaux](./guide-synchronisation-et-tests-local-schoolnet.md).

### 8.3. Passage du test local à la Preview, puis à la production

1. Versionner le petit lot dans la branche **feature/schoolnet-multi-etablissements**, avec un commit descriptif.
2. Vérifier le build GitHub. Si Vercel est bloqué, **conserver le résultat des tests locaux** et ne pas relancer des déploiements de façon répétitive.
3. Dès qu'une Preview correspondant **au commit testé** est Ready, reproduire les scénarios concernés sur ce déploiement.
4. Appliquer les migrations nécessaires seulement après accord explicite et recette RLS ; ne jamais utiliser un **supabase db push --remote global** pour activer toutes les migrations en attente.
5. Fusionner vers main et déployer en Production **uniquement après GO explicite** et recette de non-régression.

**État observé le 10/11/2026 :** PR #6 à la SHA applicative 563149e, lint/build GitHub réussis, statut Vercel en échec pour **limite de fréquence de build**. Le code de 5.C-A est donc prêt **pour test local**, mais **pas encore validé en navigateur** au dernier commit.

---

## 9. Méthode de livraison et sécurité — héritage du document initial

La méthode de la page 5 du workflow d'octobre 2026 reste obligatoire :

~~~text
Cadrage validé -> audit du modèle -> proposition SQL si nécessaire
-> RLS / sécurité -> services de données -> interface par rôle
-> test ciblé -> responsive mobile/tablette/desktop
-> lint et build -> recette locale ou Preview au bon SHA
-> commit GitHub -> vérification du déploiement
-> GO utilisateur -> lot suivant
~~~

**Avant les écritures durables :** revue des différences SQL, tests transactionnels en ROLLBACK, consentement explicite pour la migration ciblée, contrôles des cinq rôles et des deux écoles si concernés.

**Règles générales :** pas de duplication de comptes, pas de fusion sur le nom, mot de passe jamais transmis à l'administrateur, jetons jamais sauvegardés en clair, pièces protégées par RLS et Storage, mobile à 412 px minimum, aucun secret dans GitHub ou les logs, jamais d'activation globale d'une migration « en attente ».

### Règle de non-régression

Chaque modification des inscriptions et des écoles doit être testée sans casser : connexion Parent/Apprenant/Enseignant/Admin, accès aux cours et classes existants, affectation, notes/bulletins publiés, messages, présences, emploi du temps et notifications.

---

## 10. GitHub, branches et sauvegardes

~~~text
main                                      -> Production (référence stable)
  └─ feature/schoolnet-notifications       -> PR #5, brouillon (lots 4/5)
       └─ feature/schoolnet-multi-etablissements
                                           -> PR #6, brouillon (écoles, 5.C-A et docs)
                 ↕ synchronisation Git
         branche du PC Windows             -> npm ci, lint, build, localhost
~~~

**Le PC local ne se synchronise pas tout seul** à partir d'une modification GitHub. Exécuter la procédure du guide, contrôler les SHA et préserver toute modification locale non enregistrée. Le test local n'autorise jamais un push vers main.

Ne pas créer de nouveau dépôt pour résoudre un problème Vercel : la branche GitHub existante demeure la sauvegarde partagée.

---

## 11. Tableau de pilotage — état de référence au 10 novembre 2026

| Sujet | État / prochaine décision |
| --- | --- |
| **Lot actif** | **5.C-B.2 : migration du registre familial appliquée et vérifiée dans Supabase ; protocole de reprise prêt dans GitHub ; fonction Edge non déployée** |
| **Code 5.C-A** | **Recette navigateur local réussie le 11/11** ; correspondances Parent/Apprenant et recherche classes cohérentes |
| **Prochaine action unique** | **Demander l'accord avant déploiement ciblé de `schoolnet-family-invitation` en mode non activé, puis effectuer uniquement les contrôles read-only `inspect`** |
| **Étapes suivantes** | 5.C-B.2 : migration du registre après accord, fonction Edge + recette, suivi envoi ; 5.C-B.3 : apprenants sans e-mail ; 5.C-C : affectation/finalisation ; 5.C-D : transmission et connexion |
| **Établissements** | E1/E2 partiellement activés ; E3=S2 préparé mais non activé ; E4/E5 après 5.C |
| **Passage d'année 5.D** | Code préparé, migration non appliquée |
| **Supabase (dernier contrôle)** | **35 migrations** (dont `20261111101351_schoolnet_family_invitation_registry`), 2 tables familiales vides et protégées. Les autres valeurs affichées sont celles des contrôles historiques, non réactualisées lors de cette migration |
| **GitHub** | PR #5 + PR #6 en brouillon, aucun merge main |
| **Vercel** | Dernier SHA applicatif 563149e : rate-limit ; fallback local |
| **Règle de clôture** | Un seul petit bloc, test concret, accord avant toute écriture durable ou production |

**En fin de séance, enregistrer :** branche et SHA, fichiers modifiés, statut git, tests lint/build, capture de recette, migrations réellement appliquées ou non, anomalies et **seule prochaine action**. Actualiser ce tableau immédiatement.

---

## 12. Références et documents conservés

- **Workflow de référence d'octobre 2026 :** « Workflow_complet_SchoolNet_post_V1(7).pdf » ; V1.0.0, 19 pages, positionnement, Lots 0–8, dépendances, critères de qualité, GitHub/Vercel et pilotage.
- [Audit du Lot 5.C — Inscription et comptes](./lot-5-c-automatisation-comptes-acces-audit-existant.md).
- [Cadrage et sécurité du Lot 5.C](./lot-5-c-cadrage-demandes-et-rattachement.md).
- [Gestion des écoles et invitations](./architecture-schoolnet-multi-etablissements-et-invitations.md).
- [Audit de sécurité inter-écoles S1](./audit-isolation-multi-etablissements-phase-1.md).
- [Schéma des classes E3 / S2-A](./lot-s2-classes-multi-etablissements-conception-et-recette.md).
- [Formulaire et RPC E3 / S2-B](./lot-s2-b-formulaire-classes-et-rpc-securisees.md).
- [Réinscriptions et année scolaire 5.D](./lot-5-d-reinscriptions-et-cloture-annee.md).
- [Synchronisation GitHub et tests sur PC](./guide-synchronisation-et-tests-local-schoolnet.md).
- [Ancienne roadmap conservée comme historique](./roadmap-schoolnet-post-v1-lots-restants-et-salles.md).

**Cette édition V2.2 remplace les versions V2.0 et V2.1 comme référence active de pilotage, sans supprimer les anciens commits ni leurs documents.**
