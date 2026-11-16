**MISE À JOUR (16/11/2026) :** la migration SQL décrite ci-dessous **a été installée sur le Supabase principal** et la fonction administrative est passée en **v8**. Ce fichier reste une archive du plan *avant installation*. Voir le compte rendu actuel : [Installation backend du Lot 5.C](releases/SCHOOLNET_LOT5C_PRINCIPAL_DEPLOIEMENT_BACKEND_2026-11-16.md). Ne pas réexécuter les SQL de proposition sur le principal.

# SCHOOLNET — Lot 5.C : plan d'installation contrôlée sur le Supabase principal

**Date :** 16 novembre 2026  
**Statut :** PRÉPARATION TERMINÉE — **INSTALLATION NON EXÉCUTÉE**  
**Projet :** Supabase `schoolnet_2.0` (`anttmbhaphkhmkoqsofd`)  
**Dépôt :** `ramon77777/schoolnet`  
**Branche :** `integration/schoolnet-lot5c-local-first` ; PR **#13** en brouillon.

## Objectif

Finaliser la préparation du Lot 5.C sans interrompre le développement de SCHOOLNET.

L'installation projetée crée un registre privé d'approbation **par nouvel enfant**, un garde-fou SQL associé, et un déclencheur de rattachement automatique lors du passage d'un compte Apprenant sans e-mail de `sent_declared` à `enabled`. Elle réutilise l'invitation Parent activée et empêche les doublons.

**Ne pas confondre** le code versionné sur GitHub et les enregistrements Supabase. Une opération `git push` ne constitue jamais une sauvegarde PostgreSQL/Auth/Storage.

## Résultat de l'audit en lecture seule du projet réel

| Contrôle | Constat |
|---|---|
| Schéma privé `schoolnet_student_private` | Présent |
| Fonctions d'activation et gardes SQL existants | Présents |
| Contrainte d'unicité `parent_links_unique` | Présente |
| Nouvelle table d'approbation Parent existant | Absente : installation nécessaire |
| Nouveau déclencheur de rattachement | Absent : installation nécessaire |
| Profils existants | **12** |
| Liens Parent–Enfant | **2** |
| Demandes publiques | **6** |
| Invitations Parent | **1** |
| Registres Apprenants sans e-mail | **1** |
| Compte Apprenant sans e-mail activé | **1**, déjà relié au Parent et présent dans `child_ids` |
| Conflits de liens, doublons de paire ou enfants activés non rattachés | **0** au moment de l'audit |
| RLS des cinq tables existantes concernées | Activée |
| Rôle `anon` / `authenticated` sur la RPC d'activation | Pas d'exécution |
| Rôle `service_role` sur la RPC d'activation | Exécution autorisée |

*Tous ces contrôles ont été effectués par `SELECT` sur la vraie base ; aucune donnée individuelle, aucun mot de passe et aucune clé n'ont été récupérés pour ce rapport. Les totaux peuvent évoluer ; ils ne sont pas des conditions codées en dur.*

## Fichiers disponibles dans la PR #13

| Fichier | Utilisation |
|---|---|
| `supabase/proposals/20261116_schoolnet_lot5c_MAIN_INSTALL_REVIEW_ONLY.sql` | **Transaction SQL à approuver ultérieurement**, jamais exécutée automatiquement |
| `supabase/checks/20261116_schoolnet_lot5c_MAIN_PREFLIGHT_READ_ONLY.sql` | Vérifications exclusivement en lecture avant toute installation |
| `supabase/checks/20261116_schoolnet_lot5c_MAIN_POSTINSTALL_READ_ONLY.sql` | Vérification des objets, permissions et compteurs après une installation autorisée |
| `scripts/test-schoolnet-lot5c-main-install.mjs` | Tests de non-régression hors ligne des protections du SQL |
| `src/features/enrollments/components/AdminStudentNoEmailPanel.tsx` | Interface Admin de suivi, mode local lecture seule |
| `supabase/functions/schoolnet-student-no-email-admin/index.ts` | Implémentation Edge, **non déployée** |
| `supabase/functions/schoolnet-student-login-release/index.ts` | Code de connexion séparé, **non déployé dans ce lot** |

Les anciennes propositions `SANDBOX_REVIEW_ONLY` sont conservées pour l'historique ; ne pas les exécuter sur le principal.

## Procédure autorisée **à une prochaine étape seulement**

Cette procédure exige **un nouvel accord explicite** ; la présente autorisation porte uniquement sur sa préparation.

