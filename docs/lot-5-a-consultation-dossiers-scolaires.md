# SCHOOLNET — Lot 5.A : consultation des dossiers scolaires

**Date :** 09/11/2026  
**Branche :** `feature/schoolnet-notifications` ; PR #5 en brouillon  
**État :** écran et routes implémentés, lint et build GitHub Actions réussis, recette navigateur ciblée à effectuer.  
**Base :** `schoolnet_2.0` — **27 migrations appliquées** ; aucune nouvelle migration pour 5.A.

## Objectif et périmètre

Compléter le socle déjà disponible dans **Administration → Inscriptions** par une
consultation sécurisée **en lecture seule** des dossiers annuels des apprenants
et de leurs Parents/Tuteurs autorisés.

Il ne s'agit pas de créer un nouveau dossier administratif : les tables
existantes restent la source de vérité.

| Compte | Page | Données affichées |
| --- | --- | --- |
| Apprenant | /`app/student/enrollments` | Ses propres dossiers, année, numéro, classe, date, type d'admission, statut |
| Parent/Tuteur | /`app/parent/enrollments` | Uniquement les dossiers de ses enfants liés par `parent_links` |
| Enseignant | Aucune route de dossier dans 5.A | Non concerné ; pas d'accès aux notes administratives |
| Administrateur | /`app/admin/enrollments` (déjà existant) | Création, modification, statuts et historique — inchangés |

La recherche et le filtre par année scolaire sont disponibles dans les deux
nouveaux écrans. Les observations internes `student_enrollments.notes`
**ne sont ni sélectionnées ni affichées** par le nouveau composant.

## Résultats de l'audit initial

- Tables opérationnelles : `student_enrollments`, `student_enrollment_events`,
  `school_years`, `classes`, `parent_links`.
- L'administration gère déjà les dossiers, la classe, le genre, les admissions
  et les statuts ; les numéros de dossier sont attribués côté PostgreSQL.
- La demande publique `public_enrollment_requests` est examinée manuellement ;
  la confirmation « traitée » **ne crée pas automatiquement** un compte ou
  une inscription. Cette évolution reste à cadrer.
- La vue Parent existante `ParentChildren` exploite `profiles.child_ids` ;
  la politique RLS de consultation des dossiers utilise, quant à elle,
  `parent_links` : l'alignement de ces deux sources fait partie des
  vérifications du Lot 5.
- Stockage : il n'existe pas encore de compartiment privé dédié aux
  **pièces administratives des élèves**. Ne pas utiliser les buckets publics
  pour des actes de naissance ou documents confidentiels.

### Contrôles RLS en lecture seule (09/11/2026)

Sous rôle PostgreSQL `authenticated` et JWT d'un Parent de test :
un enfant lié, un dossier visible, **zéro dossier étranger**.

Sous rôle `authenticated` et JWT d'un Apprenant inscrit :
un dossier personnel, **zéro dossier étranger**.

**Aucune écriture** dans ces vérifications ; tests effectués dans des
transactions `BEGIN READ ONLY … ROLLBACK`.

### Point de sécurité à traiter avant livraison

**Important :** la RLS de `student_enrollments` restreint bien les **lignes**
consultables par Parent/Apprenant, mais le rôle `authenticated` possède
actuellement le droit SQL de lire la **colonne** `notes` de ses lignes.
Le nouveau composant ne la demande pas, **mais l'API REST peut encore la
renvoyer**. Les deux dossiers annuels de test possèdent une observation
administrative non vide ; leur contenu n'a pas été reproduit dans cet audit.

Ce risque de confidentialité doit être corrigé par une migration séparée,
après vérification des usages de la colonne côté administration et
autorisation explicite. **Ne pas considérer le simple masquage dans React
comme une protection de données.**

## Fichiers réalisés

- `src/features/enrollments/pages/EnrollmentRecordsPage.tsx` :
  page commune Parent/Apprenant, requêtes limitées, filtres et états vides.
- `src/routes/router.tsx` : deux routes dans les RoleGate existants.
- `src/layouts/DashboardLayout.tsx` : liens dans les menus des deux profils.

**Aucune mise à jour de Supabase, aucune fusion dans `main` et aucun
déploiement Vercel** pour ce sous-lot.

## Recette ciblée demandée

1. Récupérer la branche, lancer l'application locale, ouvrir
   **Apprenant → Mon dossier scolaire** ; vérifier classe, numéro d'inscription,
   année et statut ainsi que le filtre/recherche.
2. Ouvrir **Parent → Dossiers scolaires** ; vérifier le dossier de son enfant
   lié et l'absence d'autres élèves.
3. Essayer la navigation vers l'une de ces pages avec le rôle **Enseignant** :
   `RoleGate` doit interdire l'accès.
4. En cas d'absence de dossier annuel, confirmer l'état vide explicatif
   sans crash ni affichage de données étrangères.
5. En mode démo, vérifier qu'aucune donnée réelle n'est chargée.
6. Vérifier le rendu mobile et l'absence d'observations administratives dans
   les champs affichés, sans considérer cela comme suffisant pour sécuriser
   la colonne côté API.

## Sous-lots suivants — sans duplication

- **5.B : confidentialité et pièces justificatives privées** : restriction
  des observations internes, bucket privé, contrôle d'accès aux documents,
  listes d'exigences configurables et audit des téléchargements.
- **5.C : parcours administratif des demandes publiques** : vérification
  du lien familial, rattachement contrôlé demande → compte → inscription,
  gestion des refus et des documents manquants, traitement sans doublon.
- **5.D : réinscription et changements d'année** : conserver le numéro
  annuel, l'historique d'affectation et les statuts, tests de transition.
- Puis **Lot 6 : Vie scolaire** ; **Lot 7 : Scolarité / Finances** ;
  **Lot 8 : Documents scolaires**, conformément au workflow post-V1.

**Important :** la migration de sécurité des corrections
`20261109140104_harden_assessment_legacy_rpcs.sql` reste préparée,
mais **non appliquée** et devra faire l'objet d'un accord distinct.
