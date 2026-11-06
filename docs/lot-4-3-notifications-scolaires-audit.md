# SCHOOLNET — Lot 4.3 : audit technique et plan d’intégration

**Date :** 06/11/2026  
**Branche :** `feature/schoolnet-notifications`  
**Projet Supabase examiné :** `schoolnet_2.0` (`anttmbhaphkhmkoqsofd`)  
**Statut :** audit et spécification uniquement — aucun SQL 4.3 appliqué, aucune fonctionnalité 4.3 déployée.

## 1. Principes à respecter

1. Réutiliser `public.notifications`, le centre `/app/notifications`, la cloche Realtime et les contrôles d'accès existants.
2. Ne pas recréer les alertes déjà installées pour évaluations, corrections, bulletins, inscriptions et SCHOOLNET LIVE.
3. Déclencher les alertes côté PostgreSQL **après un événement métier effectif**, et jamais seulement à la consultation d'une page.
4. Ne transmettre une information scolaire qu'à un utilisateur autorisé. Vérifier le lien parental et le rattachement de classe.
5. Respecter l'index existant `idx_notifications_event_unique` sur `(user_id,event_key,related_id)` lorsque les deux dernières colonnes ne sont pas NULL.
6. Ne jamais mettre de secrets, de données personnelles détaillées ni de notes confidentielles dans le texte d'une notification.
7. Préserver la configuration de `cron.job` de SCHOOLNET LIVE et les 21 migrations déjà enregistrées.
8. Conserver `main` intacte jusqu'à la recette et l'autorisation de fusion.

## 2. État réel vérifié

| Domaine | Objets et workflows déjà présents | Événement notifier | Action recommandée |
| --- | --- | --- | --- |
| Absences / retards | `attendance_sessions`, `attendance_records`, `attendance_justifications`. L'enseignant renseigne tous les statuts, puis clôture la séance par passage `status='closed'`. Aucun trigger de notification métier trouvé sur ces tables. | Une absence ou un retard confirmé au moment de la clôture | **Nouveau** trigger après transition vers `closed`. |
| Publication devoir / quiz / examen | `assessments` (`type=assignment/quiz/exam`, `status=draft/published/closed`). Trigger `trg_notify_assessment_published` et fonction `notify_assessment_published` actifs. Destinataires : élèves inscrits au cours ou à sa classe. | Passage de l'évaluation à `published` | **Conserver**, ne pas dupliquer. Vérifier en recette et fiabiliser l'affichage/catégorisation. |
| Correction et résultats | Triggers `trg_notify_assessment_correction_published` et `trg_notify_homework_correction_published` actifs lors du passage des copies à `published`. Alertes élèves et parents. | Publication d'une correction | **Conserver** ; vérifier les liens parent-enfant et destinations des notifications, sans dupliquer. |
| Emploi du temps | `timetable_slots` : cours, classe, enseignant, salle, jour hebdomadaire, horaires, `is_active`. Interface admin : création, modification, activation/désactivation et suppression. Aucun trigger de notification métier trouvé. | Modification réelle d'un créneau ou désactivation/suppression | **Nouveau** trigger différenciant les changements significatifs des modifications non pertinentes. |
| Affichage | `NotificationsPage.tsx` classe actuellement en LIVE, bulletins, inscriptions ou « Informations ». | Événements `assessment_published`, `correction_published`, futurs `attendance:*`, `timetable:*` | **Étendre** catégories/filtres sans modifier la structure de `notifications`. |

### Précision importante sur les parents

Les fonctions de correction existantes recherchent les parents via `profiles.child_ids`, tandis que la table relationnelle `parent_links` sert également aux autorisations. Un contrôle ponctuel a trouvé les liens actuels cohérents, **sans garantie pour les futurs comptes**.

Avant d'ajouter de nouveaux événements, fixer une source autoritative pour la relation parent-enfant, idéalement `parent_links` avec vérification de compatibilité des flux `profiles.child_ids`. Ne pas modifier silencieusement les anciens mécanismes lors de cette phase.

### Précision importante sur les évaluations

Les index existants n'imposent pas l'unicité de `event_key` seul pour les évaluations ; la protection générale est `(user_id,event_key,related_id)`. Les fonctions de publication existantes utilisent par exemple les clés `assessment_published` et `correction_published` avec des identifiants `related_id` distincts. Ne pas rajouter un trigger équivalent sur les mêmes événements.

## 3. Spécification fonctionnelle à implémenter

### 4.3.1 — Absences / retards

**Source de vérité :** transition `attendance_sessions.status` vers `closed` après enregistrement de tous les `attendance_records`.

- Notifier les parents réellement liés aux élèves marqués `absent` ou `late`.
- Ignorer `present` et les séances `draft`, `open`, `cancelled`.
- Ne pas notifier chaque frappe ou enregistrement provisoire de l'enseignant.
- Prévoir une clé idempotente par feuille de présence / élève / événement.
- Utiliser `/app/parent/attendance` comme destination autorisée, sans exposer d'informations médicales ou de justification.
- Vérifier séparément le cas d'un ajustement exceptionnel après clôture : **ne pas renvoyer un doublon ni créer une alerte trompeuse**.
- Ne pas masquer la décision de justification : l'alerte indique un statut de présence constaté, pas une sanction.

