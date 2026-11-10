# SCHOOLNET 2.0 — Workflow directeur rectifié
## Automatiser l'inscription et les accès de la plateforme existante

**Version V2.1 — 10 novembre 2026.** Remplace la V2.0 précédente, trop ambitieuse et éloignée du fonctionnement réellement souhaité. L'historique V2.0 reste accessible dans les commits GitHub.
**Référence historique :** `Workflow_complet_SchoolNet_post_V1(6).pdf` (Lots 0 à 8).
**Audit d'implémentation :** [Lot 5.C — Automatisation des comptes et accès : audit de l'existant](./lot-5-c-automatisation-comptes-acces-audit-existant.md).

> **Priorité unique :** SCHOOLNET fonctionne déjà comme plateforme d'apprentissage en ligne. Notre chantier consiste à **automatiser les opérations administratives après validation d'une demande d'inscription**. On ne reconstruit pas les cours, les classes, les enseignants, les évaluations, les visioconférences ni le suivi Parent.

---

## 1. Fonctionnement de SCHOOLNET à préserver

```text
Apprenant ou parent -> demande d'inscription publique
                       |
                       v
              Administration SCHOOLNET
             vérifie et valide la demande
                       |
                       v
         Préparation des comptes / accès
                  [À AUTOMATISER]
                       |
                       v
        Rattachement à une classe existante
               et lien Parent/Enfant
                  [À SIMPLIFIER]
                       |
                       v
       Invitations préparées et envoyées
                 par l'administrateur
                  [À FACILITER]
                       |
                       v
            L'apprenant se connecte
      Cours + LIVE + devoirs + quiz + examens
             + enseignant affecté
                 [DÉJÀ FONCTIONNEL]
```

L'administration de SCHOOLNET continue à gérer l'activation des enseignants, les classes, les affectations et les ressources pédagogiques.

**L'apprenant peut être inscrit par lui-même ou par un parent**, selon l'habilitation et le dispositif de contrôle adapté. Le formulaire actuel est orienté Parent/Tuteur ; le mode auto-inscription directe doit être aligné sur la sécurité existante avant ouverture, sans lancer un autre produit.

Un même environnement pédagogique SCHOOLNET est partagé par les apprenants libres et les élèves suivis par un répétiteur. **Le répétiteur est un Enseignant SCHOOLNET**, avec son compte, ses élèves affectés et les fonctions existantes : cours à distance, visioconférence, exercices, devoirs et suivi. **Aucun module autonome « cours à domicile » n'est à développer pour le moment.**

---

## 2. Avancement réel vérifié

| Élément | Réalité au 10/11/2026 | Action |
| --- | --- | --- |
| Accueil, niveaux, bibliothèque, tarifs | Présents sur le site public | Préserver |
| Espaces Administrateur, Apprenant, Enseignant, Parent | Présents dans les routes et la plateforme | Préserver |
| Classes par niveau, élèves et enseignants affectés | Modules `AdminClasses`, `class_students` et `class_teachers` opérationnels | Réutiliser |
| Cours, LIVE, activités et résultats | Fonctions pédagogiques développées et tests ciblés | Ne pas refaire |
| Formulaire public | Demande `student_enrollment` ou `parent_access`, Cloudflare, références et suivi | Conserver, simplifier si besoin |
| Création de comptes | `admin-create-user` existant, mais mot de passe temporaire demandé | Automatiser par invitations |
| Vérification et finalisation 5.C | RPC `admin_finalize_public_enrollment_request` **appliquée** et vérifiée, mais comptes/dossier requis manuellement | Raccorder dans l'assistant |
| Affectation classe | RPC `admin_assign_student_to_class` qui synchronise le dossier annuel | Réutiliser, pas de double insertion |
| Invitations | `schoolnet-admin-invitation` : lien d'activation, copie, e-mail manuel, renouvellement, suivi | Reprendre la **méthode** pour les familles |
| Multi-établissements | 2 écoles et 1 administrateur local avec invitation/activation testée | Reprendre **après** 5.C |
| S2-A et S2-B | Code et tests préparés, protections SQL **non appliquées** | En attente |
| 5.D passage d'année | Code et tests préparés, migration **non appliquée** | En attente |

**État Supabase lu le 10/11/2026 :** 34 migrations, 4 demandes publiques, **0 demande finalisée** au sens de la résolution 5.C, 2 classes, 2 affectations apprenants, 2 affectations enseignants et 2 inscriptions annuelles. Ces compteurs sont un instantané de test, non des inscriptions à recréer.

