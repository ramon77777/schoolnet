# SCHOOLNET V2 — S4-D.2c.1 — passerelle de prévisualisation RPC fermée

**Date :** 26 novembre 2026 · **Branche isolée** `feature/schoolnet-s4d2c1-provisional-export-api-20261126` · **Base :** S4-D.2b / PR #51.

## État d'entrée confirmé

L'utilisateur a validé S4-D.2b sur Windows, HEAD `c1bbd97`, QA 7/7, compilation (934 modules) réussie et répertoire Git propre. GitHub Actions #45831704104 : 44/44 tests de contrat/régression, 18/18 tests HTTP GoTrue + PostgREST sur Supabase jetable, trois workflows réussis. Les PR #40–#51 ne sont pas fusionnées dans `main` ; aucune proposition SQL n'est devenue migration certifiée sur Supabase principal.

## Portée de cette première tranche S4-D.2c

Cette livraison **prépare** le raccordement de la projection SQL S4-D.2b à l'interface SCHOOLNET, sans activer de consultation ou téléchargement réel.

- Nouveau module pur `src/features/official-documents/lib/schoolOfficialExportPreviewBridge.ts` : fabrication des seuls 7 paramètres RPC admis pour `schoolnet_official_export_preview`, sans identité d'utilisateur, note, copie ou année reçue comme paramètre direct d'autorisation.
- Vérification préalable du rôle réellement connecté, de l'identifiant d'utilisateur connu via Auth, du format PDF/XLSX, du contexte école/année/classe/période (UUID), de l'état provisoire, des types de relevés que la RPC S4-D.2b accepte actuellement. **Aucune délégation de moyenne générale enseignant ni export matière administrateur n'est inventé.**
- Vérification **après** réponse via `isOfficialExportProjection` (S4-D.2b) et comparaison stricte de l'année scolaire de la projection à l'année demandée. Le zéro réel est autorisé, la valeur manquante reste `null`, aucun champ supplémentaire ni périmètre A/B falsifié ne passe.
- Conversion en erreur d'activation uniquement des codes PostgREST `PGRST202` / PostgreSQL `42883`. Aucun échec d'autorisation n'est requalifié en absence de fonctionnalité.
- `SCHOOLNET_REAL_EXPORTS_RELEASED = false` : **barrière permanente et testée** dans `reviewOfficialExportWithRpc`. Aucun transport réseau n'est appelé même si une fonction lui est injectée. L'interface `SchoolOfficialDocumentsHub.tsx` n'importe **pas** ce module ; ses boutons de téléchargements scolaires réels restent `disabled`.
- Les générations PDF/XLSX fictives validées en S4-D.2a restent disponibles uniquement dans leur environnement de recette Vite DEV. Aucun appel à une API de notes réelles ou de bulletins V1 n'est ajouté.

## Non couvert / porte de sécurité

Cette tranche n'installe **aucune migration Supabase** et ne peut pas produire de fichier scolaire réel. Les fonctions SQL S4-D.2b sont encore des **propositions** : **ne pas les appliquer** à Supabase principal sans une autorisation distincte et une réconciliation certifiée de l'historique des migrations. L'autorisation effective appartient toujours au serveur, pas à un validateur navigateur.

Étape après recette Windows : S4-D.2c.2 — préparation de renderers PDF/XLSX scolaires **non fictifs**, testés sur projections synthétiques dans un environnement de développement, avec contrôle des titres et des données minimales ; puis connexion au RPC en environnement expressément approuvé. Les relevés `published`, annuels, multi-matières et bulletins officiels restent dans des phases dédiées avec des règles de snapshot immuable.

## Tests de recette

- `npm run qa:s4d2c1` : contrôle des demandes RPC, limites school/year/class/period, rôle/identité et session de démonstration, absence de dérive des notes, blocage réseau en mode non publié, absence de branche Vercel.
- Régressions `qa:s4d2b` + `qa:s4d2a` + `qa:s4d1`, lint et build TypeScript/Vite.
- Tous les tests sont purement locaux : **aucun Docker, aucune connexion Supabase et aucune modification PostgreSQL** pour la recette Windows.

**Workflow inchangé :** développement sur branche isolée → GitHub Actions → branche locale Windows → tests → validation utilisateur → seulement ensuite préparation de la suite, sans fusion de `main` ni déploiement non autorisés.
