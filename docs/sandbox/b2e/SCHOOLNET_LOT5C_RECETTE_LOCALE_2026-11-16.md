# SCHOOLNET Lot 5.C — Recette locale et mise en service générale (16 novembre 2026)

## Statut réel
- Code de la fiche compacte et backend préparés dans la branche `feature/schoolnet-lot5c-fiche-compacte-finalisation`.
- **Aucune migration de production appliquée ; aucune Edge Function de cette branche déployée ; aucun merge main.**
- L'ancienne mise en service limitée à Yao Tabra reste en production.
- La PR GitHub est un brouillon, à ne pas fusionner avant la recette.

## Étape locale (sans action Supabase)
Dans le terminal PowerShell du dépôt SCHOOLNET :
```powershell
git status
git fetch origin
git switch feature/schoolnet-lot5c-fiche-compacte-finalisation
git pull --ff-only origin feature/schoolnet-lot5c-fiche-compacte-finalisation
node --test scripts/test-schoolnet-lot5c-ui-compact.mjs scripts/test-schoolnet-no-email-auto-family-link.mjs
node --experimental-strip-types --test scripts/test-schoolnet-student-rollout-guard.mjs scripts/test-schoolnet-student-login-production-release.mjs
npm run build
npm run dev
```
**Important :** si `git status` révèle des changements non sauvegardés ou si `git switch` refuse la bascule, s'arrêter. Ne pas utiliser `git reset --hard`, `git clean` ou `--force` par défaut.

## Recette visuelle en local
- Bureau : ouvrir `Administration → Demandes publiques → Examiner` ; les informations essentielles apparaissent directement, les onglets changent la zone centrale, le pied de fenêtre reste accessible.
- Mobile : même fiche sur une seule colonne, onglets défilables horizontalement, actions accessibles sans parcourir tout le dossier.
- Compte Apprenant sans e-mail : état lisible, note et case de vérification, aucun diagnostic technique déployé au premier niveau ; `requires_review` bloque les tentatives de recréation.
- Onglet famille : invitations et suggestions d'identité sont repliées ; le formulaire de finalisation scolaire reste disponible.
- Onglet Dossier : observations et note interne sous section repliable.
- Bouton « Refuser » demande une confirmation.
- Le changement d'onglet ne supprime pas un lien temporaire déjà généré et non encore transmis.

En `localhost`, la création Apprenant sans e-mail reste volontairement **désactivée** (prévisualisation). Ne pas essayer de créer un compte réel depuis la prévisualisation.

## Revue backend avant recette réelle
1. Appliquer uniquement en **sandbox**, après revue, la proposition `supabase/proposals/20261116_schoolnet_no_email_auto_family_link_REVIEW_ONLY.sql`. Ce n'est **pas** une migration officielle. Tester rollback, statut, double-clic, famille erronée et `parent_links / profiles.child_ids`.
2. Vérifier les nouvelles Edge Functions Admin/Login en sandbox avec leurs contrôles JWT, service role, Turnstile et limitation des tentatives.
3. Sur principal, exécuter un preflight SELECT, puis préparer le pilote canary `SCHOOLNET_STUDENT_CANARY_REQUEST_ID` avec un **deuxième dossier de test autorisé**. Laisser `SCHOOLNET_STUDENT_GENERAL_RELEASE_ENABLED=false`.
4. Effectuer une première connexion contrôlée : invitation → mot de passe → connexion → `enabled` → lien familial auto → Parent « Mes enfants ».
5. Vérifier qu'un autre dossier ne peut pas encore créer de compte ni se connecter via identifiant SCHOOLNET.
6. Après validation utilisateur, installer les migrations et les Edge Functions, puis activer expressément la mise en service générale.

## Conditions de clôture définitive
- Interface compacte desktop/mobile validée par utilisateur.
- Tests TypeScript/Vite et sécurité réussis.
- Première inscription sur un **deuxième dossier** sans SQL manuel.
- Confirmation que Parent voit l'Apprenant sans classe attribuée.
- Aucune erreur Auth ni doublon, aucun assouplissement des RLS/roles.
- Seule la production pourra être marquée « module clos, ouvert aux clients » après la recette de mise en service générale.

## Repli
En cas de problème avec le nouveau backend, mettre `SCHOOLNET_STUDENT_LOGIN_ENABLED=false` et `SCHOOLNET_STUDENT_ACCOUNTS_ENABLED=false` (à configurer depuis Secrets Supabase). Ne jamais contourner Turnstile ni divulguer les identifiants techniques.
