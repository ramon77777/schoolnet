# SCHOOLNET — État ciblé avant synchronisation des niveaux (13 novembre 2026)

**Projet Supabase principal :** `anttmbhaphkhmkoqsofd` (`schoolnet_2.0`).  
**Autorisation de l'utilisateur :** oui, pour la synchronisation des 15 niveaux manquants exclusivement.  
**Cette note est un instantané logique ciblé, pas une sauvegarde complète de PostgreSQL.**

## Inventaire contrôlé, en lecture seule

- `public.public_levels` : 16 lignes visibles, aucune répétition des codes courts ou des ordres.
- `public.levels` : une seule ligne, `id=4`, `name='6e'`, `order_index=1`, `created_at='2026-04-18 08:37:42.106157+00'`.
- `public.classes` : deux lignes, toutes deux liées à `level_id=4` :
  - `6e A`, année `2025-2026` ;
  - `6e B`, année `2026-2027`.
- `public.student_enrollments` : 2 lignes.
- `public.parent_links` : 1 ligne.
- `auth.users` : 11 comptes.
- `public.profiles` : 11 profils.
- Niveaux manquants par correspondance `lower(trim(levels.name))=lower(trim(public_levels.short_label))` : 15.
- Niveau demandé `4e` : présent et visible dans le catalogue public, absent de `levels`, sans classe.
- `levels_id_seq` : `last_value=4` avant synchronisation.
- Aucun niveau scolaire personnalisé non reconnu, aucun conflit d'ordre avec le catalogue public.
- Aucun déclencheur applicatif personnalisé sur `levels`.

## Modification approuvée

Script existant : `supabase/proposals/20261113_align_public_school_levels_REVIEW_ONLY.sql`.

Cette synchronisation est limitée à `public.levels` et exécute une transaction PostgreSQL `BEGIN ... COMMIT` avec contrôles et arrêt sur incohérence. Elle préserve `id=4` pour la `6e`, met son ordre de tri en correspondance avec le catalogue (`1 → 100`) et insère les 15 niveaux manquants. Elle ne crée aucune classe et ne modifie ni inscriptions, ni comptes, ni rôles, ni liens familiaux.

**Une remise en arrière de données n'est PAS effectuée automatiquement** : elle exigerait une revue séparée des éventuelles dépendances après migration.
