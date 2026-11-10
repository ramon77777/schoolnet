# SCHOOLNET 2.0 — Multi-établissements et invitations manuelles

**Mise à jour :** 10 novembre 2026  
**Branche :** `feature/schoolnet-multi-etablissements`  
**PR :** [#6 (brouillon)](https://github.com/ramon77777/schoolnet/pull/6), base `feature/schoolnet-notifications` (PR #5). **Ne pas fusionner sans recette et approbation.**

## Décision métier

SCHOOLNET sert (1) les **apprenants libres**, (2) les **établissements scolaires** et (3) les **cours à domicile**. Un même apprenant possède un seul compte, éventuellement rattaché à plusieurs contextes d'apprentissage. Les classes officielles d'un établissement ne sont pas les groupes pédagogiques des apprenants libres. Les liens parent-enfant restent soumis à vérification d'habilitation.

Le `profiles.role='admin'` historique reste réservé au **Super Administrateur SCHOOLNET**. Le nouveau `profiles.role='school_admin'` identifie un **administrateur local**, dont les droits dépendent d'une appartenance active à un établissement actif. Il ne peut pas utiliser les fonctionnalités administratives globales historiques.

## État réel Supabase — activé avec autorisation

Projet `schoolnet_2.0` : `anttmbhaphkhmkoqsofd`.

| Version Supabase réelle | Migration sur GitHub | État |
|---|---|---|
| `20261110111827` | `supabase/migrations/20261110111827_schoolnet_schools_security_foundation.sql` | Appliquée |
| `20261110112106` | `supabase/migrations/20261110112106_school_admin_profile_role_check.sql` | Appliquée — correction nécessaire du CHECK `profiles.role` |

Supabase a attribué automatiquement ces versions lors des deux applications ciblées. Les fichiers GitHub ont été renommés **sans modifier leur contenu SQL** pour conserver la correspondance exacte avec `supabase_migrations.schema_migrations`. **32 migrations** sont désormais enregistrées.

La première migration crée :
- le rôle `school_admin`, distinct de `admin` ;
- `schoolnet_schools` (établissements) ;
- `schoolnet_school_memberships` (appartenances et droits locaux) ;
- `schoolnet_school_audit` (journal des opérations sensibles) ;
- `schoolnet_school_admin_invitations` (adresse, dates, compteur, déclaration d'envoi, mais **aucun secret**) ;
- RPC `schoolnet_admin_create_school`, `schoolnet_admin_assign_school_admin`, `schoolnet_admin_lookup_auth_email`, `schoolnet_admin_record_school_invitation`, `schoolnet_admin_mark_school_invitation_sent`.

La deuxième migration corrige **uniquement** la contrainte historique `profiles_role_check` qui interdisait encore le nouveau rôle malgré son ajout dans l'enum. Elle n'affecte pas les profils existants ni leurs permissions.

Toutes les nouvelles tables ont RLS activée, des politiques de lecture appropriées et aucune écriture directe accordée à `anon` ou `authenticated`. Les écritures passent par des RPC avec vérification `auth.uid()` et `public.is_admin()` pour les opérations centrales.

## Fonction Edge — activée

`supabase/functions/schoolnet-admin-invitation/index.ts` est déployée dans le projet sous le nom `schoolnet-admin-invitation`, **version 1 / ACTIVE**. Son fichier déployé a été comparé au contenu de la branche et correspond exactement.

- `verify_jwt=false` au niveau du gateway **par choix de configuration**, mais la fonction exige un Bearer JWT valide via `auth.getUser`, vérifie le rôle `admin` dans `profiles`, l'origine navigateur autorisée et la validité de l'école ; elle refuse les requêtes anonymes.
- Les secrets `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_ANON_KEY` ne sont lus que côté Edge et ne doivent jamais figurer dans le frontend.
- Un e-mail déjà attribué à un compte existant est refusé pour une **nouvelle invitation**. Aucune promotion automatique d'un autre rôle.
- `generateLink(type:'invite')` prépare un compte et un lien sans envoi SMTP. Le compte est associé à l'école par RPC, puis l'URL secrète est renvoyée une fois en réponse au Super Admin, sans archivage.
- Un administrateur local déjà rattaché peut recevoir un lien de renouvellement `recovery` préparé par le Super Admin (délai minimal d'une minute).
- Si l'étape SQL échoue après création Auth, la fonction tente de supprimer seulement le compte provisoire ; en cas d'échec de compensation, elle demande un contrôle manuel.

**Attention :** les créations Supabase Auth et les transactions SQL ne sont pas atomiques entre elles. Les tests d'invitations concurrentes, de liens expirés et de reprise après panne restent nécessaires avant une mise à disposition générale.

### Configuration à contrôler avant la recette réelle

- Secret Edge `SCHOOLNET_ALLOWED_ORIGINS` : liste des domaines autorisés, avec protocoles HTTPS, séparés par des virgules. Inclure l'adresse Vercel **Preview utilisée pour les essais**, en conservant l'adresse principale et les autres origines autorisées.
- Optionnel : `SCHOOLNET_INVITE_REDIRECT_URL`, par défaut `https://schoolnet-snowy.vercel.app/auth/reset-password?mode=school-invite`.
- Dans **Supabase → Authentication → URL Configuration**, vérifier que l'URL d'activation/redirection est bien autorisée. L'URL du site principal peut être conservée.
- Le navigateur doit utiliser la **PR #6 Preview**, pas `schoolnet-snowy.vercel.app`, tant que `main` n'a pas été fusionnée.

## Interface déjà développée (branche uniquement)

| Route | Qui | Fonction |
|---|---|---|
| `/app/admin/schools` | Super Admin `admin` | Créer et répertorier les établissements |
| `/app/admin/school-invitations` | Super Admin `admin` | Préparer l'invitation, copier le message, ouvrir le client e-mail, déclarer l'envoi |
| `/app/school/dashboard` | Admin local `school_admin` | Afficher **uniquement** les écoles autorisées ; pas de gestion scolaire globale |

Le lien d'activation n'est conservé que dans l'état temporaire de l'interface. L'envoi est **manuel** et une déclaration d'envoi ne prouve ni l'expédition SMTP ni la réception du message.

## Tests techniques réalisés

**Avant la première migration :** DDL, droits RPC, lecture RLS, création fictive de deux écoles, refus des doublons, refus de promotion abusive d'un enseignant, tentatives d'accès par un apprenant : **réussis dans BEGIN/ROLLBACK**.

**Après activation :** l'essai a d'abord détecté le CHECK historique incompatible ; il a été corrigé par la migration ciblée `20261110112106`.

**Après correction :** création de deux écoles fictives par Super Admin, affectation d'un profil temporairement converti au rôle local, préparation d'invitation, renouvellement, déclaration d'envoi idempotente, visibilité uniquement de l'école A pour son admin, interdiction d'accès à l'école B, invitation invisible à l'admin local, impossibilité de créer une école ou interroger Auth en tant qu'admin local ou apprenant : **réussis**, transaction annulée (`ROLLBACK`). Aucun compte ni établissement fictif n'a été conservé.

**Compilation frontend :** ESLint et build TypeScript/Vite réussis sur PR #6 avant l'activation SQL ; suivre à nouveau les checks après renommage des migrations. L'appel HTTP direct à la fonction n'a pas pu être vérifié depuis l'environnement d'exécution (DNS sortant indisponible). Le vrai parcours **invitation → e-mail envoyé manuellement → activation du compte → connexion locale** doit donc être testé depuis le navigateur.

## Recette navigateur demandée ensuite

1. Ouvrir la Preview Vercel liée à la PR #6 avec le compte Super Admin et vérifier `/app/admin/schools`.
2. Créer un établissement de **test** avec un code non réel.
3. Dans `/app/admin/school-invitations`, créer un responsable avec une **adresse e-mail de test à laquelle vous avez accès**, différente de tous les comptes SCHOOLNET existants.
4. Copier l'invitation ou ouvrir sa messagerie, vérifier le destinataire et **envoyer soi-même le message**.
5. Ouvrir le lien depuis une session privée, définir le mot de passe, se connecter au tableau de bord local.
6. Vérifier qu'un administrateur local ne peut pas ouvrir `/app/admin/users`, qu'il ne voit aucune école non autorisée et qu'il n'accède à aucun élève/enseignant d'une autre école.
7. Régénérer un lien si nécessaire, tester refus des doublons, expiration et déclaration d'envoi.

Ne jamais utiliser de données sensibles réelles dans ces premiers essais.

## Points restant à traiter

- Le module scolaire historique (classes, notes, bulletins, cours, présences, documents, messagerie, finance) **n'est pas encore isolé par établissement** ; les administrateurs locaux ne reçoivent aucun droit sur ces modules.
- Les flux apprenants libres et cours à domicile seront adaptés ensuite.
- L'intégration de l'e-mail automatique restera facultative ; aucune exigence d'achat d'un domaine pour utiliser l'envoi manuel.
- Le bilan Supabase Security Advisor comporte des avertissements **préexistants** hors de ce lot, notamment des RPC historiques à réviser ; les nouvelles RPC du module ne donnent pas le droit d'exécution à `anon`. Audit de durcissement séparé à programmer.

## Restrictions maintenues

**Ne pas lancer `supabase db push --remote` global** : `20261110090000_school_year_rollover_controlled.sql` (Lot 5.D) et `20261109140104_harden_assessment_legacy_rpcs.sql` restent en attente. Ne pas modifier `main` ni déployer Vercel Production sans autorisation explicite. **PR #6 reste en brouillon.**