### 4.3.2 — Devoirs / évaluations / corrections

**Ne pas créer de nouveau trigger sur `assessments`, `assessment_submissions` ou `homework_submissions` sans preuve d'un manque.**

- Tester la publication d'un devoir et d'un quiz/examen avec des comptes de test.
- Tester la publication d'une correction pour l'apprenant et le parent autorisé.
- Vérifier la correspondance des routes de destination :
  - `/app/student/homework/:id`
  - `/app/student/assessments/:id`
  - `/app/student/assessments/:id/result`
  - `/app/parent/results/:id?childId=...`
- Ajouter dans la page de notifications les libellés et filtres « Devoirs et évaluations » et « Résultats » pour les événements existants.
- Vérifier qu'un changement de statut sans véritable publication ne déclenche pas d'alerte et qu'une même publication ne crée pas deux lignes par destinataire.

### 4.3.3 — Modifications d'emploi du temps

**Source :** changements SQL réellement effectués dans `timetable_slots`.

- Identifier avec `OLD` et `NEW` les changements pertinents : classe, cours, enseignant, jour, horaire, salle, `is_active`.
- Ne pas émettre d'alerte pour un `UPDATE` identique ou un simple changement de métadonnées.
- Distinguer : « Créneau modifié », « Créneau désactivé » et « Créneau supprimé ».
- Destinataires proposés : enseignant concerné, élèves de la classe concernée. Si la classe ou l'enseignant change, considérer les destinataires **anciens et nouveaux** avec un message adapté.
- Les créneaux étant hebdomadaires, parler de « jour/horaires hebdomadaires » sans inventer une date précise.
- Orienter chaque rôle vers son emploi du temps autorisé :
  - enseignant : `/app/teacher/timetable`
  - élève : `/app/student/timetable`
  - parent, si retenu dans le périmètre : `/app/parent/timetable`
- Pour les suppressions réelles, enregistrer l'alerte dans la même transaction que la suppression, sans supposer que le créneau restera consultable.
- Protéger les événements des doublons tout en autorisant plusieurs véritables modifications successives d'un même créneau.

## 4. Modèle technique proposé

- Une **migration SQL versionnée**, créée avec la CLI Supabase lors de l'implémentation, contenant les nouvelles fonctions/triggers du Bloc 4.3.
- Fonctions PostgreSQL internalisées dans `schoolnet_private`, avec `SET search_path` fixé, noms d'objets qualifiés, droits `EXECUTE` minimaux et mécanisme d'autorisation explicite.
- Réutiliser `public.notifications` ; colonnes `user_id`, `title`, `body`, `type`, `event_key`, `related_id`, `action_url`. Pas de duplication de stockage.
- RLS actuelle de `public.notifications` conservée ; déclencheurs en base responsables des insertions métier, pas le navigateur.
- `event_key` stable pour la clôture d'une feuille ; versionné par modification effective pour les changements d'emploi du temps.
- `on conflict do nothing` en complément de l'index d'unicité existant, jamais comme seule protection.
- Frontend : enrichir `CATEGORIES` et `notificationCategory` dans `src/features/notifications/pages/NotificationsPage.tsx`.
- Ne pas étendre automatiquement `notification_preferences` : ces événements sont des informations de suivi scolaire essentielles tant qu'une nouvelle décision produit n'a pas été prise.

## 5. Plan de recette avant fusion

| Cas | Résultat attendu |
| --- | --- |
| Clôture avec élève présent | Aucun avis d'absence ni de retard |
| Clôture avec élève absent | Un avis aux parents autorisés ; pas aux parents d'un autre enfant |
| Clôture avec élève en retard | Un avis spécifique ; durée uniquement si validée |
| Réouverture/retour/sauvegarde sans événement nouveau | Pas de doublon |
| Publication d'un devoir puis d'une autre évaluation | Deux notifications légitimes, sans duplication par type |
| Publication d'une correction | Apprenant et parent liés informés ; aucune note non publiée révélée |
| Modification du jour, horaire, salle ou enseignant | Notification aux bénéficiaires concernés |
| Modification sans effet / données techniques seulement | Aucun avis |
| Désactivation / suppression d'un créneau | Avis adapté, liens toujours utilisables |
| Test parent lié + parent non lié | Accès strict au dossier autorisé |
| Comptes administrateur, enseignant, apprenant, parent | Cloche, filtres et destination adaptés à leur rôle |
| Test SQL et frontend | `npm run lint`, `npm run build`, script de vérification en lecture seule, contrôle RLS et Cron |

## 6. Ordre de réalisation proposé (après validation)

1. **4.3.A** : développer et tester l'alerte absences/retards à la clôture.
2. **4.3.B** : vérifier les alertes déjà existantes pour devoirs/évaluations/corrections et enrichir les catégories dans le centre.
3. **4.3.C** : développer et tester l'alerte de modification d'emploi du temps.
4. **4.3.D** : recette croisée des quatre rôles, absence de doublons, droits RLS et contrôle Cron, puis Preview et validation.

**Aucune opération de déploiement ne doit être lancée à partir de ce seul document.** Les migrations SQL et modifications de code feront l'objet d'une validation séparée avant application en production et avant fusion dans `main`.
