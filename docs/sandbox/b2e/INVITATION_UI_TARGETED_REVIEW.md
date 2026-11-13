# SCHOOLNET 5.C-B.2 — Correctif ciblé du lien de première activation

**Branche de revue :** `feature/schoolnet-student-invite-activation-ui`, basée directement sur `main`.  
**Objet :** préparer l'accueil de `/auth/reset-password?mode=student-invite` sur le site principal sans activer les connexions clients.  
**Statut :** PR brouillon pour revue ; **aucune fusion vers main, aucun déploiement volontaire de production, aucune mutation Supabase**.

## Changement minimal
- Le lien scolaire reconnaît exclusivement les utilisateurs Auth ayant `app_metadata.schoolnet_no_email_student === true`. Le compte Parent, Enseignant, Admin et un simple `user_metadata` forgé sont refusés.
- Au clic « Définir mon mot de passe », vérification distante par `supabase.auth.getUser()` **avant** `updateUser({ password })`.
- Les liens Parent `family-invite` continuent à utiliser leur propre marqueur serveur. La récupération habituelle reste inchangée.
- Le provider global bloque les sessions Auth des élèves marqués dont le statut SQL n'est pas exactement `enabled`, ou si la fonction de contrôle est indisponible ; vérification avant chargement du profil.
- Après définition du mot de passe scolaire, aucune promesse de connexion immédiate : retour à l'accueil tant que la connexion publique est désactivée.

## Prérequis déjà vérifiés
La RPC `public.schoolnet_no_email_my_session_enabled()` existe sur le projet principal, accessible aux utilisateurs `authenticated` ; elle renvoie uniquement un booléen calculé à partir de `auth.uid()` et de la ligne `schoolnet_student_no_email_requests` en statut `enabled` avec `activated_at` non nul. La redirection complète `https://schoolnet-snowy.vercel.app/auth/reset-password?mode=student-invite` est déjà enregistrée dans Supabase Auth.

## Tests
```powershell
git fetch origin
git switch feature/schoolnet-student-invite-activation-ui
npm ci
node --experimental-strip-types --test scripts/test-schoolnet-student-invite-guards.mjs
npm run build
```

Vérifier en navigation privée (sans lien réel) :
- `/auth/reset-password?mode=student-invite` : sans session, indique que l'invitation n'est pas valide.
- Une session Parent déjà ouverte ne doit pas donner accès au formulaire scolaire.
- `/auth/reset-password?mode=family-invite` et `/auth/reset-password` : aucun changement de comportement attendu.
- Toute nouvelle inscription réelle nécessite une recette Auth + RLS et l'ouverture ultérieure des fonctions Edge. **Ce correctif n'ajoute pas l'onglet « Identifiant SCHOOLNET » au login public**.

## Limites de sécurité
Les contrôles de `AuthProvider` ne remplacent jamais les politiques **RLS** : un client possédant un JWT peut interroger directement Supabase. Tester l'accès API avec une session d'invitation en attente avant d'inviter les familles.

Le lien d'invitation configuré par le backend pointe vers le domaine principal `schoolnet-snowy.vercel.app` : une éventuelle prévisualisation Vercel de cette branche ne reçoit pas automatiquement ce lien, et ne valide donc pas à elle seule le vrai parcours d'invitation. Une ouverture sur le site principal exigera une validation spécifique.

**Aucun nouveau secret, aucune migration SQL et aucune donnée client dans cette PR.**
