# SCHOOLNET — Bloc 4.3.C : notifications de l'emploi du temps

**État au 09/11/2026 :** code et migration préparés sur `feature/schoolnet-notifications`. Essai transactionnel avec `ROLLBACK` réussi ; migration **non appliquée**, pas de changement de `main` ni de Vercel.

## 1. Audit de l'existant

Le module Admin modifie directement `public.timetable_slots` :

- création : `createAdminTimetableSlot` avec `INSERT` ;
- modification : `updateAdminTimetableSlot` avec `UPDATE` des attributs ;
- activation / désactivation : `setAdminTimetableSlotActive` avec `UPDATE(is_active)` ;
- suppression définitive : `deleteAdminTimetableSlot` avec `DELETE`.

La table conserve l'année scolaire, la classe, le cours, l'enseignant, la salle éventuelle, le jour hebdomadaire, les heures, les notes et l'état actif. Ses contrôles actuels empêchent les conflits d'horaires, contrôlent l'affectation des enseignants et protègent l'accès par RLS. **Les notifications n'existaient pas encore.**

Les droits de lecture des élèves dans l'emploi du temps utilisent `class_students`. Cette même table sera utilisée pour identifier les apprenants destinataires, et non une liste de destinataires maintenue côté navigateur.

## 2. Décisions du périmètre

| Opération | Notification | Destinataires |
| --- | --- | --- |
| Création initiale d'un créneau | **Non** : éviter les alertes pendant la préparation du planning | — |
| Changement réel du jour, des heures, de la salle, du cours ou de l'affectation | Oui | Enseignant précédent/nouveau et élèves des classes précédente/nouvelle, tant que le créneau est visible |
| Désactivation d'un créneau actif | Oui, « Créneau désactivé » | Anciens destinataires |
| Réactivation d'un créneau inactif | Oui, « Créneau réactivé » | Nouveaux destinataires |
| Suppression d'un créneau actif | Oui, « Créneau supprimé » | Anciens destinataires |
| Modification des notes uniquement, `updated_at` seul, sauvegarde sans changement | **Non** | — |
| Modification d'un créneau entièrement inactif / d'une année archivée | **Non** | — |

**Parents :** la page Emploi du temps Parent existe, mais le Bloc 4.3.C limite initialement les notifications aux **enseignants et apprenants**. Une extension spécifique aux parents sera possible après décision, sans notification implicite supplémentaire.

Les créneaux sont **récurrents par jour de semaine** : aucune date de cours inventée n'est insérée dans les notifications.

## 3. Implémentation sur la branche

- `supabase/migrations/20261109114749_notify_timetable_changes.sql` : nouvelle fonction interne `schoolnet_private.notify_timetable_changes()`, déclenchée `AFTER UPDATE OR DELETE` sur `public.timetable_slots`.
- `src/features/notifications/pages/NotificationsPage.tsx` : nouvelle catégorie et filtre **Emploi du temps** sur les événements `timetable:%`.
- `supabase/verification/20261109_timetable_notifications_readonly.sql` : contrôle des droits, du trigger, des destinataires, des URL, des doublons et du Cron.
- Les liens d'action sont génériques et toujours accessibles : enseignant `/app/teacher/timetable`, apprenant `/app/student/timetable`. Cela évite un lien mort après suppression du créneau.

### Protection contre les doublons et changements successifs

Une seule clé `timetable:<nature>:<uuid_evenement>` est générée **par véritable modification**, puis réutilisée pour tous les destinataires. Les candidats enseignants et élèves sont agrégés et dédoublonnés par `user_id`, avec `ON CONFLICT DO NOTHING` et l'index existant `idx_notifications_event_unique`. Cela empêche deux alertes pour **le même changement**, sans bloquer une deuxième modification réellement différente d'un même créneau.

### Protection des données et des droits

La fonction appartient au schéma non exposé `schoolnet_private`, est `SECURITY DEFINER` avec `search_path=pg_catalog` et révoque `EXECUTE` pour `PUBLIC`, `anon` et `authenticated`. Elle n'est appelée que par le trigger sur une modification déjà autorisée de `timetable_slots` (RLS admin).

Les notifications ne contiennent **ni note, ni résultat, ni données individuelles supplémentaires**. Elles ne doivent pas dévoiler le nouveau contenu d'une classe à un destinataire qui a perdu son affectation : le message de retrait reste générique.

## 4. Recette ciblée après autorisation d'appliquer la migration

| Étape | Action sur comptes et données de test | Résultat attendu |
| --- | --- | --- |
| 1 | Enregistrer une fiche sans changement | 0 nouvelle notification |
| 2 | Changer le jour ou l'heure d'un créneau actuel actif | Une nouvelle notification pour chaque enseignant/apprenant concerné ; bon lien et filtre |
| 3 | Changer uniquement la salle | Notification de changement de salle |
| 4 | Modifier uniquement le champ Notes | 0 notification |
| 5 | Réaffecter à un autre enseignant | L'ancien et le nouveau sont informés ; un enseignant tiers ne reçoit rien |
| 6 | Changer de classe (et de cours conformément aux contraintes) | Anciens et nouveaux apprenants concernés, aucun autre compte |
| 7 | Désactiver puis réactiver | Deux événements **distincts** avec titre adapté |
| 8 | Supprimer un créneau actif de test | Avis « Créneau supprimé » ; bouton Ouvrir reste fonctionnel |
| 9 | Modifier un créneau inactif ou archivé | 0 notification |
| 10 | Effectuer deux changements réels consécutifs | Deux alertes légitimes, zéro doublon par événement |
| 11 | Vérifier la cloche sur les profils Enseignant, Apprenant, Parent et Admin | Pas de destinataire parasite, panneau au premier plan |
| 12 | Exécuter le script en lecture seule, `npm run lint` et `npm run build` | Permissions, RLS, index et Cron conformes, aucune erreur |

**Attention :** si l'on supprime le seul créneau actuel, cela perturberait le planning de test. Ne supprimer que des créneaux fictifs spécialement créés pour la recette.

## 5. Déploiement et séquence projet

1. Sur la branche, exécuter `git pull --ff-only origin feature/schoolnet-notifications`, `npm run lint` et `npm run build`.
2. Ne pas déployer la migration avant **autorisation explicite**, même si le test transactionnel avec `ROLLBACK` s'est déroulé sans erreur.
3. Après autorisation : appliquer uniquement la migration `20261109114749` dans une transaction avec inscription dans `supabase_migrations.schema_migrations`, puis audits lecture seule et recette utilisateur ciblée.
4. Ne pas fusionner dans `main` avant la recette globale.
5. Workflow restant : **4.3.C → LIVE-FR (Daily Prebuilt en français) → 4.3.D (recette globale, sécurité) → validation de fusion**.

**État de Supabase avant application :** 24 migrations, trigger `trg_notify_timetable_changes` absent, aucune alerte `timetable:%`, Cron SCHOOLNET LIVE actif chaque minute.
