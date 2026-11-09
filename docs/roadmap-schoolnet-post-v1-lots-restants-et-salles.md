# SCHOOLNET — Feuille de route consolidée : salles et lots restants

**Référence de cadrage :** `Workflow_complet_SchoolNet_post_V1(5).pdf` transmis le 09/11/2026 (version octobre 2026, 19 pages).  
**État audité :** branche `feature/schoolnet-notifications` ; Supabase `schoolnet_2.0`.  
**Règle :** aucune fusion de `main`, aucun déploiement Vercel et aucune migration Supabase sans les validations et autorisations convenues.

## 1. Continuité avec le workflow post-V1

Le document de référence place les lots dans l'ordre suivant :
0. Stabilisation ; 1. Présences et absences ; 2. Emploi du temps ; 3. Bulletins ;
4. Notifications ; 5. Inscriptions et dossiers élèves ; 6. Vie scolaire ;
7. Scolarité / Finances ; 8. Documents scolaires.

Les lots 1 à 4 ont déjà fait l'objet d'implémentations et de recettes ciblées.
L'audit du 09/11/2026 confirme aussi qu'un **socle du Lot 5 existe déjà** :
`student_enrollments`, `student_enrollment_events`, demandes publiques et
`AdminEnrollments.tsx` ; ne pas recréer ces données. Les pièces justificatives,
le parcours complet Parent/Apprenant et les dossiers administratifs détaillés
doivent encore être étudiés avant de considérer le Lot 5 terminé.

Les tests Daily LIVE-FR sur caméra/micro sont **reportés à une Preview Vercel**
depuis un téléphone ou un autre ordinateur équipé, sans les déclarer validés.

## 2. Module complémentaire : Salles de classe physiques

### Pourquoi un module à part ?

Le Lot 2 du workflow (page 8) prévoit explicitement l'association
**classe + matière + enseignant + salle** et la prévention des conflits de salles.
La salle est donc une **ressource physique d'établissement**, distincte :
- de la **classe pédagogique** (6e A, CM2 A, etc.) ;
- de l'**espace de classe numérique** (publication et discussions) ;
- de la **salle de visioconférence Daily**.

La gestion est utile aux établissements physiques ; elle reste facultative pour
une école 100 % à distance.

### Ce qui existe réellement

- Table `public.rooms` : `id`, `name`, `code`, `capacity`, `notes`,
  `is_active`, dates d'audit.
- `timetable_slots.room_id` existe et la base bloque déjà les chevauchements
  d'emploi du temps dans une même salle.
- RLS existante : lecture par utilisateur authentifié, écriture réservée à l'Admin.
- Fonctions disponibles : `getVisibleTimetableRooms`,
  `createAdminTimetableRoom`, `updateAdminTimetableRoom`,
  `setAdminTimetableRoomActive`, `deleteAdminTimetableRoom`.
- Après le premier test utilisateur, **1 salle enregistrée** (« Salle Informatique », code historique `LAB-01`, capacité 30), sans affectation à un créneau.

### Nouvelle interface préparée sur GitHub — 09/11/2026

- Route protégée `/app/admin/rooms` et entrée de navigation
  **Administration → Salles de classe**.
- Liste et recherche (nom, code, observations), filtres actif/inactif,
  indicateurs, ajout, modification, activation/désactivation et suppression
  confirmée. Contrôles de nom et de capacité ; erreurs SQL/RLS visibles.
- Réutilisation stricte de `public.rooms` et des fonctions existantes pour le CRUD initial, sans nouvelle table.
- **Amélioration post-recette préparée le 09/11/2026 :** migration `20261109145700_auto_room_codes.sql` : génération automatique des codes `SAL-000001`, `SAL-000002`, etc. en base, code non modifiable, conservation du code existant `LAB-01`. Migration testée avec `BEGIN ... ROLLBACK`, **non appliquée à Supabase**.
- La sélection des salles actives demeure dans l'éditeur d'emploi du temps.

