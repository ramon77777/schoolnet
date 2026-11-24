# SCHOOLNET V2 — S4-C.3-A.1 — Codes automatiques des périodes
**Statut : proposition sur branche / PR de validation. AUCUN SQL installé et AUCUNE publication demandés.**

## Problème confirmé le 24/11/2026
Sur la page officielle `/app/school/grading-settings`, l'administrateur saisissait manuellement un code libre (ex. T1). La création réelle de `Premier trimestre (T1)` a réussi pour l'établissement fictif `SCH-000001`, année 2026-2027. Le nom comporte actuellement une tabulation de tête dans la base. Les valeurs V1 et les notes ne sont pas concernées par le correctif.

## Comportement cible (interface)
- Sélecteur de **type de période** : Trimestre, Semestre, Personnalisée.
- **Code automatique en lecture seule**, présenté comme *aperçu* ; le serveur est la seule autorité lors de l'enregistrement.
- Pour chaque couple établissement/année, codes indépendants : `T1`, `T2`, `T3` ; `S1`, `S2` ; `P01`, `P02`, etc. Au-delà de 3 trimestres, 2 semestres ou 9 999 périodes personnalisées, refus explicite.
- Nom pédagogique proposé automatiquement, mais reste modifiable ; sur édition le code existant demeure immuable et le type est figé.
- Les espaces et tabulations périphériques du nom sont supprimés **à l'enregistrement**. L'ancien `T1` est conservé, sans mutation massive de données.
- Le formulaire d'édition et les dates/confidentialité/verrouillage conservent le fonctionnement C.3-A.

## Contrat serveur et sécurité
- SQL de proposition : `supabase/proposals/s4c3a1_automatic_period_codes.sql` ; **pas** dans `supabase/migrations`, ne jamais rejouer sans GO distinct.
- Remplace **uniquement** le corps de la fonction privée `schoolnet_private.school_upsert_grading_period` à signature identique ; les façades publiques, leurs privilèges, les tables et les RLS ne changent pas.
- `assert_s3c_access(...,true)` conserve l'isolation `school_admin`, établissement autorisé et protection des origines.
- Verrou `FOR UPDATE` sur la ligne de l'établissement **avant** recherche du plus grand numéro et écriture : allocations concurrentes sérielles, contrainte UNIQUE existante en dernier rempart.
- Le paramètre historique `p_code` ne représente plus un code imposé : seules les indications de type `T/S/P` (et anciens indices numériques correspondants) sont reconnues ; le nombre est ignoré. En édition, `p_code` ne modifie jamais la valeur conservée.
- Les périodes C.3-A existantes conservent ID, code, dates et rattachements. **Aucune modification des notes, évaluations, coefficients ni bulletins V1.**
- Un client Vercel déjà en cache envoyant un ancien code `T1` sera interprété comme une demande de type Trimestre et recevra le prochain code disponible. Un ancien code personnalisé non T/S/P est refusé en création (erreur de validation), plutôt que silencieusement transformé.
- Limitation : le nom déjà enregistré avec tabulation n'est physiquement normalisé qu'à sa prochaine édition. Une lecture UI affiche le nom sans les tabulations périphériques.

## Tests isolés prévus
1. `npm run qa:s4c3a1` : aperçu et typage, code readonly, contrat RPC/SQL et invariants de sécurité.
2. CI PostgreSQL jetable : installer le SQL C.3-A de référence **puis** appliquer C.3-A.1 et exécuter la fixture A/B. Contrôler la séquence sous demande client obsolète `T1`, type `S1`, personnalisé `P01`, nom nettoyé, code stable après édition, limites, anti-chevauchement, verrouillage et permissions.
3. Rollback manuel ciblé en base jetable : `supabase/verification/s4c3a1_automatic_period_codes_rollback_manual.sql` restaure uniquement le corps de la fonction d'origine. Ne supprime aucune période et n'annule aucune note.
4. Validation globale `npm run lint`, `npm run build` et CI `qa:s4c3a`, `qa:s4b3c2`.

## Gates de livraison — aucune action automatique
- **G1** : branche + PR brouillon + CI verte et tests isolés. Aucun changement Supabase principal.
- **G2** (GO distinct requis) : sauvegarde/préflight puis installation contrôlée du SQL sur Supabase principal, avant le nouveau client.
- **G3** (GO distinct requis) : fusion dans `main` / déploiement automatique de Vercel. Valider le domaine officiel.
- **G4** : recette de création T2 après T1 avec `SCH-000001`, sans verrouillage, puis test des coefficients distinct. Les deux premières périodes ne doivent pas se chevaucher.
- **Pas de rollback SQL automatique en production**, ni test de restauration destructif.

**Le seul GO actuellement accordé porte sur la préparation de la branche GitHub, des propositions SQL/rollback et des tests.**