**GitHub :** PR #5 (110 commits, base `main`), PR #6 (74 commits supplémentaires, base PR #5), les deux en brouillon et non fusionnées. Derniers contrôles GitHub ESLint/build réussis ; Vercel connaît une limitation temporaire du nombre de déploiements.

---

## 3. Lot 5.C — Notre seul chantier actif

### 5.C-A — Reconnaissance des demandes (premier petit bloc)

Dans **Administration → Demandes publiques**, remplacer la recherche dispersée par **un assistant intégré au dossier** :

1. Afficher le contenu de la demande et ses coordonnées (sans les recopier).
2. Rechercher les comptes Parent et Apprenant déjà présents dans les données autorisées à l'Admin ; distinguer **correspondance plausible** et **identité vérifiée**.
3. Proposer les classes **déjà existantes** du niveau déclaré ; l'administrateur choisit et confirme la bonne classe.
4. Ne rien écrire à cette étape : **audit, contrôle visuel et recette**.
5. Si aucun e-mail apprenant n'est disponible, indiquer clairement le cas « accès enfant à définir », sans créer d'adresse fictive.

**GO 5.C-A :** une demande test affiche les bonnes correspondances et classes, sans modifier comptes ni inscriptions.

### 5.C-B — Création/réutilisation sécurisée des comptes

1. L'administrateur confirme l'identité et la responsabilité familiale.
2. SCHOOLNET réutilise les comptes authentifiés existants après contrôle et n'élève jamais un rôle automatiquement.
3. Pour un compte manquant, une fonction serveur spécifique aux familles prépare une invitation (`generateLink`) : le destinataire définit son propre mot de passe.
4. SCHOOLNET protège la préparation contre les doublons et permet de reprendre après un échec intermédiaire.
5. L'enfant sans e-mail propre est traité selon une solution **validée séparément** : pas de compte Supabase fictif, pas de partage silencieux d'identifiants.

**GO 5.C-B :** 1 parent et 1 apprenant fictifs obtiennent leurs accès sans mot de passe communiqué à l'administrateur ni doublon.

### 5.C-C — Affecter et finaliser dans le même parcours

1. Réutiliser le mécanisme existant `admin_assign_student_to_class` et son inscription annuelle technique, après validation de l'année et de la classe.
2. Finaliser avec `admin_finalize_public_enrollment_request` uniquement après contrôle du lien familial et du dossier cohérent.
3. Ne pas appeler deux RPC d'écriture à la suite sans gestion du cas « première étape réussie, seconde étape échouée » ; si une transaction unique est nécessaire, préparer une RPC dédiée et une migration testée, puis demander une **autorisation séparée**.
4. Une demande `parent_access` rattache le Parent à l'enfant déjà présent **sans créer de dossier annuel supplémentaire**.
5. Garder les statuts de demande et événements existants, sans inventer une nouvelle chaîne entière de statuts.

**GO 5.C-C :** validation, compte, lien, classe et demande cohérents ; double clic sans doublon ; accès refusé aux rôles non autorisés.

### 5.C-D — Invitations, transmission et première connexion

- Générer séparément l'objet, le corps, le destinataire et le lien temporaire.
- Conserver la méthode déjà testée pour l'admin local : **Copier**, **Ouvrir ma messagerie**, **Déclarer l'envoi**, **Régénérer un lien expiré**.
- Aucun e-mail automatique ne sera promis sans fournisseur d'envoi validé.
- Ne jamais enregistrer les liens temporaires ou mots de passe en clair, ni confondre « préparé », « envoyé déclaré » et « activé ».
- Contrôler la vraie connexion Parent et Apprenant et la confidentialité de leurs espaces.

**GO 5.C-D :** demande fictive aboutit à une première connexion, une bonne classe et le bon suivi parental, sans action manuelle dans Supabase Dashboard.

### Conditions pour déclarer 5.C terminé

**La procédure doit tenir dans une seule fiche administrative, ne pas recréer les profils existants et ne pas imposer de changement de module à chaque étape.** Vérifier le Parent déjà inscrit, le nouveau Parent, le nouvel Apprenant, la demande de Parent pour un enfant existant, le refus, l'échec/reprise et les homonymes.

La création des accès doit être **semi-automatique et supervisée** : validation humaine obligatoire, exécution technique automatisée.

---

## 4. Après le Lot 5.C : établissements et suite des lots

### Bloc suivant : établissements scolaires (travail déjà avancé)

