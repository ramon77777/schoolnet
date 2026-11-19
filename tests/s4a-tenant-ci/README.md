# SCHOOLNET S4-A — Recette d'isolation A/B

Ce lot teste **les véritables RPC SQL de S3-C** à partir du fichier versionné
`supabase/proposals/s3c_school_class_assignments.sql`, sur une instance
**Supabase locale éphémère** créée sur le runner GitHub Actions.

## Scénarios

- L'administrateur A lit uniquement le catalogue A et ne peut pas lire B.
- L'administrateur B lit uniquement B et ne peut pas lire A.
- Les classes, les élèves et les enseignants des deux écoles ne se mélangent pas.
- Un rôle élève ne peut pas utiliser les RPC administratives.
- Les tables d'affectations restent inaccessibles directement.
- Une tentative d'écriture depuis une origine Preview est refusée.
- La révocation d'un administrateur et la suspension d'une école retirent l'accès.
- Un appel anonyme de la RPC est refusé.

## Portée / limite

Le dépôt ne contient pas de baseline complète de l'ancien SCHOOLNET V1.
La fixture `fixtures/legacy-minimal.sql` recrée donc **uniquement les
préconditions nécessaires à la migration S3-C**. Les trois fonctions S2/S3
dont seul le nom est exigé par le précontrôle sont des stubs non utilisés.
Les fonctions **S3-C** proviennent, sans changement, de la proposition
SQL existante du dépôt. Ce test est une preuve d'intégration SQL isolée,
pas une recette E2E des vrais comptes Auth, de la navigation et du
stockage. Ces cas devront être homologués séparément si requis.

Les données de test sont entièrement inventées : comptes, écoles,
affectations et noms n'appartiennent à aucun utilisateur réel.

## Sécurité

Le workflow GitHub n'utilise aucun secret Supabase ou Vercel, aucun accès
au projet hébergé et aucune commande `supabase db push`, `supabase link`,
`migration up --remote` ni publication. Les commandes SQL ciblent
exclusivement `127.0.0.1:54322` sur le runner temporaire.
Les assertions s'exécutent dans une transaction terminée par
`ROLLBACK`, puis les volumes locaux sont supprimés.

**Attention :** un push sur la branche peut produire automatiquement une
Preview Vercel, conformément à l'intégration Git du projet existant.
Il n'y a aucune fusion `main` et aucun déploiement en production.

Workflow : `.github/workflows/schoolnet-s4a-tenant-ci.yml`.


## Evolution V5 - minimisation des donnees (S4-A)

La nouvelle proposition `supabase/proposals/s4a_school_pedagogy_overview.sql`
ajoute `public.schoolnet_school_pedagogy_overview(uuid)` sans modifier les RPC
existantes de S3-C. Son helper prive rappelle `assert_s3c_access`.

La reponse contient **seulement** les compteurs globaux, les effectifs par
classe, les libelles non nominatifs des classes, des annees et des matieres.
Ni noms ni identifiants d'eleves/enseignants, ni historique d'evenements.

Cette recette SQL A/B exerce desormais les **deux** RPC en Supabase local
jetable : equivalence des effectifs attendus, absence de PII, refus A/B,
refus aux roles inadaptes, aux administrateurs revoques et aux anonymes.
Les anciens tests sont conserves.

**Aucune installation sur le projet principal** : la proposition S4-A sera
soumise a approbation explicite avant toute publication. Tant que la nouvelle
RPC n'est pas installee, l'interface candidate S4-A affiche un message
d'indisponibilite, sans repli vers la RPC nominative S3-C.