**Recette ciblée :** la création initiale de « Salle Informatique / LAB-01 / 30 places » est validée. Après autorisation d'appliquer la migration automatique, créer une **nouvelle** salle de test et confirmer le code généré `SAL-000001` (ou le prochain numéro disponible), puis vérifier sa conservation à la modification ; l'affecter à un créneau, vérifier l'affichage dans les emplois du temps et le refus de chevauchement, puis tester la désactivation et l'impossibilité de supprimer une salle référencée. Confirmer le refus d'écriture pour
Enseignant/Parent/Apprenant. Vérifier 412 px, tablette et desktop.
Ne pas remplir les salles réelles avant validation.

### Extensions optionnelles à cadrer plus tard

Bâtiments/étages, type (classe, laboratoire, informatique, bibliothèque),
équipements, capacité par configuration, salles indisponibles pour travaux,
réservation ponctuelle et indicateurs d'occupation. Ne pas alourdir le socle
sans validation des besoins de l'établissement.

## 3. Séquence des lots restant à traiter

| Ordre opérationnel | Bloc | Travail prioritaire |
| --- | --- | --- |
| A | **Salles de classe physiques — complément Lot 2** | CRUD testé, codes automatiques préparés ; migration à autoriser, puis recette d'affectation, conflits et permissions |
| B | **Lot 5 — Inscriptions et dossiers élèves (complément)** | Audit du flux actuel, dossier complet par année, pièces protégées, admission, réinscription, affectation et visibilité Parent/Apprenant |
| C | **Lot 6 — Vie scolaire** | Observations, incidents, encouragements, sanctions contrôlées, circuit de validation, confidentialité et historique ; ne pas dupliquer les absences |
| D | **Lot 7 — Scolarité / Finances** | Plans de frais, échéances, paiements, imputations, annulations tracées, soldes, reçus et consultation Parent ; ne pas confondre tarifs publics de la plateforme et frais d'un établissement |
| E | **Lot 8 — Documents scolaires** | Certificat, attestation, relevé, reçu, numérotation unique, PDF, archivage, contrôle des accès et versions figées |
| F | **Recette transversale et LIVE-FR sur Preview** | RLS pour tous les profils, mobilité, notifications, non-régression, audio/vidéo sur téléphone, validation distincte du déploiement |

Les données financières et de documents officiels nécessiteront des règles
métier et des migrations spécifiques, préparées puis approuvées une à une.

## 4. Périmètre des acteurs

- **Administration :** gère locaux, inscriptions, décisions, vie scolaire,
  paramètres financiers et documents officiels de son établissement.
- **Enseignant :** consulte son lieu de cours, propose les observations
  autorisées et suit uniquement ses classes/élèves.
- **Parent/Tuteur :** suit les dossiers, documents, échéances et événements
  de ses enfants liés, selon la politique de visibilité validée.
- **Apprenant :** consulte ses propres informations et son emploi du temps,
  sans modification des salles ni des dossiers administratifs.

**Point architectural à éclaircir lors du cadrage multi-établissement :**
le schéma actuel `rooms` ne porte pas d'identifiant `school_id`. Il faut
déterminer si SCHOOLNET doit accueillir plusieurs établissements isolés
dans une même instance avant d'ajouter une dimension multi-école. **Ne pas
introduire artificiellement un `school_id` dans toutes les tables** sans
audit des relations et des politiques RLS : c'est une évolution d'architecture,
pas un simple champ de formulaire.

## 5. Qualité et règles de livraison

Pour chaque module : cadrage → réutilisation du modèle → migration si nécessaire
→ RLS par rôle → services → UI desktop/mobile → tests ciblés → lint/build
GitHub Actions → recette → autorisation de fusion/déploiement.

Au 09/11/2026, la base a **26 migrations appliquées**. Deux migrations sur la branche restent en attente d'autorisation spécifique :
`20261109140104_harden_assessment_legacy_rpcs.sql` (sécurité des corrections)
et `20261109145700_auto_room_codes.sql` (codes des salles). **Ne pas exécuter un `supabase db push --remote` global** : il appliquerait également la migration des corrections, qui n'a pas encore été autorisée. Appliquer individuellement les migrations après validation.

La PR #5 peut rester en brouillon pendant le développement, mais un lot
métier indépendant pourra ensuite être isolé dans sa propre branche/PR pour
faciliter les validations, sans perdre les modifications en cours.
