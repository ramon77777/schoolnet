# SCHOOLNET — Lot 5.B : confidentialité et pièces justificatives

**Date de préparation :** 09/11/2026  
**Branche :** `feature/schoolnet-notifications`, PR #5 en brouillon  
**État :** migrations **5.B.1 et 5.B.2 appliquées le 09/11/2026** après autorisation explicite. **Dépôt et suppression du fichier test validés sur captures et en base** ; téléchargement proposé par l'interface, ouverture du PDF téléchargé restant à confirmer.  
**Données existantes :** **29 migrations enregistrées**, 2 dossiers annuels, 4 événements historiques, salles `LAB-01` et `SAL-000001` conservées ; aucun document administratif déposé au moment des contrôles.

## 1. Recette du Lot 5.A

Les captures Parent/Tuteur et Apprenant montrent le même dossier annuel
de l'enfant rattaché : année **2025-2026**, classe **6e A**, inscription
**active**, type **Réinscription**, même numéro d'inscription dans les deux
espaces. Les 2 écrans sont opérationnels. Les contrôles RLS en lecture seule
montrent **zéro dossier étranger** avec les comptes de test.

## 2. Vulnérabilité confirmée par l'audit

La table `public.student_enrollments` avait un `GRANT ALL` à `anon`
et `authenticated` : malgré une RLS qui filtre les lignes,
la colonne `notes` (observations administratives) reste consultable
directement via l'API par les profils familiaux autorisés à voir une inscription.

Plus important : les droits SQL `TRUNCATE`, `TRIGGER` et `REFERENCES`
étaient aussi attribués aux deux rôles. La RLS ne sécurise pas `TRUNCATE`.
`student_enrollment_events` présentait la même configuration de grants.
**Le risque est une observation constatée, non un incident exploité.**

La page React Lot 5.A exclut déjà `notes` de ses requêtes, mais
**un masquage côté navigateur ne corrige pas une fuite API**.

## 3. Migration 5.B.1 — privilèges minimaux

Fichier : `supabase/migrations/20261109153406_harden_student_enrollment_privileges.sql`.

- `REVOKE ALL` pour `PUBLIC`, `anon` et `authenticated`
  sur `student_enrollments`, puis `GRANT SELECT` **uniquement** aux
  colonnes nécessaires : id, numéro, apprenant, année, classe, statut,
  date, admission, établissement précédent, dates d'audit.
- `notes`, `created_by`, `updated_by` ne sont plus accessibles directement
  aux utilisateurs connectés.
- La table d'historique `student_enrollment_events` perd les droits
  publics de destruction et d'écriture ; `authenticated` conserve
  uniquement `SELECT` sous politique RLS **Administrateur**.
- Les écrans Admin utilisent déjà `get_admin_student_enrollments`,
  `admin_upsert_student_enrollment_with_gender` et
  `admin_set_student_enrollment_status` (RPC `SECURITY DEFINER` vérifiant
  `is_admin()`) : l'accès aux observations et les mutations administratives
  sont donc préservés par ces RPC.
- Les profils familiaux continuent à voir **uniquement leurs lignes** grâce
  aux politiques RLS existantes.
- Limitation volontaire : `SELECT *` sur `student_enrollments` ne sera
  plus autorisé pour `authenticated`, conformément aux recommandations
  Supabase pour les privilèges de colonne. Les deux écrans créés en 5.A
  demandent explicitement les colonnes autorisées.

**Ne pas confondre :** cette migration ne corrige pas les autres droits
publics éventuellement trop étendus sur des tables hors Lot 5.

## 4. Migration 5.B.2 — stockage privé

Fichier : `supabase/migrations/20261109153500_private_student_enrollment_documents.sql`.

