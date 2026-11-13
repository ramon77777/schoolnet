# SCHOOLNET — Lot 5.C-B.2 / Backend, invitation et lien Parent–Apprenant

**Statut mis à jour au 13 novembre 2026 : migration de sécurité SQL appliquée et vérifiée. Les deux fonctions Edge sont désormais DÉPLOYÉES sur Supabase principal (v1), mais volontairement NON ACTIVÉES pour les utilisateurs.** Voir `SECURITY_APPLIED_PRODUCTION_2026-11-13.md` et `PRODUCTION_EDGE_GUARDED_DEPLOYMENT_2026-11-13.md`.

## Parcours réutilisant les modules actuels

1. L'administration vérifie une demande `student_enrollment` où `student_email` est absent. Le compte du parent, dans **la même demande**, doit déjà posséder une invitation familiale **activée**, avec un profil `parent` et un e-mail Auth identique au contact parental.
2. Le nouveau service Admin (`schoolnet-student-no-email-admin`) réserve une seule opération par demande, génère un e-mail technique propre à l'enfant (sous domaine géré), crée une invitation Supabase Auth **sans envoi automatique**, confirme le marqueur dans `app_metadata`, renseigne le profil `student` et génère un code opaque `SN-XXXX-XXXX-XXXX`.
3. Seule l'empreinte HMAC-SHA256 du code est conservée en base, jamais le code ni le lien. La réponse ponctuelle du service permet à l'Admin de copier un message à transmettre au parent vérifié, qui accompagne son enfant pour choisir son mot de passe.
4. L'Admin confirme **après remise effective**. Le compte passe de `prepared` à `sent_declared` ; tant que cette étape n'est pas réalisée, le login est bloqué.
5. L'apprenant se connecte avec **téléphone familial + code scolaire + son propre mot de passe**. L'Edge `schoolnet-student-login-release` vérifie un jeton Turnstile et l'IP fournie par un proxy *vérifié*, compte les tentatives de façon atomique, vérifie le mot de passe avec Supabase Auth, vérifie le jeton Auth, puis active le compte dans une RPC à usage serveur. Aucun e-mail technique n'est affiché au navigateur.
6. Le Parent reste lié par **l'existant** `admin_finalize_public_enrollment_request`, après justification administrative et inscription scolaire active. Cette RPC crée `parent_links` et synchronise `profiles.child_ids`, pour que « Mes enfants » et les résultats puissent suivre leur logique actuelle. Le nouveau déclencheur SQL refuse la finalisation si le compte scolaire du **bon enfant et du bon parent** n'est pas activé.

## Sécurité préalable importante

La migration de sécurité est **désormais appliquée et vérifiée en production** : droits SQL de `profiles` limités aux champs personnels pour les utilisateurs ordinaires, et trois voies de rattachement protégées (`public_enrollment_request_resolutions`, `parent_links`, `profiles.child_ids`). **Aucun compte Apprenant n'a été créé, aucun service de connexion n'a été activé.** Voir `docs/sandbox/b2e/SECURITY_APPLIED_PRODUCTION_2026-11-13.md`.

Cette proposition est dans `supabase/proposals/20261113_student_no_email_release_REVIEW_ONLY.sql`, volontairement **pas** dans `supabase/migrations/` afin d'éviter son exécution accidentelle.

## État d'activation

| Élément | Statut |
| --- | --- |
| Interface connexion sans e-mail : recette locale | Validée par captures utilisateur (formulaire et message vert) |
| Prévisualisation Admin de l'invitation sans e-mail | Codée, lecture seule en local |
| Backend Admin pour créer une identité scolaire | **Déployé en production**, JWT obligatoire, actions **désactivées** par défaut |
| Backend Auth de production avec contrôle Turnstile | **Déployé en production**, JWT obligatoire provisoirement, login public **fermé** |
| SQL migration rôle/RLS/identités | **Appliquée en production** (`20261113124329`), vérifiée |
| Compte réel Yao Tabra / lien vers Yao Thierno | **Non créé, non lié** |
| Edge sandbox ancienne | Toujours verrouillée |
| `main` / Supabase production | `main` inchangée ; **migration DB de sécurité appliquée**, données utilisateur inchangées |

## Test local après `git pull` (Windows)

Dans `D:\Bakary\10 autres\schoolnet` :

```powershell
git status
git fetch origin
git switch feature/schoolnet-student-sans-email
git pull --ff-only origin feature/schoolnet-student-sans-email
npm ci
node --experimental-strip-types --test scripts/test-student-no-email-policy.mjs scripts/test-student-no-email-login-core.mjs scripts/test-student-login-preview.mjs scripts/test-student-no-email-release-guard.mjs
npm run build
npm run dev
```

