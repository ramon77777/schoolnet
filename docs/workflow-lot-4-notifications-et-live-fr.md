# SCHOOLNET — Workflow consolidé : notifications et visioconférence en français

**Mise à jour :** 09 novembre 2026  
**Branche de travail :** `feature/schoolnet-notifications`  
**Statut :** planification ; la localisation Daily n'est pas encore implémentée ou déployée.  
**Règle :** conserver `main` inchangée ; ne pas modifier la production ou fusionner sans autorisation distincte.

## 1. Validation de faisabilité — Daily Prebuilt

SCHOOLNET LIVE utilise `@daily-co/daily-js`, notamment `daily.createFrame(containerRef.current, {...})` dans `src/features/live/pages/LiveRoomPage.tsx`.

Daily Prebuilt supporte officiellement le français. Le paramètre de configuration `lang: "fr"` permet de sélectionner la langue à la création de l'iframe Daily ; Daily documente également `setDailyLang("fr")` après `join()` si un réglage explicite est nécessaire.

Sources éditeur :
- https://www.daily.co/blog/french-localization-for-api-video-calls/
- https://www.daily.co/blog/multi-language-support/
- https://www.daily.co/features/prebuilt/

**Périmètre :** traduire les commandes et messages propres à Daily Prebuilt (avant-connexion, pendant le cours, participants, chat, partage, caméra, micro, quitter, vues, paramètres). Il ne s'agit **pas** de traduction automatique de la parole ni de modification de la langue des prompts natifs du navigateur.

L'option front-end est privilégiée, car elle permet de cibler SCHOOLNET sans changer les paramètres du domaine Daily ni ceux des salles d'autres applications.

## 2. Ordre du workflow conservé et complété

| Ordre | Bloc | Action | État au 09/11/2026 |
| --- | --- | --- | --- |
| 1 | 4.1 — Centre de notifications | Historique, filtres, marqueur lu, cloche | Tests fonctionnels précédemment validés |
| 2 | 4.2 — Préférences | Canaux facultatifs, isolation comptes, Cron | Tests utilisateur validés ; recette d'un rappel réellement désactivé à compléter |
| 3 | 4.3.A — Présences | Alertes absence et retard, RLS, liens | Migration appliquée et deux alertes réellement reçues ; ouverture Parent confirmée |
| 4 | **4.3.B — Devoirs, évaluations, résultats** | Nouveaux filtres, correction de la relation parent-enfant, test de publications nouvelles | **Code synchronisé, lint et build locaux réussis. Migration `20261109082000` toujours NON appliquée ; tests fonctionnels à réaliser** |
| 5 | **4.3.C — Emploi du temps** | Alerter sur changement réel des créneaux, des enseignants et des salles, avec anti-doublons | À développer |
| 6 | **LIVE-FR — Interface vidéo des cours en français** | Régler la langue de Daily Prebuilt à `fr`, tests Enseignant/Apprenant et responsive | **Nouvelle demande ajoutée au workflow ; à implémenter après 4.3.C, avant la recette globale** |
| 7 | **4.3.D — Recette globale et sécurité** | Notifications et LIVE-FR, quatre rôles, RLS, pas de doublons, Cron, lint/build, PWA/navigateurs, Preview | À terminer |
| 8 | **Clôture du Lot 4** | Revue PR, sauvegarde, fusion et déploiement uniquement après validation explicite | Non engagé |

Ce nouvel item `LIVE-FR` s'ajoute **sans renuméroter ni supprimer** les blocs 4.3.C et 4.3.D.

## 3. Tâches techniques prévues pour LIVE-FR

1. Vérifier la version `@daily-co/daily-js` effectivement résolue par le lockfile et les options de `createFrame`.
2. Dans `src/features/live/pages/LiveRoomPage.tsx`, configurer `lang: "fr"` **lors de la création de Daily Prebuilt**, sans réinitialiser le lecteur lors d'un changement d'état React.
3. Vérifier la priorité éventuelle de la langue portée par le jeton/salle/domaines. Si la configuration front-end ne suffit pas, examiner l'appel `setDailyLang("fr")` une fois la connexion établie, sans modifier les droits ni les jetons.
4. Tester les écrans de préconnexion, entrée dans la salle, caméra, micro, choix de périphériques, participants, chat, partage d'écran, disposition, paramètres, sortie.
5. Tester enseignant et apprenant sur ordinateur et mobile (largeurs d'écran et mise en page).
6. Tester une reprise après mise en pause, une reconnexion après coupure, le plein écran et le retour au calendrier : la langue doit rester française.
7. Vérifier que la présence, les fonctions de notification, les salles Daily et leurs droits d'accès continuent de fonctionner.
8. Ne pas promettre une traduction complète des dialogues natifs du navigateur ou des textes Daily non localisés par la version installée. Identifier les chaînes résiduelles au cours de la recette.

## 4. Conditions de validation et de livraison

**Préparation :** code sur la branche de développement et PR en brouillon.  
**Contrôle technique :** `npm run lint`, `npm run build`, `git status --short`.  
**Contrôle fonctionnel :** captures avant/après sur comptes Enseignant et Apprenant, vidéo et audio vérifiés, réglage français après reconnexion, affichage mobile.  
**Déploiement :** aucun changement de `main` ni de l'environnement Vercel de production avant approbation.

Les captures fournies de `schoolnet-snowy.vercel.app` illustrent l'interface de production existante : elles ne constituent pas un test de la branche locale en cours.

## 5. Prochaine action immédiate

Ne pas interrompre les tests du **Bloc 4.3.B** : ils viennent de réussir `lint` et `build`. Prochaine étape : décider de l'application contrôlée de la migration `20261109082000_notify_corrections_linked_parents.sql`, puis effectuer des publications et corrections de test, en protégeant les notes non publiées.

Ensuite : Bloc 4.3.C → LIVE-FR → recette globale 4.3.D → clôture de PR après validation.
