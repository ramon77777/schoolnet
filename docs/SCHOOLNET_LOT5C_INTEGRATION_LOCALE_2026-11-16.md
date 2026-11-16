# SCHOOLNET — Workflow principal et tests locaux (Lot 5.C)
**16 novembre 2026 — intégration de développement, pas mise en production.**

## Périmètre exact
- Dépôt principal : `ramon77777/schoolnet`.
- Branche d'intégration issue de `main` : `integration/schoolnet-lot5c-local-first`.
- Ancienne PR #12 : historique de conception et d'essais sandbox ; les programmes GitHub Actions à usage unique et les scripts de création de comptes de sandbox **ne sont pas transportés** dans cette branche.
- Les deux fichiers sous `supabase/proposals/` sont **REVIEW ONLY**. Ils ne doivent pas être exécutés sur le Supabase principal sans revue, sauvegarde et conversion en migration validée.
- Aucun commit sur `main`, aucune migration SQL, aucun nouveau compte, aucun déploiement d'Edge Function ou sur Vercel au stade de préparation.

## Commandes Windows — PowerShell, depuis le dossier SCHOOLNET existant
1. Ouvrir VS Code → Terminal → PowerShell, dans le dossier contenant `package.json`.
2. Vérifier qu'aucune modification personnelle ne serait écrasée :

```powershell
git status --short
git branch --show-current
node --version
```

Si `git status --short` affiche des fichiers modifiés ou non suivis que vous souhaitez conserver, **ne pas changer de branche tant que ces changements n'ont pas été sauvegardés**. Ne pas exécuter `git reset --hard` ni supprimer les fichiers personnels.

3. Synchroniser les références de GitHub, puis ouvrir l'intégration :

```powershell
git fetch origin
git switch --track origin/integration/schoolnet-lot5c-local-first
git status
```

Si la branche existe déjà en local, utiliser `git switch integration/schoolnet-lot5c-local-first` puis `git pull --ff-only`. Git doit afficher la branche d'intégration, pas `main`.

4. Vérifier les fonctionnalités **sans lancer de publication** :

```powershell
npm ci
npm run lint
npm run build
node --experimental-strip-types --test scripts/test-schoolnet-student-runtime-gate.mjs scripts/test-schoolnet-student-rollout-guard.mjs
node --test scripts/test-schoolnet-no-email-auto-family-link.mjs scripts/test-schoolnet-student-login-production-release.mjs scripts/test-schoolnet-lot5c-ui-compact.mjs scripts/test-schoolnet-lot5c-sibling-parent-reuse.mjs scripts/test-schoolnet-lot5c-admin-parent-reuse.mjs
```

Node.js 24 est utilisé par les vérifications GitHub. Ne pas diffuser les valeurs de `.env.local`, les mots de passe ou les clés de service dans les captures.

5. Vérifier l'interface localement :

```powershell
npm run dev
```

Ouvrir l'URL Vite affichée dans le terminal (habituellement `http://localhost:5173`), se connecter avec un compte autorisé et contrôler la fenêtre « Administration → Demandes publiques → Examiner », ses trois onglets, la mise en page mobile et le message de lecture seule en développement.

**Important :** la fiche « Apprenant sans e-mail » est volontairement **en lecture seule hors du domaine de production**. Les tests locaux à cette étape sont principalement des tests de code et d'interface ; aucune action réelle d'approbation, d'activation, de refus ou de rattachement ne doit être tentée depuis le navigateur local. Les tests métier sur la base principale auront leur propre phase autorisée et contrôlée.

## Contrôles avant toute utilisation réelle
- Vérifier les sauvegardes Supabase principal (Dashboard → Database → Backups) et disposer d'un plan de restauration. Selon le plan, une exportation logique séparée peut être nécessaire.
- Examiner en lecture seule les contraintes, politiques RLS, fonctions et triggers existants ; ne pas recopier les données du principal dans un autre environnement.
- Transformer les propositions SQL en une migration **adaptée à la vraie base**, en préservant les données existantes.
- Tester un cas réel non destructif ou un compte de test autorisé : invitation Parent, nouvel enfant, connexion, approbation, absence de doublons.
- Vérifier les secrets et flags de déploiement avant publication, notamment le changement `SCHOOLNET_STUDENT_LOGIN_ENABLED` qui exige `true` explicite dans le nouveau backend. Aucune modification de flags n'est effectuée ici.
- Confirmer la configuration Vercel : un push/merge vers `main` peut déclencher automatiquement une publication. La connexion Vercel actuelle n'a pas permis d'auditer le projet.
- Ne fusionner dans `main` qu'après les tests locaux et la validation explicite de l'utilisateur.

## Prochaine recette
1. Retour utilisateur avec sortie des commandes `npm run lint`, `npm run build` et capture de la fiche locale.
2. Audit et migration SQL sur le principal avec sauvegarde et validation, puis recette applicative sur des identités prévues à cet effet.
3. Vérification de configuration Vercel, validation finale, puis seulement publication.

**Rappel :** aucune étape de cette branche n'est un déploiement, une activation générale ou une invitation réelle.
