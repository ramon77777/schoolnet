# SCHOOLNET 5.C-B.2 — Publication de la configuration d'alias interne

**Date :** 13 novembre 2026 ; accord explicite de l'utilisateur pour `schoolnet.invalid`.  
**Supabase principal :** `anttmbhaphkhmkoqsofd`.  
**Commit code :** `9f35470` sur `feature/schoolnet-student-sans-email`.  
**État :** deux fonctions Edge remplacées en **version 2**, `verify_jwt=true`, services métier fermés. Aucun changement de `main` ni publication Vercel.

| Edge | Version après déploiement | JWT obligatoire | Activation métier |
| --- | ---: | --- | --- |
| `schoolnet-student-no-email-admin` | 2 | oui | non (flag Admin non activé) |
| `schoolnet-student-login-release` | 2 | oui | non (flag login, CAPTCHA et preuve d'IP encore requis) |

Les deux fonctions utilisent exclusivement `schoolnet.invalid` depuis le code commun, sans `SCHOOLNET_STUDENT_ALIAS_DOMAIN` ni domaine à acheter. Les anciens tests qui refusaient `.invalid` ont été adaptés ; un test de régression statique supplémentaire protège la configuration : `scripts/test-student-no-email-internal-alias-release.mjs`.

**Contrôles après déploiement :** `auth.users = 11`, `profiles = 11`, `parent_links = 1`, `student_enrollments = 2`, `schoolnet_student_no_email_requests = 0`. Aucun compte, code ou lien client créé.

**Limite importante :** la sandbox contient deux utilisateurs Auth avec des alias `@schoolnet.invalid`, mais le parcours d'invitation `admin.generateLink({type:'invite'})` avec cet alias n'a pas encore été éprouvé dans SCHOOLNET principal. Une recette contrôlée avec un compte fictif est requise avant inscription client. Les adresses internes ne peuvent pas recevoir d'e-mails ; les liens et leur récupération doivent toujours être remis manuellement et authentifiés côté administration.

## Prérequis restants, par ordre

1. Ajouter **uniquement** `SCHOOLNET_STUDENT_CODE_PEPPER` dans **Supabase → Edge Functions → Secrets**. Générer au moins 32 octets aléatoires et le conserver durablement dans un coffre de secrets. Ne jamais exposer la valeur au navigateur ni dans GitHub. **La variable de domaine n'est plus nécessaire.**
2. Confirmer la redirection `/auth/reset-password?mode=student-invite` dans la configuration d'Auth.
3. Recette d'inscription fictive sur SCHOOLNET principal avec parent existant vérifié, compte enfant fictif, lien personnel et preuve d'absence d'accès scolaire d'une session `pending`.
4. Préparer Turnstile, une origine IP réellement fiable et les tests rate-limit/RLS avant le login public ; ne pas désactiver `verify_jwt` à l'avance.

Ne pas activer `SCHOOLNET_STUDENT_ACCOUNTS_ENABLED`, `SCHOOLNET_STUDENT_LOGIN_ENABLED` ou `SCHOOLNET_STUDENT_TRUSTED_IP_VERIFIED` avant la validation des contrôles associés. Ne pas réappliquer la migration SQL déjà enregistrée.
