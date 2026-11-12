> **Suite du 12/11/2026 — Phase B.2 effectuée avec autorisation distincte.** Sandbox `onqlsvphmrqhelislpry` : schéma privé `schoolnet_auth_sandbox`, deux tables de simulation, RLS forcée, droits publics révoqués, historique append-only ; migration unique `20261112085040_schoolnet_auth_sandbox_b2_private_evidence`. **9/9 tests de contraintes dans une transaction ROLLBACK réussis.** Sandbox après test : **0 compte Auth, 0 cas synthétique, 0 événement**, schéma présent ; projet principal intact. Rapport [B.2 — schéma, sécurité et recette](./lot-5-c-b2-b2-sandbox-sql-securite-2026-11-12.md). Les opérations B.3 d'activation réelle et de création de comptes restent non autorisées.

# SCHOOLNET — Lot 5.C-B.2 / Phase B.1
## Création contrôlée de l'environnement Supabase Auth isolé — 12 novembre 2026

**ÉTAT : B.1 TERMINÉE — SANDBOX CRÉÉE, ACTIVE ET VÉRIFIÉE EN LECTURE SEULE.**

### 1. Périmètre et autorisation

L'utilisateur a donné explicitement son accord, après communication du tarif gratuit, pour créer **un second projet Supabase Free** sans option payante, dans l'organisation de SCHOOLNET. L'autorisation B.1 se limite à la **création du projet et aux contrôles non mutateurs d'identité et d'isolation**. Elle ne couvre aucune table métier, migration, fonction Edge, invitation, compte Auth, e-mail, création de lien, modification de mot de passe, fusion GitHub ou déploiement Vercel.

Le protocole approuvé est [B.0 — préparation du sandbox Auth](./lot-5-c-b2-b0-sandbox-auth-plan-2026-11-12.md).

### 2. Devis vérifié et création

| Paramètre | Valeur constatée |
| --- | --- |
| Organisation Supabase | `schoolnet 2.0` (`gwnzwpkeerivryptjepp`) |
| Offre | Free (`tier_free`) |
| Devis officiel immédiatement avant création | **0 USD / mois** pour un nouveau projet Free (`get_cost(type=project)`) |
| Projets visibles avant création | **1** : `schoolnet_2.0` |
| Nom du nouveau projet | `schoolnet-auth-sandbox` |
| Référence du nouveau projet | `onqlsvphmrqhelislpry` |
| Région | `eu-west-1` (identique au projet principal) |
| Date de création retournée par Supabase | `2026-11-12T03:25:16.262106Z` |
| État après création | `ACTIVE_HEALTHY` |
| Projets visibles après création | **2**, tous deux dans la même organisation, mais **projets distincts** |
| Options payantes | **Aucune demandée** |
| URL de consultation | https://supabase.com/dashboard/project/onqlsvphmrqhelislpry |

La création a nécessité une confirmation de coût technique du fournisseur, fournie pour un devis de **0 USD par mois**, conformément à l'autorisation de l'utilisateur. Aucune confirmation de coût non nul n'a été fournie.

L'offre Free autorise deux projets actifs selon les quotas de Supabase ; cette création occupe désormais le second emplacement Free visible au compte. L'absence de frais supplémentaires repose sur le maintien du plan et l'absence d'add-ons payants.

### 3. Vérification d'isolation immédiatement après création

| Contrôle en lecture seule | Projet principal `anttmbhaphkhmkoqsofd` | Sandbox `onqlsvphmrqhelislpry` |
| --- | --- | --- |
| Projet Supabase | `schoolnet_2.0` | `schoolnet-auth-sandbox` |
| État | `ACTIVE_HEALTHY` | `ACTIVE_HEALTHY` |
| `auth.users` | **10** | **0** |
| Tables métier `public` | Existantes | **0 table de base** |
| Registre d'invitations familiales | **0 ligne** | Table **absente** |
| Journal d'événements des invitations | **0 ligne** | Table **absente** |
| Historique de migrations SCHOOLNET | **35** migrations | Table `supabase_migrations.schema_migrations` **absente** (projet vierge) |
| Fonctions Edge déployées | **7** ; `schoolnet-family-invitation` v2 | **0** |
| `schoolnet-family-invitation` principale | `ACTIVE`, `verify_jwt=true` | Non déployée |
| Demande de recette `DEM-3CF7B169BAD9` | Toujours `new` | Aucune donnée importée |

Un premier contrôle SQL de la sandbox supposant l'existence de `supabase_migrations.schema_migrations` a logiquement échoué (`42P01`, table inexistante). Une **seconde lecture sans écriture**, utilisant `to_regclass`, a confirmé **0 utilisateur Auth**, **0 table publique**, **absence de table de migration et de tables d'invitation**. Cet échec initial **n'est pas une anomalie du projet neuf**. Aucun SQL mutateur n'a été exécuté.

### 4. Garde-fous à conserver

- **Toujours comparer explicitement les références projet :** projet principal `anttmbhaphkhmkoqsofd`, projet de test `onqlsvphmrqhelislpry`. Interrompre toute action mutatrice visant la référence du projet principal.
- **Ne pas recopier** utilisateurs, données scolaires, familles, fichiers Storage, secrets, clés serveur, variables d'environnement ou identifiants réels depuis SCHOOLNET principal.
- La sandbox doit rester isolée des variables du frontend principal et des secrets Vercel/GitHub. Ne pas modifier `.env.local` pour pointer le site principal sur la sandbox.
- Ne pas utiliser d'add-on payant, branche Supabase facturée ni changement d'abonnement.
- Les futurs essais e-mails hébergés nécessitent des boîtes préautorisées et réellement contrôlées, ou une configuration SMTP distincte et approuvée ; Mailpit local reste recommandé pour les adresses fictives.
- La confirmation d'activation reste non autorisée : l'implémentation A.2.2 actuelle dépend de signaux de preuve **non raccordés**. Le Password Verification Hook ne doit pas être présumé disponible sur Supabase Free.
- Avant les opérations futures avec la CLI, vérifier la version et la cible : la CLI v3 privilégie le local et demande un `--remote` explicite pour des opérations sur un projet hébergé.

### 5. Suite proposée — B.2 (NON AUTORISÉE PAR B.1)

Préparer puis faire valider un **schéma de test minimal dans la sandbox**, et uniquement celle-ci : comptes de démonstration, événements Auth de provenance, journaux privés et protocole de simulation contrôlée. Ne pas déployer l'ensemble des 35 migrations métier sans audit.

**Jalons nécessitant une autorisation distincte :**

1. **B.2 :** création de tables et politiques RLS minimales, SQL de contrôle et tests de rollback dans `onqlsvphmrqhelislpry` seulement ;
2. **B.3 :** création d'utilisateurs fictifs, génération d'invitations et essais Auth réels dans la sandbox seulement ;
3. **B.4 :** intégration sécurisée au produit SCHOOLNET, recette locale, puis GO de déploiement Supabase principal et Vercel séparés.

Aucune des opérations B.2, B.3 ou B.4 n'a été effectuée durant B.1.

### 6. Suivi du dépôt et du projet principal

Dépôt : `ramon77777/schoolnet` ; branche `feature/schoolnet-multi-etablissements` ; PR #6 en brouillon, non fusionnée. L'étape B.1 n'a modifié que les documents de suivi GitHub.

**Conclusion : sandbox Free indépendante créée et inspectée ; projet principal intact. La première écriture SQL/ Auth dans la sandbox sera soumise à une nouvelle autorisation.**
