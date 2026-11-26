# SCHOOLNET V2 — S4-C.3-C.3.5 : environnement Supabase réellement isolé
**26 novembre 2026 — Préparation et preuve d'infrastructure C.3-C.3.5.1, pas une installation SQL métier.**

## État réel vérifié (lecture des métadonnées uniquement)
- Organisation SCHOOLNET `schoolnet 2.0` : **Free** (`tier_free`).
- Base principale : `schoolnet_2.0`, projet `anttmbhaphkhmkoqsofd`, statut `ACTIVE_HEALTHY`, PostgreSQL 17.
- Projet secondaire EXISTANT : `schoolnet-auth-sandbox`, ref `onqlsvphmrqhelislpry`, statut **INACTIVE** (pausé).
- Les deux projets ont des références et bases différentes ; le plan Free offre deux projets actifs sans frais de base supplémentaires dans les limites du quota.
- La branche Supabase payante n'est pas une solution appropriée au budget 0 ; aucune branche payante ou nouveau projet n'est créé ici.

## Décision C.3-C.3.5.1 — Ne PAS réutiliser aveuglément l'ancien sandbox Auth
Les documents des lots précédents montrent que le sandbox `schoolnet-auth-sandbox` **n'est plus vierge** :
- Deux utilisateurs Auth fictifs Parent/Élève y ont déjà été créés pour les tests du lot 5.C.
- Des migrations privées d'observation et un Custom Access Token Hook actif y ont été préparés/activés.
- L'Edge Function expérimentale du lot 5.C a été neutralisée après la recette.
**Ne jamais purger, réinitialiser ou remplacer ce projet sans procédure/GO spécifique.** Même en sandbox, ces ressources constituent un travail déjà réalisé.

### Options comparées
| Option | Coût/infra | Conclusion |
|---|---|---|
| PostgreSQL 17 jetable existant | Déjà opérationnel GitHub Actions | Nécessaire, mais ne teste pas GoTrue/PostgREST/JWT HTTP |
| Supabase complet jetable sur GitHub Actions | Réutilise le runner et Docker distant, **aucune nouvelle facture Supabase** | **Choisi en premier** pour Auth, API, RLS sans toucher à l'ancien sandbox |
| `schoolnet-auth-sandbox` hébergé | 2e emplacement Free, déjà existant ; restauration possible | **Réserve pour recette hébergée**, après inventaire et GO explicite |
| Supabase CLI/Docker sur PC Windows | Nécessite un moteur Docker non installé lors du dernier test | Non indispensable, ne pas l'imposer à l'utilisateur |
| Supabase Branching de production | Non inclus dans le plan Free / compute facturé | **Écarté** |

## Réalisation C.3-C.3.5.1 — preuve d'environnement **sans le moteur officiel**
Un nouveau dossier `tests/s4c3c35-supabase-ci` et une CI GitHub Actions de branche démarrent un **Supabase complet minimal** avec :
- Auth GoTrue réel, passerelle Kong, API REST PostgREST et PostgreSQL 17 ;
- génération de **deux sessions via HTTP Auth réel**, sans clé d'un Supabase hébergé ;
- une **table purement factice** avec RLS et `auth.uid()` ;
- tests GET anonyme refusé, propriétaire autorisé, établissement/utilisateur B refusé, POST/UPDATE utilisateur interdit ;
- suppression systématique du volume CI et des comptes factices à la fin.

La CI ne contient **ni `supabase link`, ni `db push`, ni mot de passe externe, ni clé de production**. Elle refuse tout `API_URL` autre que `http://127.0.0.1:55421`.
Cette première preuve valide **l'infrastructure** HTTP/JWT/RLS, **pas encore les fonctions métier des moyennes**.

## Suite à engager après cette preuve
C.3-C.3.5.2 : étendre la CI pour charger le schéma scolaire pertinent avec **la vraie fonction `auth.uid()` fournie par Supabase**, les fonctions C.3-C.3.3/C.3-C.3.4, deux écoles fictives, vrais JWT admin/enseignant/parent/élève et des appels HTTP RPC PostgREST. Vérifier IDOR, retrait d'affectation, soumissions non publiées, moyennes /20, catalogue en brouillon, et RLS sans attribuer de privilèges directs.

C.3-C.3.5.3 : contrôle de charge, sauvegarde/restauration et test d'intégration **hébergé** sur le projet `schoolnet-auth-sandbox` seulement après inventaire, protection des preuves Auth existantes et **nouveau GO explicite**. Aucune installation sur la base principale ni fusion sur `main` avant GO dédié. Vercel Free ne doit pas lancer de Preview.

## Limites et conditions
- GitHub Actions est un environnement temporaire, avec des quotas de minutes et ressources qui dépendent du plan GitHub. Réutiliser la CI existante et ne pas multiplier les jobs inutilement.
- La documentation Supabase évolue rapidement ; le workflow conserve volontairement la version `supabase/setup-cli@v1` épinglée à `2.122.1`, déjà utilisée par l'historique du dépôt, au lieu de démarrer automatiquement un outil nouveau non audité.
- Aucun traitement de données réelles d'enfants : tous les utilisateurs ont un email `@example.test` et des mots de passe jetables. Aucun email externe envoyé.
- Le sandbox hébergé est conservé en pause ; aucune reprise, migration ni hook n'est modifié ici.
