# SCHOOLNET Lot 5.C-B.2 — Etape 2.B : recette technique Supabase Auth sans e-mail personnel

Date : 13 novembre 2026
Statut : **harness de test prepare — aucune preuve de recette reelle avant execution GitHub Actions**.
Branche : `feature/schoolnet-student-sans-email`.

## Objectif
Verifier uniquement sur la sandbox Supabase `onqlsvphmrqhelislpry` qu'un compte Auth peut employer une adresse technique non distribuable `@schoolnet.invalid`, tout en utilisant les liens `invite` et `recovery` via `generateLink`, sans envoyer d'e-mail. Deux comptes enfants fictifs utilisent une coordonnee familiale fictive commune **hors** du champ Auth `phone`, mais restent independants.

## Garde-fous
- La fonction `schoolnet-auth-sandbox-student-b2b` refuse les appels non signes et n'accepte qu'un JWT OIDC GitHub Actions valide provenant du depot, de la branche et du workflow exacts.
- Validation cryptographique RS256/JWKS officielle, audience et issuer stricts ; aucune cle service_role transmise a GitHub.
- Le projet Supabase doit etre exactement la sandbox (URL de service stricte) ; refusal sinon.
- Etat initial exige : exactement deux anciens comptes de test B3 connus et aucun compte B2B ; aucun autre utilisateur admissible.
- Un appel repete est bloque par les comptes cibles deja presents ; si l'essai est partiel, **ne pas rejouer ni supprimer les comptes automatiquement**.
- Deux aliases non distribuables fixes ; mots de passe aléatoires uniquement en memoire de la fonction ; jamais de token/lien/OTP/password/ID retourne dans la reponse.
- `generateLink` construit le lien et **n'envoie pas de message** ; test de remise reelle a un parent non couvert.
- Le code est archive dans `docs/sandbox/b2b/edge/index.ts` pour audit et doit etre remplace par `disabled.ts` apres l'experience.
- Aucun schema metier, compte reel, parent reel, rattachement ou migration dans le projet principal.

## Scenarios
1. Refus de toute requete anonyme (HTTP 401) ; preflight OIDC signe accepte (200).
2. Refus si une adresse de test existe deja ou si la liste des comptes sandbox differe des deux anciens.
3. `generateLink(type:invite)` cree deux utilisateurs avec emails techniques `@schoolnet.invalid`.
4. Consommation de `invite` par `verifyOtp`, mot de passe defini avec `updateUser`, rejeu du lien refuse.
5. Login par mot de passe pour chaque apprenant, mauvais secret refuse, comptes et sessions distincts verifies avec Auth.
6. `generateLink(type:recovery)`, consommation `verifyOtp`, changement de mot de passe, rejet de l'ancien mot de passe et du rejeu.
7. Verification : les deux comptes ont le meme contact fictif en `app_metadata`, mais pas de numero dans `auth.users.phone` ; le deuxieme apprenant n'est pas affecte par la recuperation du premier.
8. Nouvelle tentative de lancer le scenario refusee (HTTP 409).
9. Fonction de test desactivee apres l'execution (HTTP 410 cote code).

## Notes
- Le test ne valide pas encore la resolution dynamique `telephone familial + code SCHOOLNET` ; celle-ci attend une table privee et une protection brute-force.
- Le code test pourrait echouer sur le domaine `.invalid` ; l'echec est un resultat scientifique. Ne pas essayer un alias reel ou un email parent en remplacement.
- Les deux comptes B3 de la sandbox ne doivent etre ni touches ni supprimes.
- Si la recette passe, aucun compte reel SCHOOLNET n'est cree automatiquement ; un nouveau jalon est necessaire pour les migrations.
