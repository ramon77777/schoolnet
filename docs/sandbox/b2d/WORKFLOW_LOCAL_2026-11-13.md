# SCHOOLNET 5.C-B.2 — Mode test local sans manipulation Supabase

**État** : la saisie Apprenant sans e-mail est testable dans Vite localement. La connexion réelle n'est pas validée et l'Edge sandbox reste verrouillée. Ce mode ne crée pas de compte, ne modifie pas les données et n'envoie pas les informations saisies au backend.

## Pourquoi

La recette réelle dans la sandbox a été interrompue sur un délai réseau ; l'ancien script n'est **pas** à relancer. Les 7 tests de reprise ont été réussis mais le précontrôle suivant a répondu `WRONG_PROJECT` (configuration PowerShell de la session en cours, avant connexion au serveur). En accord avec le nouveau workflow, la recette à distance est suspendue.

## Récupérer la branche sur Windows PowerShell

Dans `D:\Bakary\10 autres\schoolnet` :

```powershell
git status
git fetch origin
git switch feature/schoolnet-student-sans-email
git pull --ff-only origin feature/schoolnet-student-sans-email
npm ci
```

Si la branche n'existe pas encore localement, faire à la place de `git switch ...` :

```powershell
git switch --track origin/feature/schoolnet-student-sans-email
```

Si `git status` montre des modifications locales inattendues, ne pas écraser ni utiliser `git reset --hard` : arrêter et les examiner.

## Tests locaux

```powershell
node --experimental-strip-types --test scripts/test-schoolnet-student-identity.mjs scripts/test-student-login-core.mjs scripts/test-student-login-preview.mjs
npm run build
npm run dev
```

Sur `http://localhost:5173/auth/login` (fenêtre privée si une session Parent/Enseignant est déjà ouverte), choisir **Identifiant SCHOOLNET**.

Tester avec **des valeurs fictives uniquement** :
- Téléphone : `07 12 34 56 78`
- Identifiant : `SN-ABCD-EFGH-JKMN`
- Mot de passe fictif de 12 caractères ou plus, jamais un vrai mot de passe.

Cliquer **Vérifier le formulaire (sans connexion)**. Attendu : un avis vert indique qu'aucun appel Supabase n'a été envoyé et que la saisie est conforme. Le formulaire e-mail existant doit rester visible et inchangé en revenant à l'autre onglet.

Le mode apparaît automatiquement uniquement sous `npm run dev` (Vite `import.meta.env.DEV === true`). Il ne nécessite **aucune nouvelle clé privée** ni nouveau fichier `.env` ; le projet doit toutefois posséder ses variables Vite existantes pour démarrer. Dans un build de production pointant vers le projet principal SCHOOLNET, l'onglet scolaire reste masqué.

## Garanties et limites

- Prévisualisation : aucun `signInWithPassword`, `setSession`, `functions.invoke` ou appel de base depuis la soumission scolaire.
- Le mode sandbox de vraie connexion nécessite toujours la cible Supabase sandbox **et** un indicateur explicite, et l'Edge reste verrouillée. Ne pas interpréter un test visuel comme une authentification réelle validée.
- Aucune migration, création de compte, rattachement Parent/Apprenant ou modification de production n'est effectuée.
- `main` et le déploiement de production ne sont pas modifiés par ce commit.

## Pour la suite

Après confirmation des tests locaux, revue du backend et reprise contrôlée de la recette Auth sandbox (en gardant le secret HMAC stable et sans rejouer la procédure partiellement exécutée). Puis approbation explicite de toute bascule et du déploiement Vercel.