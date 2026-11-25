# SCHOOLNET V2 — S4-C.3-B.6.2 — Mes coefficients

ÉTAT : PROPOSITION EN DÉVELOPPEMENT, non installée sur Supabase principal.
Date : 25 novembre 2026. PR #38.

## Périmètre validé
Les enseignants affectés gèrent la pondération et l'inclusion de leurs évaluations officielles, jamais celles d'un collègue ou d'un autre établissement. Le coefficient de matière demeure en lecture seule tant qu'un administrateur de cet établissement n'accorde pas une délégation explicite par affectation. Les périodes verrouillées interdisent toute modification. Les données restent une prévisualisation non publiée ; les notes V1/V2 ne sont pas réécrites.

## Développement
- SQL privé : nouvelle table de délégations, journal immuable des changements et cinq nouveaux RPC publics sécurisés par auth.uid, rôle serveur, affectation et école active.
- Interface enseignant : Mes coefficients, sélection école, classe, matière, année et période, historique de ses opérations.
- Interface school_admin : autoriser/révoquer les délégations dans Périodes et coefficients.
- Coefficients : de 0,25 à 20 avec au plus deux décimales.
- L'absence des fonctions SQL affiche un message d'activation en attente et bloque les modifications.

## QA et livraisons
GitHub Actions sur PostgreSQL Supabase jetable : contrôles multi-établissements A/B, anonymes, droits révoqués, délégation, verrouillage, données V1 intactes, audit, rollback.
Recette locale : npm run qa:s4c3b6-2 puis npm run lint, npm run build et npm run dev. Vérifier les pages Enseignant et Administrateur. Pendant la recette locale sans SQL, l'avertissement d'activation est NORMAL.
Après validation : autorisation indépendante pour déployer SQL, puis test de fonctionnement et autorisation indépendante pour fusion main/Vercel.
