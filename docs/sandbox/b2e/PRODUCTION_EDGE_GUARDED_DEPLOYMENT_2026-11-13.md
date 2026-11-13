# SCHOOLNET — Backend du Lot 5.C-B.2 installé mais non ouvert

**Date :** 13 novembre 2026.  
**Projet Supabase principal :** `anttmbhaphkhmkoqsofd`.  
**Autorisation :** l'utilisateur a demandé expressément de poursuivre directement sur SCHOOLNET principal pour accélérer les inscriptions.  
**Branche GitHub :** `feature/schoolnet-student-sans-email`; `main` inchangée.

## Déploiement vérifié

| Fonction Edge | Version | Statut | verify_jwt | État métier |
| --- | ---: | --- | --- | --- |
| `schoolnet-student-no-email-admin` | 1 | ACTIVE | **true** | Aucune écriture autorisée tant que `SCHOOLNET_STUDENT_ACCOUNTS_ENABLED` n'est pas explicitement `true`. |
| `schoolnet-student-login-release` | 1 | ACTIVE | **true provisoirement** | Login anonyme bloqué par la plateforme JWT et par `SCHOOLNET_STUDENT_LOGIN_ENABLED` / secrets / proxy / Turnstile. |

Chaque fonction a été déployée à partir des fichiers GitHub existants, avec ses dépendances `_shared`. Aucun endpoint précédemment actif n'a été remplacé.

**Contrôle DB post-déploiement :** `auth.users=11`, `profiles=11`, `parent_links=1`, `student_enrollments=2`, `schoolnet_student_no_email_requests=0`, `login_attempt_windows=0`, `login_audit=0`. Aucune création de compte, aucune inscription ni rattachement.

## Configuration indispensable pour les inscriptions réelles

1. Dans Supabase principal → **Edge Functions → Secrets**, enregistrer uniquement côté serveur :
   - **Aucun domaine à acheter ni à configurer** : seul `schoolnet.invalid` est autorisé comme identifiant Auth interne. Ces adresses ne reçoivent aucun e-mail. Le lien d'invitation et toute récupération sont remis manuellement au parent vérifié ; les autres domaines sont refusés.
   - `SCHOOLNET_STUDENT_CODE_PEPPER` : secret HMAC aléatoire, durable, d'au moins 32 octets. **Le sauvegarder dans un gestionnaire de secrets sûr** ; aucune copie dans un dépôt GitHub ou une variable Vite.
   - Laisser `SCHOOLNET_STUDENT_ACCOUNTS_ENABLED=false` tant que le compte Parent et les parcours d'invitation n'ont pas été validés.
2. Pour la connexion publique, en plus des précédents, configurer un widget Cloudflare Turnstile lié au domaine exact `schoolnet-snowy.vercel.app` et le secret `SCHOOLNET_STUDENT_TURNSTILE_SECRET`. Ajouter la clé publique `VITE_TURNSTILE_SITE_KEY` dans le projet Vercel, uniquement au moment du déploiement approuvé.
3. Ne jamais poser `SCHOOLNET_STUDENT_TRUSTED_IP_VERIFIED=true` sans avoir prouvé que `cf-connecting-ip` est inséré/écrasé par un proxy de confiance pour **chaque** requête Edge. En l'absence de preuve, il faut revoir la stratégie IP (et les tests du code) avant ouverture du login ; un header envoyé par le navigateur est falsifiable.
4. Supabase Auth → URL Configuration : autoriser l'URL de première connexion `https://schoolnet-snowy.vercel.app/auth/reset-password?mode=student-invite` ; ne jamais utiliser une redirection arbitraire.
5. Avant création d'un compte réel : enregistrer le domaine et le secret serveur, inspecter une demande fictive éligible, vérifier rôle Admin, Parent pré-activé dans la **même demande**, et tester une session d'invitation pending contre les endpoints RLS métiers. Les actions Admin sont **à usage unique** et un timeout ne doit pas être rejoué.
6. Après cette recette, déployer le frontend Vercel avec `VITE_SCHOOLNET_STUDENT_ACCOUNTS_ENABLED=true` (Admin) ; mettre `VITE_SCHOOLNET_STUDENT_LOGIN_RELEASE_ENABLED=true` seulement après test du login. Le login devra être redéployé avec `verify_jwt=false` **uniquement après** vérification complète de Turnstile + rate limiting + IP / RLS pending.

## Pratique immédiate pour le collaborateur

Le formulaire de demandes d'inscription publiques et la console Administration existants restent disponibles. Ils permettent de recevoir et vérifier les demandes de clients **sans créer encore de comptes Apprenant**. Ne pas annoncer la connexion par identifiant SCHOOLNET comme activée ; ne pas transmettre de nouveaux codes avant l'ouverture contrôlée.

## Important

La branche GitHub contient aussi le fichier `supabase/config.toml` avec le login volontairement laissé en `verify_jwt=true`. Toute modification future de ce paramètre est une opération de sécurité à revoir séparément.

La migration DB `20261113124329_schoolnet_student_no_email_security_release_20261113` est **déjà appliquée**. Ne jamais la relancer.