1. **Geler temporairement les nouvelles activations** du Lot 5.C ; ne toucher ni aux comptes existants ni aux invitations déjà émises. Vérifier que le déploiement Vercel de `main` n'est pas déclenché.
2. **Disposer d'une sauvegarde récupérable de la base** (et d'un plan de restauration). Le projet est sur Supabase **Free**, sans sauvegarde automatique du projet. Le code GitHub, un rapport de métadonnées ou un export CSV partiel ne remplacent **pas** un dump complet. Choisir un moyen d'export sûr ou une offre comportant des sauvegardes, sans exposer le fichier dans GitHub.
3. Lancer le fichier `MAIN_PREFLIGHT_READ_ONLY.sql` dans **le SQL Editor du projet `anttmbhaphkhmkoqsofd`**. Tous les indicateurs de présence/absence et de privilèges doivent être conformes ; les compteurs de conflits doivent valoir zéro. Conserver uniquement les totaux dans le journal de mise en service.
4. Relire et approuver **le fichier unique** `MAIN_INSTALL_REVIEW_ONLY.sql` ; ne pas le confondre avec les anciens scripts sandbox. Il contient `BEGIN` / `COMMIT`, des limites de verrouillage et des contrôles SQL avant/après. Une erreur arrête la transaction entière.
5. Seulement après autorisation distincte, exécuter **une seule fois** cette transaction sur le projet correct, depuis un canal privé autorisé.
6. Exécuter `MAIN_POSTINSTALL_READ_ONLY.sql`. Vérifier la table vide, RLS+FORCE RLS, les triggers, les privilèges et les compteurs d'anciens dossiers inchangés. Un échec ne doit **pas** être suivi de nouvelles activations.
7. **Ne pas déployer ou activer automatiquement les Edge Functions**. Vérifier d'abord leur configuration, les restrictions d'origine, JWT Admin, secret HMAC, cohortes pilotes et comportement des liens d'invitation. Déployer/activer uniquement après accord distinct.
8. Synchroniser le projet local, lancer `npm run qa:lot5c` et tester les écrans. La variante locale conserve **par défaut** les actions sensibles en lecture seule.
9. Après validation fonctionnelle et contrôle de Git→Vercel, procéder à la fusion et à la publication uniquement sur demande explicite.

## Retour arrière et arrêt d'urgence

**Avant `COMMIT` :** la transaction de migration SQL est atomique. Toute erreur SQL la fait échouer ; aucune tentative de relance à l'aveugle.

**Après `COMMIT` mais avant activation :** maintenir les fonctions Edge et flags d'activation désactivés. Si le contrôle post-installation échoue, conserver les preuves et demander un audit. **Ne pas supprimer automatiquement le trigger ni la nouvelle table** : il faut vérifier au préalable s'ils ont déjà servi.

**Après activation :** bloquer temporairement les nouvelles créations et activations via les flags et le parcours serveur, puis diagnostiquer. Les liaisons créées appartiennent à des dossiers réels : un `DROP` ou une suppression de données sans inventaire et plan de récupération serait dangereux. Une éventuelle suppression des nouveaux objets SQL doit être écrite et autorisée séparément, après vérification de l'absence de données dépendantes.

**Attention :** aucune sauvegarde récupérable n'a encore été créée dans cette session. Il ne faut donc pas présenter le principal comme « sauvegardé » ni passer à l'exécution du SQL à ce stade.

## Avertissements sécurité préexistants

Le vérificateur de sécurité Supabase signale notamment des fonctions SECURITY DEFINER appelables par certains rôles, des fonctions au `search_path` mutable et la protection contre les mots de passe compromis désactivée. Ces signalements **préexistent à cette préparation** ; ils n'ont pas été modifiés. Une revue de leur portée est nécessaire avant une ouverture générale des connexions Apprenant.

## Décision et état final

**Autorisée :** vérification du schéma principal en lecture seule, conception/renforcement des propositions SQL, ajout des contrôles et de la documentation sur la branche GitHub.

**Non autorisée et non effectuée :** migration SQL, création/modification/suppression de comptes ou de liaisons réels, réglage des secrets et flags Supabase, publication d'Edge Functions, fusion sur `main`, déploiement Vercel ou restauration.

**Étape suivante :** validation de la procédure de récupération, puis autorisation séparée pour la migration. Le travail de code SCHOOLNET peut continuer en parallèle sur GitHub.
