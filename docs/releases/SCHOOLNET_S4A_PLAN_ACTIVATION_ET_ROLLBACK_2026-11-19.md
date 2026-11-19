# SCHOOLNET V2 — S4-A | Plan d'activation SQL contrôlée et retour arrière

**Date :** 19 novembre 2026  
**Périmètre :** pilotage pédagogique d'un établissement ; RPC de synthèse sans noms ni identifiants individuels.  
**État :** dossier PR n° 17 ; **installation NON autorisée / NON exécutée**.  
**Version candidate inspectée :** commit `659fb6e9` (recontrôler le SHA avant toute installation).

## 1. Finalité, acquis et limites

Les 28 tests applicatifs S4-A et la recette A/B SQL sur une base Supabase jetable ont réussi. La PR n° 17 demeure **en brouillon** ; `main` et la production Vercel n'ont pas été modifiés.

S4-A consomme maintenant une **RPC dédiée**, `public.schoolnet_school_pedagogy_overview(p_school_id uuid)`. Elle expose uniquement des compteurs et des métadonnées scolaires non nominatives. La RPC détaillée S3-C `public.schoolnet_school_assignment_catalog(uuid)` demeure inchangée et continue de servir aux écrans d'affectation existants.

**Le test SQL local ne vaut pas installation Supabase principale.** Le déploiement de la Preview Vercel ne crée aucune fonction dans PostgreSQL : tant que la RPC manque, l'écran candidat échoue volontairement sans repli vers les noms d'élèves et d'enseignants.

## 2. Précontrôle exécuté (production, lecture seule)

Le contrôle `supabase/verification/s4a_activation_preflight_readonly.sql` a été exécuté sur le Supabase principal le 19 novembre 2026.

**Résultat constaté :** `S4A_PRECHECK_PASS`.

Il a établi :
- les fonctions de garde S3-C et de lecture du catalogue existantes ;
- le caractère invoker de la RPC catalogue, le caractère definer du garde, les privilèges compatibles ;
- les tables requises présentes, RLS activée et lecture directe des tables d'affectations interdite aux utilisateurs authentifiés ;
- les deux nouvelles fonctions S4-A **absentes** avant installation ;
- la compatibilité des colonnes des classes, profils, niveaux et matières.

Ce contrôle est à **relancer le jour de l'activation** : un état observé à une date antérieure ne suffit pas si la base a changé entre-temps.

## 3. Fichiers du dossier

| Chemin GitHub | Rôle |
|---|---|
| `supabase/proposals/s4a_school_pedagogy_overview.sql` | SQL candidat, ajout des deux seules fonctions S4-A et GRANT/REVOKE explicites |
| `supabase/verification/s4a_activation_preflight_readonly.sql` | Précontrôle sans DDL ni lecture de données personnelles |
| `supabase/verification/s4a_activation_postflight_readonly.sql` | Vérification des fonctions, du propriétaire, des droits, du garde et de S3-C après installation |
| `supabase/verification/s4a_activation_rollback_manual.sql` | Retrait ciblé des deux fonctions S4-A avec DROP RESTRICT ; **jamais automatique en production** |
| `.github/workflows/schoolnet-s4a-tenant-ci.yml` | Exerce le précontrôle, le SQL candidat, le postcontrôle, les refus A/B puis le rollback sur une base locale jetable |

## 4. Portes de décision (GO / NO GO)

L'installation ne peut être lancée qu'après **autorisation explicite distincte** de l'utilisateur. Au moment du GO :