- Bucket Supabase Storage **`student-enrollment-documents`**, `public=false`.
- Formats acceptés : **PDF, JPG, PNG, WEBP** ; limite : **10 Mo** par pièce.
- Table `public.student_enrollment_documents` reliée au dossier annuel
  `student_enrollments.id` (pas de duplication de la fiche d'inscription).
- Colonnes : dossier, type, nom original, chemin privé unique, MIME,
  taille, auteur et date d'ajout.
- Types prédéfinis : acte de naissance, bulletin précédent, certificat de
  transfert, photo d'identité, autre pièce.
- RLS **Admin uniquement** pour table et objets du bucket.
  Les fichiers doivent être rangés dans le dossier UUID correspondant ;
  les métadonnées exigent que le fichier existe dans ce stockage privé.
- Pas de lien public ni d'URL signée dans le nouveau composant :
  téléchargement via session authentifiée Supabase.
- Pas de modification de fichier en place (pas d'UPSERT Storage).
  Le remplacement se fait par suppression et nouvel ajout.
- Parent, Apprenant et Enseignant n'ont aucune permission d'accès aux
  pièces dans cette première version. Un parcours de transmission familial
  pourra être ajouté séparément après validation du besoin et des rôles.

## 5. Interface activée et recette partielle validée

- `src/features/enrollments/components/AdminEnrollmentDocuments.tsx` :
  ajout, liste, téléchargement et suppression confirmée.
- `src/features/admin/pages/AdminEnrollments.tsx` :
  la section **Pièces justificatives** apparaît dans le détail
  d'un dossier annuel administrateur.
- Si la migration SQL n'est pas encore appliquée, l'écran affiche
  **« Pièces justificatives ne sont pas encore activées sur Supabase »**
  et bloque le dépôt.
- En cas d'échec d'enregistrement des métadonnées après envoi du fichier,
  l'interface tente de nettoyer immédiatement le fichier créé.
- Suppression : d'abord le fichier privé, puis la ligne de registre ;
  en cas d'erreur intermédiaire, un message explicite propose de réessayer.
  Ces deux systèmes ne partagent pas une transaction SQL : surveiller les
  échecs et éviter les suppressions en masse avant la recette.

## 6. État d'autorisation

**NE PAS lancer `supabase db push --remote` global.** La version `20261109140104` (sécurité des corrections) n'a pas encore été autorisée. La base compte à présent 29 migrations appliquées.

Les migrations suivantes coexistent sur la branche :

| Version | Objet | État |
| --- | --- | --- |
| `20261109140104` | Sécurité RPC évaluations/corrections | En attente — hors Lot 5 |
| `20261109145700` | Codes SAL- des salles | Déjà appliquée |
| `20261109153406` | Sécurité des dossiers et événements | **Appliquée et vérifiée** |
| `20261109153500` | Bucket et pièces justificatives | **Appliquée et vérifiée** |

Les deux migrations 5.B ont été testées dans une transaction avec `ROLLBACK`, puis appliquées ensemble dans une **transaction atomique** après autorisation explicite. Le contenu SQL enregistré dans `supabase_migrations.schema_migrations` correspond exactement à chacun des fichiers GitHub. La migration de sécurité des corrections `20261109140104` reste **non appliquée** et n'a pas été incluse.

## 7. Recette ciblée après application SQL (à réaliser)

1. Sous Administrateur, ouvrir **Inscriptions → Dossier → Pièces
   justificatives**, déposer uniquement un PDF fictif de moins de 10 Mo.
2. Vérifier l'affichage, puis le téléchargement du **même** document et
   le refus d'accès anonyme à son URL dans Storage.
3. Retirer le PDF fictif, confirmer sa disparition du registre et du bucket.
4. Vérifier qu'un Parent, un Apprenant et un Enseignant ne peuvent pas
   lire ce document, même en appelant directement l'API ou Storage.
5. Vérifier que le Parent et l'Apprenant retrouvent leur dossier en
   lecture seule, mais ne peuvent pas sélectionner la colonne `notes`.
6. Administrateur : modifier une inscription existante et son observation
   via les RPC ; vérifier que l'historique demeure consultable.
7. Contrôler le rendu téléphone, la taille limite, les extensions rejetées,
   la RLS et l'absence de nouvelles anomalies TypeScript/ESLint.

Fichier de contrôle SQL non mutatif :
`supabase/verification/20261109_lot_5b_student_files_readonly.sql`.

### Vérifications post-application du 09/11/2026

- Historique : **29 versions**, 5.B.1 / 5.B.2 appliquées, migration Corrections non appliquée.
- Lecture Parent et Apprenant : leurs dossiers restent accessibles, zéro dossier étranger ; la lecture de la colonne `notes` renvoie un refus SQL.
- Administration : RPC de lecture des inscriptions et de l'historique fonctionnelles.
- Tables : droits `TRUNCATE` publics retirés, insertion directe d'événements d'inscription refusée, dossiers annuels existants inchangés.
- Stockage : bucket **privé**, 10 Mo, MIME PDF/JPEG/PNG/WEBP ; 3 politiques RLS sur les métadonnées et 3 politiques RLS sur les objets Storage.
- **Recette utilisateur (09/11/2026)** : captures de la fiche administrative confirmant la pièce PDF affichée après dépôt et le message de suppression avec retour à une liste vide. Le bouton Télécharger est visible, mais les captures ne prouvent pas à elles seules la réussite de l'ouverture du PDF téléchargé.
- **Vérification Supabase après suppression :** `0` ligne dans `public.student_enrollment_documents`, `0` objet dans `storage.objects` pour le bucket privé et le bucket `student-enrollment-documents` toujours non public. Aucun fichier orphelin.
- Les essais SQL sous rôles Parent/Apprenant et Administrateur avaient été validés ; la protection des observations administratives reste en vigueur.
- **Restant à confirmer** : le fichier téléchargé s'ouvre sans erreur, ainsi que les essais négatifs sur les autorisations Storage depuis des sessions réelles Parent et Apprenant.

## 8. Sous-lots restants du Lot 5

- **5.C** : relier de manière contrôlée la demande publique à la fiche
  d'inscription, aux comptes et aux responsables légaux, sans doublon.
- **5.D** : réinscription, clôture d'année, transitions et historique.
- Les Lots **6 Vie scolaire**, **7 Scolarité / Finances**,
  **8 Documents scolaires officiels** viennent ensuite.
