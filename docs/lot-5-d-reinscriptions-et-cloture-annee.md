# SCHOOLNET — Lot 5.D : réinscriptions et changement d'année scolaire

**Date :** 10/11/2026  
**Branche :** `feature/schoolnet-notifications` — PR #5 en brouillon  
**Statut :** AUDIT et proposition de cadrage ; aucun code, migration ou basculement d'année 5.D n'est autorisé ni appliqué.

## 1. Objectif et référence

Achever le Lot 5 du workflow post-V1 (page 11) sans créer de deuxième système de comptes, classes, dossiers ou inscriptions. Permettre à l'Administration de préparer l'année suivante, de décider la réinscription de chaque apprenant, de clôturer proprement une année et de préserver les dossiers, notes, bulletins, justificatifs et relations familiales historiques.

Le passage à une nouvelle année scolaire ne doit pas réinscrire automatiquement les apprenants sans choix de classe validé et ne doit jamais modifier les résultats publiés d'une ancienne année.

## 2. Existant confirmé en base — 10/11/2026

- `school_years` : **3 années**, une année courante (2025–2026). `admin_set_current_school_year(uuid)` ne fait aujourd'hui que changer le drapeau `is_current`, sans clôturer automatiquement les dossiers.
- `classes` : **2 classes** ; `class_students` : **2 affectations** ; `student_enrollments` : **2 dossiers** ; `student_enrollment_events` : **4 événements**.
- Un dossier **actif** appartient à 2025–2026 (courante) et un autre dossier **actif** appartient à 2026–2027 (non courante). Il s'agit de l'état de test existant, à analyser sans réécriture automatique. 2027–2028 n'a ni classe ni inscription.
- `student_enrollments` impose `UNIQUE(student_id, school_year_id)` ; `class_students` refuse deux classes différentes pour un même apprenant et une même année. Les numéros d'inscription sont attribués par la base, et les événements d'inscription sont historisés.
- `admin_upsert_student_enrollment` réutilise le dossier de l'apprenant pour une année existante ou en crée un pour une nouvelle année ; **mais il attribue actuellement `completed` lorsqu'on inscrit dans une année non courante**. Ce comportement est inadapté aux préinscriptions de l'année suivante : `completed` doit désigner une année terminée, pas une future inscription préparée.
- `profiles.class_name` est synchronisé lorsque l'année cible est courante. Le nouveau parcours devra explicitement contrôler sa cohérence au changement d'année.
- L'historique familial s'appuie sur `parent_links` et la consultation des dossiers scolaires a déjà sa RLS (Lot 5.A). Les pièces justificatives sont privées (Lot 5.B) et liées à un dossier annuel précis.

## 3. Workflow proposé (validation métier attendue)

### A — Préparer l'année suivante
1. Sélectionner une année cible déjà existante ou la créer via le module Années scolaires.
2. Vérifier les dates, le caractère non courant de l'année cible, les classes disponibles, leurs niveaux, les effectifs et les inscriptions déjà présentes.
3. Présenter les alertes de préparation : année cible sans classe, classe source sans destination, dossier à traiter, inscription encore active dans une année non courante, anciennes corrections/bulletins non publiés si la règle métier le requiert.
4. Aucune bascule immédiate : l'administrateur doit voir un aperçu avant confirmation.

### B — Décider la réinscription par apprenant
1. Afficher les apprenants de l'année source, avec dossier, classe actuelle, statut et historique.
2. Choisir pour chaque apprenant : **réinscrit** (classe cible obligatoire), **redoublant** (classe cible choisie), **départ/non réinscrit**, ou **en attente**. La promotion de classe n'est jamais déduite automatiquement d'un simple numéro de niveau.
3. Pour un réinscrit, réutiliser le même compte Apprenant et les mêmes liens Parent/Enfant ; préparer un **nouveau dossier pour l'année cible**, sans modifier l'identifiant ni le numéro de dossier historique.
4. Si un dossier de l'année cible existe déjà, montrer son état et proposer une mise à jour contrôlée plutôt que créer un doublon.
5. Un dossier futur préparé doit porter un statut métier approprié (par exemple `draft`), jamais `completed` par défaut.

### C — Prévisualiser et contrôler
1. Prévisualisation avec comptes et classes, volumes à créer, dossiers existants, élèves sans classe et anomalies.
2. Isoler les décisions non prêtes : ne pas lancer d'affectation par défaut.
3. Autorisation Admin, verrouillage transactionnel, idempotence et journal d'audit (acteur, date, années, décision et résultat) requis pour toute finalisation.

### D — Basculer l'année scolaire
1. Vérifier que l'année source et la cible sont cohérentes ; demander une confirmation explicite.
2. Clôturer seulement les dossiers de l'année source concernés et conserver leurs lignes et événements. Ne pas altérer les notes/bulletins ou pièces rattachées aux anciennes années.
3. Activer exactement **une seule année** comme courante, puis activer les affectations/dossiers préparés de l'année cible avec contrôle des classes et statuts.
4. Synchroniser les classes courantes affichées sur les profils des apprenants concernés ; préserver la lecture des archives pour les Parent/Apprenant.
5. Permettre une relance sans duplication ; si le traitement est interrompu, éviter un état partiellement appliqué. Un journal de lot et un mécanisme de reprise contrôlée peuvent être nécessaires selon la volumétrie.

## 4. Contraintes et décisions de sécurité

- Pas de création de nouveaux comptes Auth lors d'une réinscription ; pas de duplication de `profiles`, `school_years`, `student_enrollments`, `class_students` ou `parent_links`.
- Écriture via opérations serveur vérifiées Admin. Protéger contre la concurrence et les doublons ; les RLS des dossiers existants continuent de s'appliquer aux rôles non administrateurs.
- Ne pas déplacer/copier automatiquement les pièces justificatives, les résultats ou les documents entre dossiers annuels.
- Ne pas modifier automatiquement les années de l'environnement de test pour les « mettre à jour » vers la date civile.
- Préparer une migration **distincte**, à tester avec `BEGIN ... ROLLBACK`, soumise à autorisation avant application. **Ne jamais lancer un `supabase db push --remote` global** : la migration `20261109140104_harden_assessment_legacy_rpcs.sql` reste en attente.
- Aucun changement de `main`, de Vercel production ou du Cron LIVE sans validation.

## 5. Recette ciblée proposée

- Réinscription simple avec sélection de classe cible et nouveau numéro de dossier annuel ; consultation historique Parent et Apprenant.
- Redoublement : conservation du même niveau sans effacer l'année source.
- Départ/non réinscription : aucun nouveau dossier ni affectation pour l'année cible.
- Tentative sans classe cible, année cible inexistante, dossier déjà existant, répétition, conflits concurrents et changement de profil non autorisé.
- Passage d'année : exactement une année courante ; états historiques cohérents ; correction des anomalies détectées **seulement après validation administrative**.
- Tests RLS : Admin autorisé, Enseignant selon périmètre, Parent uniquement ses enfants, Apprenant uniquement lui-même.
- Tests 412 px/tablette/desktop, lint, build et recette navigateur depuis la branche avant proposition de fusion.

## 6. Prochaine décision métier

Valider ou ajuster ce parcours avant de préparer SQL et interface 5.D. Le Lot 6 (Vie scolaire), le Lot 7 (Scolarité/Finances) et le Lot 8 (Documents scolaires) restent les trois grands lots après clôture du Lot 5.