À `/auth/login`, choisir **Identifiant SCHOOLNET**. Le développement local conserve la **prévisualisation uniquement**, sans appel Auth ni écriture. Dans **Administration → Demandes publiques**, ouvrir une demande Apprenant sans e-mail : le panneau supplémentaire montre les étapes sans action de création en local. Les tests **réels** du backend et des invitations devront être faits sur une préproduction isolée après mise en place contrôlée du schéma.

Si `git status` signale des fichiers modifiés, ne pas utiliser `reset --hard` et ne pas écraser les changements : les examiner avant le changement de branche.

## Conditions préalables à une activation/déploiement

- **Migration SQL déjà approuvée, appliquée et contrôlée** ; ne pas la réexécuter. Effectuer la recette UI des champs personnels `profiles` après la restriction des droits et l'audit des sessions `pending`.
- Fournir un **domaine technique effectivement contrôlé** pour les identités Auth. Le prototype `@schoolnet.invalid` n'est pas un domaine de production. Configurer les redirections Supabase Auth autorisées vers `/auth/reset-password?mode=student-invite`.
- Fournir un secret HMAC stable (`SCHOOLNET_STUDENT_CODE_PEPPER`, longueur >=32) **uniquement** dans les secrets serveur, jamais `VITE_` ou GitHub. Éviter toute rotation non planifiée : elle invaliderait la correspondance des codes déjà émis.
- Installer la migration sur **un environnement de préproduction** et valider la création de deux enfants partageant un téléphone, les liens uniques de récupération, l'activation Auth et le lien familial via la RPC existante.
- Vérifier avec l'infrastructure que `cf-connecting-ip` est émis/écrasé par le **proxy de confiance**. Sans preuve, ne pas définir `SCHOOLNET_STUDENT_TRUSTED_IP_VERIFIED=true`. Ajouter une protection WAF. Aucune relecture d'IP fournie par le client.
- Vérifier Turnstile sur le véritable hostname et les limites Supabase Auth. Ne rendre la fonction pré-Auth publique (`verify_jwt=false`) qu'après ces contrôles. L'endpoint Admin reste `verify_jwt=true`.
- Auditer les autres politiques RLS de cours, notes, résultats et médias pour s'assurer qu'une session temporaire de récupération d'un élève encore `pending` ne donne accès à aucune donnée scolaire. La barrière `AuthProvider` est **une protection UI, pas une garantie RLS côté serveur**.
- Déployer séparément les fonctions Edge après recette. Activer les indicateurs d'environnement par phase, puis les indicateurs Vite pour le site Vercel. Ne jamais déployer avec `service_role` dans un bundle navigateur.
- Prévoir l'audit, les erreurs réseau partielles, les reprises manuelles, la révocation et le nettoyage des compteurs. Ne pas relancer une création après un timeout : inspecter le registre et Auth avant toute reprise.
- Tester le renouvellement de code/lien et la révocation : dans cette version, une réservation interrompue passe en `requires_review`, et ne doit **pas** être automatiquement rejouée.

## Variables serveur (aucune valeur dans ce dépôt)

- `SCHOOLNET_STUDENT_ACCOUNTS_ENABLED` : `false` tant que la création Admin est fermée.
- `SCHOOLNET_STUDENT_LOGIN_ENABLED` : `false` tant que le login public est fermé.
- `SCHOOLNET_STUDENT_ALIAS_DOMAIN` : sous-domaine technique contrôlé.
- `SCHOOLNET_STUDENT_CODE_PEPPER` : clé secrète HMAC.
- `SCHOOLNET_STUDENT_TURNSTILE_SECRET` : clé privée Turnstile (distincte de la clé publique Vite).
- `SCHOOLNET_STUDENT_TRUSTED_IP_VERIFIED` : `false` jusqu'à preuve du chemin proxy.

Les variables Vite facultatives `VITE_SCHOOLNET_STUDENT_ACCOUNTS_ENABLED` et `VITE_SCHOOLNET_STUDENT_LOGIN_RELEASE_ENABLED` restent **désactivées** tant que la recette backend n'est pas approuvée. Le navigateur n'obtient aucune clé privée.

**Les deux fonctions ont été déployées, mais aucune activation ni création de compte n'a été exécutée.** Le login public exige encore un contrôle de sécurité de bout en bout. Ne pas confondre `status=ACTIVE` (fonction installée) et `SCHOOLNET_STUDENT_LOGIN_ENABLED=true` (service ouvert).