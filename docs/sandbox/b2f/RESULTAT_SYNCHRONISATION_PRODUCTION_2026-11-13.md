# SCHOOLNET — Synchronisation des niveaux de gestion, production

**Date : 13 novembre 2026.**  
**Projet :** Supabase `schoolnet_2.0` (`anttmbhaphkhmkoqsofd`).  
**Autorisation explicite :** reçue pour les 15 niveaux manquants uniquement.  
**Exécution :** transaction PostgreSQL `BEGIN ... COMMIT`, sans erreur, via requête SQL.
**SQL exact exécuté :** `supabase/proposals/20261113_align_public_school_levels_REVIEW_ONLY.sql` (blob Git `606911b299c24c2290f8712b5246ff421372ebc7`). **Ne pas relancer** sans revue et autorisation nouvelle.

## Avant / Après

| Contrôle | Avant | Après |
| --- | ---: | ---: |
| Niveaux publics visibles `public.public_levels` | 16 | 16 |
| Niveaux de gestion `public.levels` | 1 | **16** |
| Niveaux manquants ou ordre divergent | 15 | **0** |
| Niveau `6e` — identifiant | 4 | **4** |
| Niveau `6e` — `order_index` | 1 | 100 (aligné au catalogue) |
| Niveau `4e` dans la gestion | 0 | **1 (id 15)** |
| Classes `public.classes` | 2 | **2** |
| Classes liées à la `6e` | 2 | **2** |
| Classes liées à la `4e` | 0 | **0** |
| Inscriptions `public.student_enrollments` | 2 | **2** |
| Liens familiaux `public.parent_links` | 1 | **1** |
| Comptes `auth.users` | 11 | **11** |
| Profils `public.profiles` | 11 | **11** |

## Niveaux nouveaux

Les 15 codes suivants ont été insérés en `public.levels` avec les ordres du catalogue public : `PS` (5), `MS` (6), `GS` (7), `CP1` (8), `CP2` (9), `CE1` (10), `CE2` (11), `CM1` (12), `CM2` (13), `5e` (14), `4e` (15), `3e` (16), `2nde` (17), `1re` (18), `Tle` (19). Les ID entre parenthèses sont les ID de gestion réellement observés **après** l'opération ; le code de migration ne les fige pas.

Les deux classes `6e A` (2025–2026) et `6e B` (2026–2027) restent liées au niveau `id=4`. Aucun niveau scolaire personnalisé, aucune classe supplémentaire, aucun utilisateur ni lien parent-enfant n'a été créé.

## Contrôles d'intégrité après application

- 16 codes du catalogue public trouvent un niveau de gestion du même code et du même ordre.
- **0** niveau supplémentaire non associé au catalogue.
- **0** doublon de nom, **0** doublon d'ordre, **0** classe orpheline.
- Les deux politiques RLS existantes de `levels` sont conservées.
- Identifiant initial de la `6e` (`4`) conservé.
- Classes, inscriptions, comptes Auth, profils et liens familiaux : volumes inchangés.

## Suite

Le dossier **Yao Tabra** doit désormais afficher « niveau de gestion configuré, mais aucune classe créée pour la 4e » dans **Administration → Demandes d'inscription publiques** après actualisation. Cela **n'autorise pas** la création d'une classe fictive ni l'inscription automatique de l'élève. L'étape suivante du module Apprenant sans e-mail (migration de sécurité et backend Auth) reste à valider séparément.

**Important :** le fichier source est conservé avec son en-tête historique `REVIEW ONLY` pour assurer la traçabilité du SQL exact appliqué. La présente note fait foi pour son statut d'exécution. L'état initial ciblé est enregistré dans `ETAT_AVANT_SYNCHRONISATION_PRODUCTION_2026-11-13.md`. Ce dernier est un instantané logique des données concernées, et non une sauvegarde complète de PostgreSQL.
