# SCHOOLNET — Workflow consolidé : notifications et visioconférence en français

**Mise à jour :** 09 novembre 2026  
**Branche de travail :** `feature/schoolnet-notifications`  
**Statut :** LIVE-FR implémenté sur la branche de développement ; en attente de compilation locale et de recette Enseignant/Apprenant. Aucun déploiement Vercel.  
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
| 4 | **4.3.B — Devoirs, évaluations, résultats** | Nouveaux filtres, soumissions et corrections, notifications Parent/Enseignant | **Scénarios principaux validés ; migrations `20261109082000` et `20261109105000` appliquées. Recette sécurité et cas particuliers restants.** |
| 5 | **4.3.C — Emploi du temps** | Alerter sur changement réel des créneaux, des enseignants et des salles, avec anti-doublons | **Scénarios principaux validés : modification, désactivation et réactivation ; migration `20261109114749` appliquée.** |
| 6 | **LIVE-FR — Interface vidéo des cours en français** | Langue française Daily Prebuilt, tests Enseignant/Apprenant et responsive | **Implémentation GitHub effectuée ; lint/build local et recette vidéo/audio à valider.** |
| 7 | **4.3.D — Recette globale et sécurité** | Notifications et LIVE-FR, quatre rôles, RLS, pas de doublons, Cron, lint/build, PWA/navigateurs, Preview | À terminer |
| 8 | **Clôture du Lot 4** | Revue PR, sauvegarde, fusion et déploiement uniquement après validation explicite | Non engagé |

Ce nouvel item `LIVE-FR` s'ajoute **sans renuméroter ni supprimer** les blocs 4.3.C et 4.3.D.

## 3. Tâches techniques prévues pour LIVE-FR

1. **Effectué** — version `@daily-co/daily-js` vérifiée dans le lockfile : **0.94.0**. La localisation `lang: "fr"` est officiellement prise en charge par Daily Prebuilt.
2. **Effectué** — dans `src/features/live/pages/LiveRoomPage.tsx`, l'iframe Daily est créée avec `lang: "fr"`. Le cycle de vie sécurisé du lecteur et son verrou d'instance restent inchangés.
3. **Effectué** — la fonction serveur ne force pas de `lang` dans le jeton. Après chaque `join()`, l'application appelle `setDailyLang("fr")` lorsque disponible pour donner priorité au français. Une erreur de traduction ne doit pas interrompre le cours. Aucun changement de droits, jetons, salles, API ou Supabase.
4. **À tester en local** — préconnexion, entrée dans la salle, caméra, micro, choix de périphériques, participants, chat, partage d'écran, disposition, paramètres et sortie. Noter les libellés Daily non traduits s'il en reste.
5. **À tester** — enseignant et apprenant sur ordinateur et mobile (largeurs d'écran et mise en page).
6. **À tester** — reprise après mise en pause, reconnexion après coupure, plein écran et retour au calendrier : la langue doit rester française.
7. **À tester** — présence, notifications LIVE, salles Daily, autorisations et droits des apprenants et enseignants doivent continuer de fonctionner.
8. Ne pas promettre une traduction complète des dialogues natifs du navigateur ou des textes Daily non localisés par la version installée. Identifier les chaînes résiduelles au cours de la recette.

## 4. Conditions de validation et de livraison

**Préparation :** code sur la branche de développement et PR en brouillon.  
**Contrôle technique :** `npm run lint`, `npm run build`, `git status --short`.  
**Contrôle fonctionnel :** captures avant/après sur comptes Enseignant et Apprenant, vidéo et audio vérifiés, réglage français après reconnexion, affichage mobile.  
**Déploiement :** aucun changement de `main` ni de l'environnement Vercel de production avant approbation.

Les captures fournies de `schoolnet-snowy.vercel.app` illustrent l'interface de production existante : elles ne constituent pas un test de la branche locale en cours.

## 5. Prochaine action immédiate

**LIVE-FR est maintenant implémenté sur la branche, sans fusion et sans déploiement.** Prochaine étape : `git pull --ff-only origin feature/schoolnet-notifications`, `npm run lint`, `npm run build`, puis tester en local une salle vidéo réelle avec les comptes Enseignant et Apprenant. Vérifier la préconnexion et les commandes en français avant et après une reprise.

Ensuite : clôture de LIVE-FR avec captures de test → recette globale 4.3.D (notifications, sécurité, cas particuliers) → validation distincte de fusion de la PR et du déploiement.
