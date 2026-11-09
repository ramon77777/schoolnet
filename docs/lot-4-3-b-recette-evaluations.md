# SCHOOLNET — Bloc 4.3.B : publications et résultats

**État :** développement préparé sur `feature/schoolnet-notifications`, en attente de vérifications locales et de recette.  
**Aucune migration 4.3.B exécutée en production ; pas de fusion dans `main`.**

## 1. Événements existants (confirmés par audit en lecture seule)

| Événement | Déclencheur SQL existant | Clé événement | Destinataires | Destination |
| --- | --- | --- | --- | --- |
| Devoir publié | `trg_notify_assessment_published` sur `assessments` | `assessment_published` | Élèves du cours ou de sa classe | `/app/student/homework/:id` |
| Quiz publié | Même déclencheur | `assessment_published` | Élèves du cours ou de sa classe | `/app/student/assessments/:id` |
| Examen publié | Même déclencheur | `assessment_published` | Élèves du cours ou de sa classe | `/app/student/assessments/:id` |
| Correction d'évaluation publiée | `trg_notify_assessment_correction_published` sur `assessment_submissions` | `correction_published` | Élève + parent lié | `/app/student/assessments/:id/result` et `/app/parent/results/:id?childId=:studentId` |
| Correction de devoir publiée | `trg_notify_homework_correction_published` sur `homework_submissions` | `correction_published` | Élève + parent lié | `/app/student/homework/:id` et `/app/parent/results/:id?childId=:studentId` |
| Bulletin publié | `trg_notify_report_card_published` sur `report_cards` | `report_card_published:<bulletin_id>` | Élève + parent | Catégorie distincte « Bulletins » |

Les notifications scolaires sont stockées dans `public.notifications` et protégées par `idx_notifications_event_unique` (utilisateur, événement, objet concerné).

## 2. Modifications préparées

- `src/features/notifications/pages/NotificationsPage.tsx` : ajout des catégories **Devoirs et évaluations** et **Résultats et corrections**, avec filtres serveur précis sur les **clés historiques exactes** `assessment_published` et `correction_published`.
- `supabase/migrations/20261109082000_notify_corrections_linked_parents.sql` : corrige les deux fonctions de notification parentale des corrections en utilisant la source de confiance `public.parent_links` plutôt que `profiles.child_ids`. Les triggers, textes d'alerte, destinations, index et règles de publication sont conservés.
- `supabase/verification/20261109_schoolnet_assessment_notifications_readonly.sql` : contrôle en lecture seule des déclencheurs, migrations, politiques, catégories, doublons et relations autorisées.

### Important : pas de rétroactivité

Au moment de l'audit, 12 évaluations et 7 corrections étaient déjà publiées, mais aucune notification `assessment_published` ou `correction_published` n'était enregistrée. Ce constat ne démontre pas une anomalie des triggers : leurs événements peuvent être antérieurs à leur installation. Il n'est pas prévu de reconstituer artificiellement des notifications historiques.

### Sécurité

Les anciennes fonctions de correction notifiaient les parents listés dans `profiles.child_ids`, alors que l'accès aux résultats d'un enfant dépend des liens de `parent_links`. Les données actuelles montrent une correspondance complète des liens existants, mais le correctif évite les divergences futures et préserve l'autorisation parentale.

**La migration n'est pas encore appliquée** : il faut l'autoriser distinctement après vérification des fichiers et recette.

## 3. Recette ciblée à effectuer avec des comptes de test

