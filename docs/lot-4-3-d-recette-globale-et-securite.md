# SCHOOLNET — Bloc 4.3.D : recette globale, confidentialité et livraison

**Date de l'audit :** 09/11/2026  
**Branche :** `feature/schoolnet-notifications` — PR GitHub #5 (brouillon)  
**Base consultée :** `schoolnet_2.0`  
**Décision de test :** le poste de travail actuel n'a pas de caméra ; **les tests vidéo réels de LIVE-FR sont reportés à une Preview Vercel, sur téléphone ou ordinateur équipé**.

> **Mise à jour 09/11/2026 :** la première migration de sécurité (messagerie, `20261109135338`) a été appliquée sur Supabase avec autorisation explicite. La seconde (corrections, `20261109140104`) est **préparée mais non appliquée**. Aucun déploiement Vercel ni aucune fusion dans `main`.

## 1. État fonctionnel consolidé

| Bloc | Réalisé et testé | À vérifier avant livraison |
| --- | --- | --- |
| 4.1 — Centre des notifications | Cloche Realtime, historique, « lu », filtres, affichage au premier plan | Recette finale des quatre rôles et petit écran |
| 4.2 — Préférences | Enregistrement et restauration des options, notifications essentielles conservées | Désactivation effective d'un rappel futur, test de permission navigateur |
| 4.3.A — Présences | Absence et retard confirmés, navigation Parent | Contrôle des statuts spéciaux et mise à jour après clôture |
| 4.3.B — Devoirs et corrections | Publication du devoir, remise, alerte Enseignant, correction publiée, alertes Apprenant et Parent lié, zéro doublon | Quiz/examen, tentative d'accès Parent non lié, non-publication |
| 4.3.C — Emploi du temps | Horaire modifié, désactivé et réactivé ; un avis par destinataire Enseignant et Apprenant | Changement de classe, nouvel enseignant, suppression de créneau fictif, ouverture des liens |
| LIVE-FR | `lang: "fr"` et `setDailyLang("fr")` dans Daily Prebuilt, libellés React français | **Micro/caméra, préconnexion, discussion, partage, reconnexion et responsive sur Vercel Preview après préparation** |
| 4.3.D — Recette et sécurité | Contrôles SQL/RLS, correctif messagerie appliqué (26 migrations), CI automatisée | Recette utilisateur de la messagerie et correctif des corrections encore en attente d'autorisation |

## 2. Vérifications réalisées dans Supabase (lecture seule)