1. Vérifier que la PR n° 17 est toujours en brouillon, que la cible est bien `main` et relever son SHA exact. Ne pas modifier le projet Vercel de production.
2. Vérifier la disponibilité effective d'une sauvegarde récente ou d'un mécanisme de restauration fiable du Supabase principal (preuve R1) avant toute DDL. Ne pas supposer qu'un script de rollback remplace une sauvegarde.
3. Relancer `s4a_activation_preflight_readonly.sql` ; exiger `S4A_PRECHECK_PASS`. Si un drapeau vaut `false`, s'arrêter et expliquer l'écart.
4. Réappliquer aucun ancien fichier de migration S2/S3, ni faire de `supabase db push`. Le SQL S4-A ne crée/modifie **aucune table**, règle RLS, compte, classe, affectation ou document.
5. Appliquer **une seule migration** nommée `schoolnet_s4a_pedagogy_overview`, dont le corps est l'intégralité du SQL validé `supabase/proposals/s4a_school_pedagogy_overview.sql`, via l'outil de migration Supabase sous contrôle explicite et dans une transaction. Conserver le numéro de version/les métadonnées retournées par Supabase et les reporter dans le dépôt selon le processus CLI canonique.
6. Exécuter `s4a_activation_postflight_readonly.sql` : résultat exigé `S4A_POSTCHECK_PASS`. Si l'outil de migration n'a pas rechargé PostgREST, effectuer `NOTIFY pgrst, 'reload schema';` après l'installation autorisée.
7. Recette navigateur ciblée sur la **Preview** avec un compte `school_admin` ayant une affiliation active : indicateurs lisibles, réponses limitées aux compteurs et classes, aucune donnée personnelle retournée, aucun accès anonyme. Ne pas refaire les 28 tests unitaires déjà réussis.
8. Obtenir **un nouvel accord distinct** avant fusion de la PR sur `main`, puis un accord pour publication Vercel. Vérifier ensuite la production. Ne pas considérer S4-A « publié » avant cette étape.

**NO GO** en cas de précontrôle non conforme, perte des protections S3-C, erreur de privilège, divulgation nominative, schéma non cohérent, sauvegarde/restauration non confirmée ou absence d'autorisation explicite.

## 5. Retour arrière ciblé et ordre impératif

**Avant la publication de S4-A :** la production Vercel n'utilise pas encore la nouvelle RPC. En cas d'anomalie serveur, après accord spécifique, appliquer `s4a_activation_rollback_manual.sql` comme **migration transactionnelle de rollback**, puis vérifier `S4A_PRECHECK_PASS`. La Preview S4-A pourra afficher « synthèse non encore active » — c'est attendu.

**Après une publication éventuelle de S4-A :** revenir **d'abord** à la version Vercel précédente, avec autorisation de rollback du déploiement, puis retirer les deux fonctions SQL après autorisation distincte. Retirer les fonctions en premier casserait les écrans déjà publiés.

Le SQL de rollback :
- exige la présence des deux signatures et leur implémentation attendue ;
- refuse une implémentation modifiée ou une dépendance nouvelle (`DROP ... RESTRICT` et non `CASCADE`) ;
- supprime seulement `public.schoolnet_school_pedagogy_overview(uuid)` et `schoolnet_private.local_school_pedagogy_overview(uuid)` ;
- n'efface aucun élève, enseignant, cours, école, affectation, rôle ou document ;
- recharge le cache PostgREST après suppression ;
- doit être exécuté **dans une transaction** (migration Supabase autorisée, ou `psql -1` dans la CI jetable), jamais instruction par instruction ;
- enregistre la migration de retrait dans l'historique Supabase si elle est appliquée.

Ce rollback **ne restaure pas** la base entière. Si un prérequis de données est compromis, appliquer la procédure de restauration déjà validée, pas une suppression improvisée.

## 6. Vérification de non-régression et validation finale

Exiger le succès des deux jobs GitHub Actions du nouveau commit : qualité SCHOOLNET (lint, build, 28 tests S4-A, contrôles existants) et recette SQL sur base jetable (précontrôle, installation, A/B, postcontrôle, rollback, retour au précontrôle).

Après installation autorisée, exiger le postcontrôle SQL et un essai Preview ciblé. Les scénarios A/B ont déjà été éprouvés sur base locale synthétique : ne pas fabriquer de comptes ou d'affectations sur la production pour les répéter.

**État à la rédaction :** seules des lectures de métadonnées ont été effectuées sur Supabase principal. Aucune DDL, aucun rollback, aucune fusion ni publication de production n'a été effectuée.
