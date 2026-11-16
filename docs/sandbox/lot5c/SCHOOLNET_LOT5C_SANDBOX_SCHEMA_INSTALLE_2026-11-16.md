# SCHOOLNET Lot 5.C — Socle familial installé en sandbox

**Date :** 16 novembre 2026. **Cible exclusive :** `schoolnet-auth-sandbox`, projet `onqlsvphmrqhelislpry`.

## Statut constaté par requêtes de lecture après installation

- Tables publiques créées et contrôlées : `profiles`, `parent_links`, `public_enrollment_requests`, `public_enrollment_request_events`, `schoolnet_family_invitation_records`, `schoolnet_family_invitation_events`, `schoolnet_student_no_email_requests`.
- Enum `public.user_role` (admin, teacher, student, parent, school_admin).
- Contraintes d'identité, relations par UUID vers `auth.users`, unicité `parent_links(parent_id,student_id)`, unicité par demande et par identité Auth.
- RLS activée sur toutes ces tables, FORCE RLS sur les 3 registres d'invitation/activation. Absence de privilège SELECT pour `anon` et `authenticated` sur les registres privés.
- Fonction `public.is_admin()` réservée à la lecture des dossiers Admin ; lecture `profiles` limitée à soi, Admin ou enfant familial vérifié. Ces politiques ne constituent **pas** une reproduction complète de toutes les politiques du site principal.
- Fonctions et triggers de contrôle : `validate_parent_link_roles`, `guard_no_email_record`, `guard_no_email_parent_links`, `guard_no_email_child_ids`, `schoolnet_family_invitation_guard_update`, `schoolnet_family_invitation_audit`.
- Proposition d'auto-liaison `supabase/proposals/20261116_schoolnet_no_email_auto_family_link_REVIEW_ONLY.sql` **installée uniquement en sandbox** : fonction `schoolnet_student_private.link_verified_no_email_family_after_activation()` et trigger `schoolnet_student_no_email_autolink_family_after_activation`.
- **Zéro ligne** vérifiée dans les 6 tables métier principales de ce socle (profils, parent_links, demandes, registres apprenant, invitations, événements). Aucun compte Auth fictif créé. Aucun déploiement Edge Function.
- Les tables privées d'authentification déjà présentes dans la sandbox ont été préservées.
- Aucun changement du projet Supabase principal `anttmbhaphkhmkoqsofd`. La PR n° 12 reste séparée de `main`.

## Portée et limites

Cette installation est une **structure de test partielle**, construite pour le Lot 5.C après comparaison avec le schéma du projet principal. Les transactions d'activation et de rattachement n'ont pas encore été testées avec des identités Auth fictives.

Les modifications ont été appliquées par transactions SQL directement dans la sandbox et **ne constituent pas une migration officielle versionnée**. Avant toute reproduction ou promotion, reconstituer des migrations contrôlées dans un environnement vierge, puis comparer toutes les colonnes/contraintes/policies/privileges et exécuter une recette transactionnelle.

## Résultat du conseiller de sécurité Supabase

- Avertissements `RLS enabled no policy` : attendus sur les registres privés, interdits aux clients ; des signalements similaires existaient sur les tables internes préexistantes.
- Avertissement `authenticated_security_definer_function_executable` pour `public.is_admin()`. Cette fonction est employée volontairement dans les politiques de lecture ; **à réexaminer** avant tout réemploi hors de la sandbox. Voir https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.
- Avertissement `auth_leaked_password_protection` : protection contre les mots de passe compromis désactivée dans la sandbox ; à examiner avant les essais de connexion. Voir https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Étape suivante (non exécutée)

1. Préparer un jeu de données **strictement fictives** et des comptes Auth créés uniquement par l'API Auth sandbox.
2. Vérifier les fonctions SQL de connexion / activation, l'authentification réelle, les preuves Parent et les métadonnées Auth.
3. Exécuter le plan de recette `docs/sandbox/lot5c/SCHOOLNET_LOT5C_ISOLATION_ET_RECETTE.md` : succès, échec, double activation, mauvais Parent, rollback, enfant sans classe.
4. Ne pas activer de secrets/flags, déployer d'Edge Functions, créer de compte Auth ou ouvrir de prévisualisation connectée à cette sandbox sans approbation explicite du prochain lot.
