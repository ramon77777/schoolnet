# SCHOOLNET — Workflow consolidé : notifications et visioconférence en français

**Mise à jour :** 09 novembre 2026  
**Branche de travail :** `feature/schoolnet-notifications`  
**Statut :** LIVE-FR implémenté ; GitHub Actions (npm ci + ESLint + build) réussi. Test réel caméra/micro reporté à une Preview Vercel sur téléphone ou autre ordinateur équipé. Aucun déploiement de production.  
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
| 7 | **4.3.D — Recette globale et sécurité** | Notifications, quatre rôles, RLS, audit des fonctions privilégiées, Cron, CI, Preview | **Audit et CI validés ; migration Messagerie `20261109135338` appliquée (26/27). Migration Corrections `20261109140104` non appliquée, recette navigateur à poursuivre.** |
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

**LIVE-FR est implémenté sur la branche et vérifié par GitHub Actions.** Comme le PC de travail n'a pas de caméra, les tests réels audio/vidéo sont reportés à la Preview Vercel, depuis un téléphone ou un PC équipé. Il ne faut pas considérer cette recette comme réussie avant ce test.

Ensuite : clôture de LIVE-FR avec captures de test → recette globale 4.3.D (notifications, sécurité, cas particuliers) → validation distincte de fusion de la PR et du déploiement.


## 6. Recette 4.3.D — état actuel et prochaines autorisations

Le journal de recette et de sécurité est désormais dans
[`docs/lot-4-3-d-recette-globale-et-securite.md`](lot-4-3-d-recette-globale-et-securite.md).

- Requête de recette conforme pour les scénarios principaux des notifications 4.1 à 4.3.C.
- Audit Supabase : 60 tables publiques avec RLS, 5 vues en `security_invoker`, isolation des notifications et préférences vérifiée sur les 4 profils.
- CI GitHub Actions : `npm ci`, `npm run lint` et `npm run build` automatisés, `package-lock.json` corrigé, workflow vert.
- Sécurité : `20261109135338_harden_chat_relationship_rpcs.sql` **appliquée le 09/11/2026 sur `schoolnet_2.0`**, après autorisation explicite et contrôle du contenu exact. Trois RPC de messagerie ne sont plus exécutables par `anon` ; tests SQL pour les rôles Parent/Enseignant/Apprenant réussis, 26 migrations enregistrées. `20261109140104_harden_assessment_legacy_rpcs.sql` **reste préparée sur GitHub uniquement** (27e migration) ; tests `ROLLBACK` réussis, **ne pas appliquer sans nouvelle autorisation**.
- Après les correctifs SQL et la recette croisée : mise à disposition éventuelle d'une URL de **Preview Vercel** pour tester LIVE-FR depuis un téléphone, sans fusionner `main`.
- Ensuite : examen des cas limites, contrôle des droits restants, revue finale de la PR, fusion/déploiement sur validation.