- Conserver la création d'école, le code unique automatique, l'invitation d'administrateur local et son espace restreint.
- Réutiliser la méthode d'inscription simplifiée **dans le périmètre autorisé de chaque établissement**, sans copier l'administration centrale.
- Reprendre S2-A/S2-B (classes locales) **seulement après** recette de l'isolation des données des établissements.
- Les enseignants utilisent les mêmes cours, LIVE, évaluations et ressources ; pas de second système pédagogique.

### Puis : clôture des lots historiques post-V1

| Lot | Sujet | Ordre |
| --- | --- | --- |
| 0 | Stabilisation transverse, sécurité, responsive, tests | Contrôle continu |
| 1 | Présences et absences | Déjà développé, recette de non-régression après les changements |
| 2 | Emploi du temps, salles | Déjà développé, reprise du contrôle multi-établissements ensuite |
| 3 | Bulletins | Déjà développé, contrôle des données et des années scolaires |
| 4 | Notifications et SCHOOLNET LIVE | Déjà développés, nouvelles notifications à vérifier lors des inscriptions |
| **5** | **Inscriptions, comptes, liens, dossiers** | **Priorité : terminer 5.C-A à 5.C-D** puis reprendre 5.D |
| 6 | Vie scolaire | Ensuite, selon le plan initial |
| 7 | Scolarité/finances | Ensuite ; différencier tarifs publics et frais scolaires officiels |
| 8 | Documents scolaires | Ensuite ; accès et archivage sécurisés |

**Le passage d'année 5.D reste préparé, mais non activé** : une inscription historique active existe dans une année non courante. Ne pas corriger cette situation en même temps que les inscriptions courantes.

**Cours à domicile :** aucun sous-lot supplémentaire pour l'instant. Les répétiteurs prennent le rôle Enseignant et utilisent la pédagogie en ligne existante.

---

## 5. Règles de travail pour ne plus se disperser

```text
1 seul petit bloc actif
  -> audit du code en place
  -> modification ciblée sur branche GitHub
  -> lint / build / revue sécurité
  -> test en Preview avec comptes de test
  -> vérification RLS et des doublons
  -> accord utilisateur avant toute écriture SQL permanente
  -> validation par capture / résultat
  -> mise à jour du workflow et des commits
  -> bloc suivant uniquement après GO
```

**Interdit sans validation explicite :** création de comptes réels, envoi d'e-mails, modification persistante des demandes, migration SQL, `supabase db push --remote` global, fusion vers `main` ou publication Vercel en production.

**PR #6 / classes locales S2 restent sauvegardées et en pause ; aucun travail antérieur n'est supprimé.**

### Tableau de pilotage au 10/11/2026

| Champ | Valeur |
| --- | --- |
| Phase active | **5.C-A : reconnaissance des comptes et proposition de classe dans Demandes publiques** |
| Audit de l'existant | **Terminé** — document [audit 5.C](./lot-5-c-automatisation-comptes-acces-audit-existant.md) |
| Prochain livrable | Petit assistant en lecture seule, intégré au détail d'une demande |
| Ce qui est conservé | Toute la pédagogie SCHOOLNET, classes et affectations, fonctions Admin existantes |
| En attente | Création de comptes par lien, finalisation intégrée, écoles S2, passage d'année 5.D |
| Supabase | 34 migrations ; aucune modification durable dans cet audit |
| GitHub | PR #5 et PR #6 ouvertes en brouillon, non fusionnées |
| Production | `main` et le site principal inchangés |

**Rituel après chaque étape :** état exact, fichiers modifiés, tests, nombre de migrations, SHA/branche, copie d'écran ciblée, seule prochaine action.

---

## 6. Références conservées

- `docs/lot-5-c-cadrage-demandes-et-rattachement.md` — lot 5.C existant et protections appliquées.
- `docs/lot-5-a-consultation-dossiers-scolaires.md` et `docs/lot-5-b-confidentialite-et-pieces-justificatives.md` — dossiers et confidentialité.
- `docs/lot-5-d-reinscriptions-et-cloture-annee.md` — passage d'année non activé.
- `docs/architecture-schoolnet-multi-etablissements-et-invitations.md` — établissements et invitation locale déjà testée.
- `docs/lot-s2-b-formulaire-classes-et-rpc-securisees.md` — classes locales préparées, non activées.
- `docs/roadmap-schoolnet-post-v1-lots-restants-et-salles.md` — historique.
- `Workflow_complet_SchoolNet_post_V1(6).pdf` — ordre des lots 0–8.

**Toute nouvelle action doit se référer à V2.1, et non aux projets supplémentaires imaginés dans l'ancienne V2.0.**