1. **Publication d'un nouveau devoir** par l'enseignant : l'apprenant inscrit reçoit **Nouveau devoir disponible**, le filtre « Devoirs et évaluations » affiche la ligne et **Ouvrir** mène au devoir.
2. **Publication d'un nouveau quiz ou examen** : même filtre, sans doublon ; ouverture de la page Apprenant appropriée.
3. **Correction non publiée (statut graded)** : aucune notification « Correction disponible » ne doit être envoyée. Les parents ne doivent pas consulter la note avant publication.
4. **Publication de la correction** : un avis pour l'apprenant et chacun des parents actuellement liés ; le filtre « Résultats et corrections » fonctionne et les liens mènent aux résultats.
5. **Parent non lié à l'enfant** : aucune notification de correction ; accès refusé aux résultats de cet enfant.
6. **Répétition d'une sauvegarde sans nouvelle publication** : aucun nouvel avis pour le même événement.
7. **Autres catégories** : historiques LIVE, absences/retards et bulletins toujours présents, recherche/pagination/lecture inchangées.
8. **Vérifications techniques** : `npm run lint`, `npm run build` et script SQL read-only. Confirmer le Cron LIVE actif et la migration 4.3.A inchangée.

## 4. Ordre de déploiement

1. Vérifier le code frontend sur la branche avec lint/build.
2. Soumettre la migration des liens parentaux à vérification transactionnelle puis approbation explicite.
3. Activer la migration 4.3.B **uniquement avec validation**, en conservant la version exacte de GitHub.
4. Réaliser la recette de publication et de correction sur des données de test.
5. Continuer le Bloc 4.3.C (modifications de l'emploi du temps), sans fusionner la PR avant recette globale.

## 5. Correctifs de recette — remise des travaux et affichage de la cloche (09/11/2026)

Les tests ont montré deux problèmes indépendants :

1. **Remise d'un devoir :** une copie `homework_submissions.status='submitted'` était bien enregistrée, mais aucun déclencheur n'avertissait l'enseignant. Les triggers existants ne couvraient que la publication des corrections.
2. **Affichage transversal :** le panneau déroulant `NotificationBell` restait prisonnier du contexte d'empilement CSS de l'en-tête et passait derrière les bannières des tableaux de bord des différents rôles.

### Modifications sur `feature/schoolnet-notifications`

- `src/features/notifications/components/NotificationBell.tsx` : panneau rendu avec `createPortal(...,document.body)`, position fixe ajustée à la cloche et à la taille de l'écran ; fermeture au clic extérieur ou avec Échap ; interaction et historique existants conservés.
- `src/features/notifications/pages/NotificationsPage.tsx` : nouvelle catégorie `Travaux remis` pour les clés `submission:%`.
- `supabase/migrations/20261109105000_notify_teacher_submissions.sql` : **préparée, non appliquée**, création des alertes aux enseignants responsables quand un devoir ou une évaluation en ligne devient `submitted` pour la première fois. Vérification de la responsabilité par `assessments.created_by` ou `course_teachers`, RLS et index anti-doublons conservés.
- `supabase/verification/20261109_teacher_submissions_readonly.sql` : lecture seule pour contrôler triggers, destinataires, URLs, index, RLS, Cron et doublons.

### Test ciblé à réaliser après validation et application séparée de la migration

1. Sur le compte Apprenant, **un nouveau travail non soumis** est remis pour la première fois : l'Enseignant reçoit `Nouveau devoir remis` ou `Nouvelle copie à corriger` selon le type.
2. Filtre `Travaux remis` et `Ouvrir` mènent à `/app/teacher/grading?assessmentId=...` avec la bonne évaluation.
3. Un enseignant qui n'a aucun lien avec le cours ne reçoit rien.
4. Réenregistrer un rendu déjà `submitted` ne crée pas de doublon. Une remise antérieure à la migration n'est pas notifiée rétroactivement.
5. Le panneau de cloche s'affiche **entièrement au-dessus** des bannières du tableau de bord pour Admin, Enseignant, Apprenant et Parent, y compris à faible largeur d'écran.
6. Le marquage comme lu, `Tout marquer comme lu`, `Voir toutes les notifications`, la fermeture au clic extérieur et au clavier fonctionnent toujours.
7. `npm run lint`, `npm run build`, puis recette réelle après autorisation SQL. `main` et Vercel production restent inchangés durant ce travail.

**Statut avant validation :** essai SQL transactionnel `BEGIN; ... ROLLBACK` réussi ; 23 migrations en production et Cron LIVE actif ; nouvelle migration ni trigger activé. Aucun SQL définitif appliqué sans accord.