- **25 migrations** au démarrage de 4.3.D ; **26 migrations appliquées après validation du durcissement des relations de messagerie**. La seconde migration de sécurité reste en attente.
- **60 tables publiques sur 60** avec RLS activée ; **5 vues sur 5** avec `security_invoker=true`.
- `chat_message_hidden_for_users` et `live_session_rooms` : pas de politique utilisateur ni de droit de lecture pour `anon` ou `authenticated`. Cette isolation est intentionnelle ; le linter signale « RLS activée sans politique », mais cela ne démontre pas une fuite.
- Isolation RLS testée en transaction `BEGIN READ ONLY` / `ROLLBACK` pour les comptes **student, parent et teacher** : **zéro notification étrangère, zéro préférence étrangère et zéro lien parental non pertinent**. Le compte **admin** dispose d'une visibilité élargie conformément aux politiques actuelles.
- Index unique de notifications présent ; **zéro groupe de doublons** dans les événements enregistrés ; Cron SCHOOLNET LIVE toujours actif chaque minute.
- Recommandations Supabase constatées : **56 fonctions `SECURITY DEFINER` exécutables par `anon`**, **109 par `authenticated`**, **14 fonctions au `search_path` non fixé**, plus des recommandations de performance (38 clés étrangères non indexées et 70 optimisations RLS signalées lors de l'audit). Ce sont des **alertes à analyser, pas 56 failles indépendantes prouvées**.
- Un contrôle positif a néanmoins démontré qu'un rôle anonyme, muni d'identifiants valides, pouvait lire l'appartenance d'un utilisateur à une conversation au moyen de `chat_is_member`. Ce cas a été confirmé sans exposer d'identifiants dans le compte rendu.

Scripts : `supabase/verification/20261109_release_security_readonly.sql` et `supabase/verification/20261109_public_rpc_security_readonly.sql`.

## 3. Corrections de confidentialité — **messagerie appliquée, notes en attente**

### 3.1 Relations de messagerie : `20261109135338_harden_chat_relationship_rpcs.sql`

La fonction `chat_is_member` permettait à un appelant de tester une relation de conversation en fournissant l'identifiant d'un autre utilisateur. Les fonctions `chat_parent_is_linked_to_student` et `chat_teacher_teaches_student` étaient également appelables sans compte.

Le correctif :

- limite les appels aux comptes concernés et à l'administrateur autorisé ;
- protège explicitement le cas **Parent ↔ Enseignant via l'enfant**, indispensable à `chat_can_contact` ;
- interdit `EXECUTE` à `anon` et à `PUBLIC` tout en conservant `authenticated` et `service_role` ;
- fixe `search_path=pg_catalog` et conserve les signatures RPC et la logique métier des relations.

**Application autorisée et exécutée le 09/11/2026 :** migration `20261109135338` enregistrée dans `supabase_migrations.schema_migrations` (26/27 en GitHub). Contenu SQL stocké **identique octet pour octet** au fichier de la branche. Contrôles réels après application : les trois fonctions refusent l'exécution `anon`, conservent `authenticated` et `service_role`, et utilisent `search_path=pg_catalog`. Scénarios transactionnels en lecture seule réussis : membre propriétaire voit ses conversations, appartenance d'autrui masquée, contacts Parent/Enseignant/Apprenant conservés. Les 5 politiques RLS de messagerie et 6 adhésions existantes sont inchangées ; Cron LIVE actif. Les tests navigateur de réception/envoi de messages restent à faire.

### 3.2 Publication des notes : `20261109140104_harden_assessment_legacy_rpcs.sql`

Deux anciennes RPC `SECURITY DEFINER` ne vérifiaient pas correctement l'appartenance de l'évaluation :

- `publish_assessment_submission(uuid)` pouvait être appelée sans garde-fou propriétaire ;
- `mark_submission_as_graded(uuid,text)` ne disposait pas de la même vérification que la version moderne `mark_submission_as_graded_v2`.

La fonction technique `recalculate_submission_score(uuid)` était également exposée comme RPC malgré son appel normal par un déclencheur.

Le correctif :

- impose `assessments.created_by = auth.uid()` avant notation historique ou publication ;
- révoque l'exécution anonyme des fonctions de publication et de notation ;
- limite le recalcul direct au rôle de service ; le déclencheur `trg_submission_question_grades_recalculate_score` conserve sa capacité de calcul ;
- ne modifie **aucune note ni aucune copie historique**.

**Statut : migration `20261109140104` NON appliquée.** Vérification transactionnelle avec annulation réussie : publication refusée avec le compte Apprenant, autorisée avec le compte Enseignant propriétaire ; déclencheur de notification conservé, aucune écriture persistante. Son application nécessitera une nouvelle autorisation.

### Précautions de déploiement SQL

1. Conserver l'ordre des migrations : `20261109135338` puis `20261109140104`.
2. Demander **une autorisation explicite** avant chaque application à `schoolnet_2.0` ; ne pas appliquer les deux à l'insu de l'utilisateur.
3. Appliquer la version exacte du fichier GitHub avec précontrôle, transaction atomique et enregistrement dans `supabase_migrations.schema_migrations`.
4. Réexécuter les scripts de vérification **en lecture seule** après chaque application.
5. Vérifier les workflows Messagerie et Corrections avec les comptes factices ; ne pas modifier les permissions des autres RPC sans examen des dépendances.

**Statut au 09/11/2026 : 26 migrations appliquées dans `schoolnet_2.0`, 1 en attente (`20261109140104`).** La première migration a bien été enregistrée ; les tests `ROLLBACK` de la seconde ne constituent pas un déploiement.

## 4. Qualité du code et dépendances

- Ajout de `.github/workflows/schoolnet-quality.yml` : contrôle à chaque mise à jour de PR, permissions GitHub minimales, **aucun secret Supabase**, aucun déploiement.
- Installation reproductible `npm ci` → `npm run lint` → `npm run build`, sous Node.js 24.
- Première exécution : échec reproductible à cause d'une dépendance transitive manquante (`@floating-ui/dom@1.8.0`) dans `package-lock.json`.
- Verrouillage corrigé à partir des métadonnées remontées par npm dans GitHub Actions ; exécution suivante **réussie**, sans contournement de `npm ci`.
- Les recommandations de performance (bundle Vite important, index et RLS) restent identifiées pour une optimisation mesurée. Ne pas supprimer ou ajouter massivement des index sans analyse d'usage.

## 5. Plan de recette avant fusion

| Priorité | Vérification ciblée | Critère de succès |
| --- | --- | --- |
| **P0** | Durcissement Messagerie appliqué ; durcissement Corrections à autoriser séparément | Accès anonyme aux relations de messagerie bloqué ; aucune publication par un autre enseignant/apprenant après seconde migration |
| **P0** | Tester Messagerie et publication de correction après changements SQL | Contact Parent/Enfant/Professeur, notes et notifications toujours fonctionnels |
| P1 | Contrôler les rôles en navigateur sur ordinateur | Navigation et données strictement accessibles pour Admin/Enseignant/Apprenant/Parent |
| P1 | Tester un rappel facultatif réellement désactivé | Aucune notification de rappel non souhaitée, alertes essentielles toujours reçues |
| P1 | Tester les actions d'emploi du temps encore non couvertes | Classe/enseignant réaffectés et suppression fictive : bons destinataires, aucun doublon |
| P1 | Examiner fonctions `SECURITY DEFINER` restantes | Arbitrage par risque et dépendances, corrections versionnées |
| P2 | Optimiser index/RLS et fractionnement du bundle | Mesure avant/après, aucune dégradation fonctionnelle |
| **Avant validation LIVE-FR** | Publier une **Preview Vercel de la branche** sans fusionner `main` | URL accessible sur téléphone/PC équipé ; comptes de test seulement |
| **Validation LIVE-FR** | Deux participants et tous contrôles Daily en français | Préconnexion, caméra/micro, participants/chat, partage, plein écran, sortie, pause et reprise, mobile |
| **Clôture** | PR #5, migrations, GitHub Actions, conformité RLS | Revue et accord distinct pour la fusion puis la mise en production |

### Règles de livraison

Le poste professionnel sans webcam ne permet pas de démontrer le bon fonctionnement réel des médias. **Ne pas déclarer LIVE-FR « testé et validé »** tant qu'une session réelle sur Preview Vercel n'a pas été effectuée. Ne pas déclencher de déploiement de production pour un simple contrôle.

L'activation des correctifs de sécurité et la publication du frontend sont **deux décisions différentes**, à autoriser séparément.
