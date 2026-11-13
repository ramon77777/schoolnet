# SCHOOLNET 5.C-B.2 — Activation contrôlée de l'onglet « Identifiant SCHOOLNET »

**13 novembre 2026 — périmètre autorisé :** activer le formulaire sur SCHOOLNET principal. La protection pilote doit limiter tout login réel à la demande sélectionnée par `SCHOOLNET_STUDENT_PILOT_REQUEST_ID` (Yao Tabra). Aucune création de compte, aucune rotation de mot de passe, aucune migration SQL.

## Architecture de la mise en service

- Frontend Vite : sur le projet Supabase exact `anttmbhaphkhmkoqsofd` et en production, afficher `Adresse e-mail` + `Identifiant SCHOOLNET`. En local, garder une prévisualisation sans authentification. Connexion e-mail et Parent inchangées.
- Edge Function `schoolnet-student-login-release` : point d'entrée public (`verify_jwt=false`) **uniquement parce qu'un élève ne possède pas de JWT avant de se connecter**. Origine exacte, méthode POST, JSON strict et taille limitée.
- Réutiliser le secret Turnstile **déjà enregistré** `TURNSTILE_SECRET_KEY` de l'inscription publique (et son site key `VITE_TURNSTILE_SITE_KEY` dans Vercel) ; si l'un manque, refuser la connexion plutôt que court-circuiter le CAPTCHA. La vérification du domaine d'origine du jeton Turnstile demeure obligatoire.
- Comptage SQL des tentatives **global / téléphone familial / code / IP-advisory** effectué avant la vérification du mot de passe. Les en-têtes IP peuvent ne pas être attestés ; ils ne sont **pas** une frontière de sécurité. Pas de repli vers `x-forwarded-for`. Lorsque aucun en-tête n'est disponible, un bucket partagé `unknown-shared` limite les tentatives à 25 par fenêtre de 15 minutes.
- **Pilote isolé** : `SCHOOLNET_STUDENT_PILOT_REQUEST_ID` doit désigner le dossier de Yao Tabra. Après le contrôle des limites, le service relit la ligne protégée du registre et refuse la connexion d'un autre dossier. Pas d'e-mail technique transmis au navigateur.
- Première connexion : authentification du mot de passe auprès de Supabase Auth, validation du token, mutation atomique de `sent_declared` à `enabled` via RPC `service_role`, puis retour du JWT au navigateur. Le `AuthProvider` refuse les sessions non activées.
- **Arrêt d'urgence** : poser `SCHOOLNET_STUDENT_LOGIN_ENABLED=false` dans les secrets Supabase (actuellement, le code autorise le pilote sauf si cette variable vaut `false`). Si le CAPTCHA, le projet, le HMAC ou l'UUID pilote manque, refus en 503.

## Séquence de déploiement
1. Vérifier 8 tests ciblés et build CI.
2. Déployer la fonction publiquement avec `verify_jwt=false` **et les vérifications serveur** du code revu ; ne jamais rendre publique la fonction administrative.
3. Fusionner la PR frontend dans `main` pour que Vercel publie le formulaire.
4. Tester **une seule fois** avec téléphone familial, identifiant scolaire et mot de passe personnels (jamais communiquer ces secrets ici). Un login réussi doit entraîner la transition en `enabled`.
5. Vérifier statut, profil, droits de session et relation Parent. Refermer le mode pilote et planifier une ouverture plus large après recette.

**Limites :** le site key Turnstile est connu au navigateur, il n'est pas secret. Les secrets HMAC, Supabase service_role et Turnstile secret ne sont jamais intégrés au code. Les sessions de test doivent être contrôlées pour les accès RLS. Les comptes réels existants ne doivent pas être modifiés hors du dossier pilote autorisé.
