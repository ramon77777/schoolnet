# SCHOOLNET — Lot 5.C-B.2 / Étape A.1
## Durcissement préliminaire et panneau de recette local (11 novembre 2026)

**État : code de préparation sauvegardé sur GitHub ; aucune nouvelle version de l'Edge Function n'a été déployée. Étape A.1 à valider sur le PC avant clôture.**

### Autorisation et limites
L'utilisateur a autorisé **l'implémentation de l'Étape A sans création de compte ni activation d'invitations**. Ce document couvre le premier sous-lot A.1, limité aux protections serveur supplémentaires, à l'interface **inspect** en lecture seule et au contrôle de build.

Aucune migration, aucune création Auth, aucun e-mail, aucun lien d'activation, aucune modification des rôles, aucune fusion, aucun déploiement Vercel. Ne pas supprimer le verrou `READ_ONLY_DEPLOYMENT=true`.

### Modifications codées

| Fichier | Changement | Effet |
| --- | --- | --- |
| `supabase/functions/schoolnet-family-invitation/index.ts` | Conservé `READ_ONLY_DEPLOYMENT=true`; ajoute `SCHOOLNET_FAMILY_PILOT_REQUEST_ID` et `SCHOOLNET_FAMILY_PILOT_RECIPIENT` comme conditions supplémentaires **après** le verrou ; rejette les adresses réservées `example.test`, `example.com`, `example.org`, `example.net`, `.test`, `.invalid` pour toute future préparation | Aucun changement de comportement de `inspect` ; réduit les risques si l'écriture est autorisée plus tard, sans être une activation |
| `supabase/config.toml` | Déclaration explicite `[functions.schoolnet-family-invitation]`, `enabled=true`, `verify_jwt=true` | Configuration versionnée pour futur déploiement ; pas de déploiement pendant A.1 |
| `scripts/check-family-readonly.mjs` | Vérifie statiquement présence du verrou, de la dépendance au verrou, de l'allowlist pilote, de l'origine locale `inspect` uniquement, de `verify_jwt=true` et absence d'appel de mutation dans l'écran de préflight | Échoue volontairement si un garde-fou disparaît |
| `package.json` | Ajoute `prebuild: node scripts/check-family-readonly.mjs` | `npm run build` lance automatiquement la vérification sans effet de bord |
| `src/features/enrollments/components/AdminEnrollmentRequestPreflight.tsx` | Deux résultats d'inspection distincts Parent / Apprenant, protection contre les réponses associées à une autre demande/adresse, message explicite de décision, bloc d'obligations préalables, blocage du cas où parent et apprenant utilisent le même email | Lecture seule, pas de bouton `prepare`, `resume`, `renew` ou `flag_review` raccordé |

Le nouveau verrou pilote est **en plus** du verrou permanent et ne l'affaiblit pas. Une future activation exigerait toujours un GO explicite, un nouveau déploiement vérifié et des tests en environnement isolé. Les variables pilotes ne sont **pas configurées** dans le cadre de A.1.

### Contrôles déjà réalisés

- Le workflow GitHub **SCHOOLNET — Vérifications du code** s'est conclu avec **success** sur le commit frontend/code `9fa0af5` (branche `feature/schoolnet-multi-etablissements`).
- Vérification Supabase **après les commits de code** : Edge Function distante toujours version **2 ACTIVE**, `verify_jwt=true`, `READ_ONLY_DEPLOYMENT=true`. Le code pilote GitHub n'a **pas** été déployé en production, ce qui est intentionnel.
- Supabase : **35 migrations**, **10 comptes Auth**, **0 invitation**, **0 événement**, demande fictive `DEM-3CF7B169BAD9` toujours `new`.
- Les tests HTTP de 401/403/inspect validés auparavant ne sont pas invalidés par un déploiement, puisqu'**aucun nouveau déploiement serveur n'a été effectué**.

### Recette locale à réaliser avant d'avancer vers A.2

1. Dans PowerShell du projet, vérifier `git branch --show-current`, `git status --short` et `git fetch origin --prune` ; **ne pas lancer de pull si un fichier local est modifié**. Le fichier `tsconfig.app.tsbuildinfo` est généré par TypeScript et a déjà été sauvegardé par le passé : conserver les modifications de l'utilisateur avant tout `git restore`.
2. Une fois le dossier propre : `git pull --ff-only origin feature/schoolnet-multi-etablissements`, puis `npm run lint`, `npm run build` (la ligne `prebuild` doit être exécutée), et conserver l'application sur `http://localhost:5173`.
3. Se connecter au Super Admin → Demandes publiques → `DEM-3CF7B169BAD9`. Inspecter **Parent** puis **Apprenant**. Les deux cadres doivent conserver leur résultat `new_invitation_possible`, sans écriture. Vérifier que les résultats d'une autre demande ne persistent pas si l'on ferme puis ouvre une autre demande.
4. Ne pas cliquer sur la finalisation manuelle ni changer les comptes. Contrôler la cohérence des messages si un e-mail personnel manque.
5. Faire remonter les captures de lint, build et du panneau Parent/Apprenant. Refaire ensuite un contrôle SQL des compteurs et documenter l'acceptation de A.1.

### Étapes non comprises dans A.1

- **A.2 :** concevoir/coder les transitions serveur `sent_declared` et `activated`, preuves et interface de suivi **sous garde de lecture seule**, puis validation statique et locale ; les états ne doivent pas être forcés sans preuve.
- **A.3 :** revoir en détail les privilèges `SECURITY DEFINER` de `handle_new_user` et préparer, si nécessaire, un correctif SQL **en projet uniquement**, avec autorisation séparée avant exécution.
- **B :** essai Auth sur un projet Supabase de test isolé sous GO supplémentaire, sans e-mail de test non livrable.
- **C / D :** pilote restreint principal puis Vercel, chacun sous GO distinct.

### Reprise
Le dernier état valide est **A.1 implémenté sur GitHub, pas encore recetté sur le PC**. Après confirmation de A.1, poursuivre A.2 sans modifier la fonction Edge Supabase principale ou les données avant approbation.
