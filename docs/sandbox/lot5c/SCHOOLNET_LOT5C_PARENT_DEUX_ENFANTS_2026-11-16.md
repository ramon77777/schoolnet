# SCHOOLNET — Lot 5.C : un Parent pour deux enfants (sandbox)

**Date :** 16 novembre 2026  
**Statut :** RECETTE BACKEND ET RLS RÉUSSIE — SANDBOX UNIQUEMENT  
**Cible :** `schoolnet-auth-sandbox` (`onqlsvphmrqhelislpry`).  
**Branche :** `feature/schoolnet-lot5c-fiche-compacte-finalisation`, PR n° 12 en brouillon.

## 1. Pourquoi cette évolution ?

La table `schoolnet_family_invitation_records` possède les index uniques `lower(email)` et `user_id`. Il est donc impossible de créer normalement une seconde invitation Parent pour un second enfant du même compte. Il serait dangereux de supprimer simplement ces index.

**Architecture retenue pour la sandbox :**
- Une identité Auth Parent unique et **une seule** invitation Parent validée.
- Une demande publique et un compte Auth distincts pour chaque enfant.
- Une preuve d'approbation administrative **propre à la deuxième demande** dans `public.schoolnet_sibling_parent_approvals`, sans copie de l'invitation Parent.
- La table de preuve est en RLS + FORCE RLS, accessible en lecture/insertion au rôle serveur uniquement. Contrôle par trigger privé de la qualité Admin du vérificateur, de l'identité Auth Parent, de sa précédente invitation activée, de l'e-mail et de la relation déclarée. Aucune modification de la preuve après création.
- Le déclencheur `schoolnet_student_private.link_verified_no_email_family_after_activation` accepte soit l'invitation activée de la demande (premier enfant), soit une preuve individuelle de réutilisation pour un Parent déjà lié à au moins un enfant, **et jamais la seule égalité d'e-mail**.
- Les protections d'identité de l'apprenant dans `app_metadata`, la transaction d'activation et la prévention des conflits familiaux restent obligatoires.

Fichier versionné **REVIEW ONLY** :
`supabase/proposals/20261116_schoolnet_sibling_parent_reuse_SANDBOX_REVIEW_ONLY.sql`.

La proposition a été exécutée **uniquement** dans la sandbox. **Ce n'est pas une migration de production ni une fonctionnalité déjà branchée sur l'interface Admin principale.**

## 2. Recette réellement effectuée

GitHub CI (code, Deno et assertions statiques) : https://github.com/ramon77777/schoolnet/actions/runs/43858080300 — **SUCCÈS**.

Recette Auth / PostgreSQL / RLS : https://github.com/ramon77777/schoolnet/actions/runs/43858367913 — **SUCCÈS**.

Dossiers entièrement fictifs : `DEM-L5C-SIB-01` et `DEM-L5C-SIB-02`.

| Contrôle | Résultat |
|---|---|
| Création Auth via API officielle (1 Parent + 2 Apprenants), vérification des sessions réelles | OK |
| Création de deux demandes indépendantes pour un Parent | OK |
| Une seule invitation Parent activée (remise fictive, aucun message envoyé) | OK |
| Tentative d'insertion d'une deuxième invitation Parent | Refus SQL 23505, sans écriture |
| Activation du premier enfant avec l'invitation Parent | OK |
| Activation du second enfant sans approbation propre à son dossier | Refus SQL 23514 |
| État après refus : second enfant non activé, premier lien conservé | Rollback vérifié |
| Tentative d'approbation par une identité `student` | Refus SQL 23514 |
| Approbation explicite du deuxième dossier par un profil `admin` fictif | OK |
| Tentative de modification ultérieure de l'approbation | Refusée |
| Activation du deuxième enfant après approbation | OK |
| Deuxième activation du même enfant | Sans doublon |
| `parent_links` pour le Parent | Exactement 2, un par enfant |
| `profiles.child_ids` du Parent | Exactement 2 UUID distincts |
| Un seul enregistrement d'invitation Parent | Confirmé |
| JWT Parent, politiques RLS : lecture des deux profils enfants | OK |
| JWT du premier enfant : interdiction de lire son frère ou sa sœur | OK |
| Inscription scolaire annuelle | Non requise |
| Anciennes recettes `DEM-L5C-SBX-TEST01` et `DEM-L5C-NG-06` | Comptes activés et liens inchangés |
| Appel non signé de la fonction de test | HTTP 401 |

Ces tests ont utilisé des identités et confirmations de remise entièrement synthétiques. La vérification d'une session Supabase Auth était réelle, mais **la remise des invitations, la validation de parenté et le code scolaire HMAC étaient simulés pour la recette**.

## 3. État final vérifié par SQL en lecture seule

| Mesure globale de sandbox | Après recette |
|---|---:|
| `auth.users` | 22 |
| Nouveaux comptes Auth de cette recette | 3 |
| `public.profiles` | 18 |
| Demandes publiques fictives | 9 |
| Invitations Parent | 8 |
| Registres Apprenants sans e-mail | 9 |
| Comptes Apprenants `enabled` | 4 |
| Rattachements `parent_links` | 4 |
| Preuves individuelles de réutilisation Parent | 1 |

Les deux dossiers SIB-01 et SIB-02 sont au statut `enabled` et pointent vers le **même Parent**, qui a deux enfants dans `child_ids` et **une seule** invitation. La demande administrative demeure `new`, indépendamment de l'état Auth.

## 4. Fermeture du programme de recette

La fonction `schoolnet-lot5c-siblings-sandbox-once` a été neutralisée immédiatement après le succès : **version 2**, `verify_jwt=true`, code exclusivement inerte et réponse HTTP 410. La neutralisation a été vérifiée via Supabase.

La proposition SQL reste active **uniquement en sandbox** pour d'autres contrôles autorisés. Aucun compte ou projet de production n'a été modifié. La PR n° 12 est toujours en brouillon et non fusionnée.

## 5. Ce qu'il reste à intégrer et à tester

1. **Fonction administrative :** ajouter dans le workflow Admin un choix sécurisé « Parent existant » permettant, après contrôle de l'autorité parentale propre à la nouvelle demande et validation du JWT Admin, d'enregistrer l'approbation dans le registre serveur. Le code actuel `schoolnet-student-no-email-admin` attend encore une invitation `parent` associée à la même demande : il n'est **pas compatible en l'état** avec le deuxième enfant.
2. **Migration production :** revue de sécurité et conversion propre de cette preuve de concept en migration officielle, tests sur base vierge, politique de repli, sans toucher aux index uniques existants.
3. **Vraie connexion Apprenant :** `code SCHOOLNET + téléphone familial + mot de passe + Turnstile` avec identifiants, clés et frontend uniquement sandbox.
4. **Interface Parent :** vérification visuelle de la présence des deux enfants dans « Mes enfants », desktop et mobile, depuis une application reliée exclusivement à la sandbox.
5. **Risques résiduels :** révocation d'autorité parentale, changement d'e-mail, nouveaux liens familiaux contradictoires, test de concurrence instrumenté, avertissement `public.is_admin()` SECURITY DEFINER et protection des mots de passe compromis.

**Aucun déploiement Vercel principal, aucune migration Supabase principale, aucune fusion de `main`.**
