# SCHOOLNET — Lot 5.C : installation du rattachement automatique sur le principal

**Date :** 16 novembre 2026  
**Projet Supabase :** `schoolnet_2.0` — `anttmbhaphkhmkoqsofd`  
**Dépôt GitHub :** `ramon77777/schoolnet` — branche `integration/schoolnet-lot5c-local-first` — PR #13  
**Statut :** BACKEND SQL INSTALLÉ ET FONCTION ADMIN MISE À JOUR ; **VÉRIFICATION DU FLUX RÉEL À TERMINER AVANT LA PUBLICATION FRONTEND**.

## 1. Opérations réalisées

### SQL principal (avec accord de l'utilisateur)

- Proposition relue : `supabase/proposals/20261116_schoolnet_lot5c_MAIN_INSTALL_REVIEW_ONLY.sql`.
- Exécution d'essai de la transaction suivie de `ROLLBACK` : **réussie** ; la disparition des objets provisoires et les compteurs préexistants ont été vérifiés.
- Installation transactionnelle via Supabase `apply_migration` : **réussie**.
- Historique Supabase : version `20261116162501`, nom `schoolnet_lot5c_parent_child_autolink_and_sibling_approval`.
- Copie versionnée de la migration appliquée : `supabase/migrations/20261116162501_schoolnet_lot5c_parent_child_autolink_and_sibling_approval.sql`.
- Objets installés : `public.schoolnet_sibling_parent_approvals`, garde privée `schoolnet_student_private.guard_sibling_parent_approval()`, déclencheur d'approbation `schoolnet_sibling_approval_guard`, fonction privée `schoolnet_student_private.link_verified_no_email_family_after_activation()`, déclencheur `schoolnet_student_no_email_autolink_family_after_activation`.
- Les anciennes RPC d'activation et leurs protections ont été préservées. La table d'approbation est vide et protégée par RLS + FORCE RLS. Le rôle `service_role` seul peut y créer les preuves validées.

### Fonction administrative

- **`schoolnet-student-no-email-admin` : v7 → v8**, statut `ACTIVE`, `verify_jwt=true`.
- Nouvelle action `approve_parent_reuse` pour un Parent déjà activé avec au moins un enfant, exigeant une approbation distincte du nouvel enfant.
- Cohorte pilote / canari et vérifications JWT Admin conservées ; aucune ouverture générale ni modification des secrets ou flags.
- Origines de mutation limitées au domaine de production SCHOOLNET ; `localhost` reste en lecture seule et nécessite en outre un opt-in explicite des deux côtés pour l'inspection.
- Sauvegarde du code exact de l'ancienne version : `docs/rollback/SCHOOLNET_ADMIN_EDGE_V7_PRE_LOT5C_20261116.json`. **Ce fichier est un archivage de code, pas une sauvegarde PostgreSQL.**

## 2. Vérification des données réelles après l'installation

| Mesure | Avant | Après |
|---|---:|---:|
| Profils `public.profiles` | 12 | 12 |
| Liens `public.parent_links` | 2 | 2 |
| Demandes publiques | 6 | 6 |
| Invitations Parent | 1 | 1 |
| Comptes Apprenants sans e-mail enregistrés | 1 | 1 |
| Comptes Apprenants sans e-mail `enabled` | 1 | 1 |
| Nouvelles approbations `sibling_parent_approvals` | — | 0 |
| Nouveaux déclencheurs activés | — | 2 |
| Enfants déjà activés avec lien incohérent | 0 | 0 |

Vérifications des permissions : RLS et FORCE RLS actifs, lecture/insertion interdites aux rôles `anon` et `authenticated`; exécution de la RPC d'activation réservée au rôle serveur. Les anciens avertissements Supabase concernant d'autres fonctions SECURITY DEFINER, `search_path` mutable et protection des mots de passe compromis restent à traiter séparément ; ils n'ont pas été introduits par le Lot 5.C.

## 3. Ce qui n'a PAS été réalisé

- Aucun compte Auth réel créé ou supprimé ; aucune invitation réelle envoyée.
- Aucun rattachement nouveau exécuté sur de véritables dossiers ; le scénario complet de nouveau Parent + deux enfants reste validé **en sandbox**, pas encore par une recette réelle sur principal.
- Aucun réglage de secrets, de contrôle Turnstile, de cohortes ou de flag de release changé.
- Aucun `main` GitHub fusionné ; **aucune publication Vercel**.
- Pas de sauvegarde récupérable externe de la base dans cette session : le projet est sur Supabase Free, qui n'offre pas de sauvegardes automatiques. La migration installée a été limitée à des objets additifs et aucun enregistrement métier ancien n'a été modifié, mais cela **ne remplace pas** une sauvegarde indépendante.

## 4. Contrôles à faire avant le déploiement web

1. Sur Windows, `git status --short`, `git pull --ff-only` puis `npm run qa:lot5c` sur la branche d'intégration. Les tests automatisés vérifient les protections de l'administration et le cas multi-enfants.
2. Examiner le parcours local `Administration → Demandes publiques → Examiner → Accès Apprenant`. Par défaut l'interface locale reste **en lecture seule**, pour éviter toute mutation de la base réelle avant publication.
3. Vérifier l'espace Parent `Mes enfants`, y compris la présentation des enfants avec et sans classe ; ne pas inventer de dossiers réels uniquement pour le test.
4. Avant une activation réelle, confirmer le dossier pilote, l'autorité parentale, la bonne configuration HMAC et le statut de remise ; garder les activations générales désactivées.
5. Confirmer la configuration Git→Vercel, puis fusionner et publier **sur accord explicite**. La nouvelle interface Admin n'est pas encore sur Vercel.

## 5. Retour arrière en cas d'incident

**Code Edge :** les sources précises de la v7 sont archivées dans le dépôt privé et permettent de reconstruire un déploiement de l'ancienne fonction avec `verify_jwt=true`. La restauration de code doit être autorisée et retestée.

**SQL avant toute utilisation :** si aucun nouveau dossier n'a été approuvé ni activé depuis l'installation, les objets additifs peuvent être retirés dans une nouvelle transaction de retour arrière préalablement auditée et autorisée. Ne pas essayer de rejouer la migration déjà enregistrée.

**SQL après activation :** arrêter les nouvelles activations via les contrôles serveur et vérifier les données créées avant toute intervention. Ne jamais supprimer automatiquement les objets ni les liens familiaux réels ; la présence d'enfants rattachés impose un plan spécifique.

**Production frontend :** la version actuelle publiée sur Vercel est inchangée. La PR #13 reste en brouillon et la fusion dépend de la validation locale.

## 6. Suite

**Priorité :** recette locale ciblée du dossier Admin et du compte Parent sur le code de la PR #13, puis validation de la mise en service contrôlée d'un nouveau cas familial sans impact sur les dossiers existants. **Pas de retour aux exercices de sandbox déjà réussis.**
