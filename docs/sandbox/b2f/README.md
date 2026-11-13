# SCHOOLNET - Alignement du catalogue public et des niveaux scolaires (lot 5.C-B.2 / B2.F)

Date : 13 novembre 2026. **Branche feature seulement ; aucune modification de production.**

## Constat verifie en lecture seule

La base `schoolnet_2.0` (`anttmbhaphkhmkoqsofd`) contient **16 niveaux visibles** dans `public.public_levels` : PS, MS, GS, CP1, CP2, CE1, CE2, CM1, CM2, 6e, 5e, 4e, 3e, 2nde, 1re et Tle.

La gestion scolaire (`public.levels`) ne contenait qu'un niveau `6e` (ID BIGINT = 4, `order_index` = 1), et `public.classes` contenait deux classes : `6e A` (2025-2026), `6e B` (2026-2027). `Quatrieme` / `4e` existe bien dans le catalogue public, mais **aucune classe de 4e n'est encore creee dans la gestion scolaire**.

`public.public_levels.id` est UUID alors que `public.levels.id` est BIGINT. Il ne faut donc jamais remplacer un ID de classe par un UUID du catalogue public ni recréer un niveau dans `public_levels`.

## Correction du frontend (lecture seule)

`src/features/enrollments/lib/schoolLevelConsistency.ts` normalise les variantes courantes de noms et resolve les niveaux en utilisant `public_levels` comme referentiel de noms et `levels`/`classes` comme donnees de gestion.

`AdminEnrollmentRequestPreflight.tsx` interroge ces sources sans ecriture et distingue explicitement :

1. Niveau du catalogue public absent des niveaux de gestion (cas actuel de la 4e) ;
2. Niveau de gestion existant sans classe (cas attendu apres synchronisation) ;
3. Classe existante uniquement pour une autre annee scolaire ;
4. Classe effectivement disponible pour l'annee courante ;
5. Incoherence de catalogue ou doublon de niveau academique (alerte plutot que choix automatique).

Le message relatif a l'authentification sans e-mail est egalement remis en accord avec la decision validee : **telephone familial partageable + identifiant SCHOOLNET unique + mot de passe propre a l'apprenant**.

## Proposition SQL non appliquee

- `supabase/proposals/20261113_align_public_school_levels_READ_ONLY.sql` : diagnostic sans modification ; utilisable pour revoir les 16 niveaux et les classes associees.
- `supabase/proposals/20261113_align_public_school_levels_REVIEW_ONLY.sql` : proposition de synchronisation **non appliquee** ; ne pas placer dans les migrations executees automatiquement.

**Actions prevues, uniquement apres accord distinct :** valider un backup de la production et les verifications initiales, inserer les niveaux visibles manquants dans `public.levels`, aligner `order_index` sur `public_levels.sort_order`, verifier l'ID existant `6e` et l'absence de changement dans `classes`. Les protections abortent la transaction en cas de conflit ou de niveau personnalise inconnu.

Avec l'etat controle le 13 novembre 2026, **15 nouveaux niveaux de gestion** seraient ajoutes. Le niveau `6e` existant conserverait l'ID **4** et passerait uniquement de `order_index = 1` a `100`, pour suivre l'ordre du catalogue public. **Aucune classe, inscription ou relation Parent-Enfant n'est creee.** Un changement du catalogue necessitera une nouvelle revue et eventuellement une nouvelle synchronisation controlee ; ce n'est pas un mecanisme de mise a jour automatique en production.

## Recette locale

Depuis la branche `feature/schoolnet-student-sans-email`, apres `git pull --ff-only` :

```powershell
node --experimental-strip-types --test scripts/test-school-level-consistency.mjs scripts/test-school-level-sync-proposal.mjs
npm run build
npm run dev
```

Se connecter en Administrateur sur l'application locale puis ouvrir la demande 4e de Yao Tabra. Le panneau `Classes existantes du niveau demande` doit signaler que **4e existe dans le catalogue public mais pas encore dans les niveaux de gestion**. Aucun bouton de creation automatique n'est ajoute. Apres future synchronisation, ce panneau indiquera le niveau configure mais l'absence de classe 4e, jusqu'a ce que l'etablissement cree reellement une classe.

**Aucune modification ni activation du compte Yao Tabra, aucun rapprochement Parent-Enfant et aucun deploiement Vercel ne sont inclus dans ce correctif.**