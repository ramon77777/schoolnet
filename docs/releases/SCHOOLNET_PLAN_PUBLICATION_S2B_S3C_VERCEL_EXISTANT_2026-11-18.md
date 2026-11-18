# SCHOOLNET — Préparation de publication sur le Vercel existant

**Date : 18 novembre 2026. État : audit GitHub/Vercel et plan de recette uniquement.**
**Aucune fusion, aucun déploiement Production, aucune migration SQL, aucune création de compte ou écriture de données autorisés par ce plan.**

## Objectif et workflow conservé

Le circuit convenu reste : **GitHub → mise à jour locale → QA & build → validation utilisateur → publication sur le Vercel `schoolnet` existant → recette en ligne → lot suivant**.

- Projet Vercel : `schoolnet` ; domaine officiel : `https://schoolnet-snowy.vercel.app`.
- Branche déclenchant actuellement Production : `main`.
- Dernière Production READY relevée : **13/11/2026**, SHA `07a2a2c76fed9e0c7c9a54c732036d2d328cba86`.
- PR **#13** (Lot 5C) : `integration/schoolnet-lot5c-local-first → main`, brouillon, fusionnable.
- PR **#14** (S2-A/B et S3-A/B/C) : `feature/schoolnet-s2a-classes-tenant-qa → integration/schoolnet-lot5c-local-first`, brouillon, fusionnable.
- SHA audit initial #13 : `374f161a64d3e62f9318850407edb45d0dde9ee8`.
- SHA audit initial #14 : `5ee320be1d1dca7851895826852852c1471a2275`. Cette nouvelle documentation entraînera un commit supplémentaire sans affecter le code de l'application.

## Comparaison GitHub vérifiée

| Comparaison | En avance | En retard | Fichiers modifiés |
|---|---:|---:|---:|
| Intégration Lot 5C par rapport à `main` | 31 commits | 0 | 33 |
| Feature scolaire par rapport à l'intégration | 101 commits | 0 | 51 |
| Feature scolaire par rapport à `main` | 132 commits | 0 | 83 |

Il n'y a pas de divergence dans la comparaison actuelle, mais cela **ne dispense pas d'une vérification au moment de la fusion**. **Fusionner directement la branche scolaire sur `main` embarquerait le Lot 5C en même temps** et irait contre la validation module par module.

**Lot 5C hors `main` :** nouvelles interfaces Parent/Administration/Apprenant sans e-mail, fonctions Edge associées et fichiers de contrôle. Les changements concernent aussi `ParentChildren.tsx`, les demandes publiques et l'approbation familiale. Ne pas supposer qu'ils ont déjà subi une recette finale sur Vercel officiel.

**Lots scolaires hors `main` :** classes officielles, affiliations enseignants/élèves, affectations, journal des mouvements, nouveaux chemins et tests. Les composants sont testés localement en lecture seule ; les écritures sont volontairement désactivées depuis localhost et Preview.

## État du backend : ne pas rejouer les migrations

Supabase principal `schoolnet_2.0` dispose déjà des migrations :
- Lot 5C `20261116162501` ;
- S2-A `20261117123824` ;
- S2-B `20261117150838` ;
- S3-A `20261117155641` ;
- S3-B `20261117162853` ;
- S3-C `20261118083254`.

Le rapport backend Lot 5C indique également que la fonction administrative a été mise à jour en v8. **Il reste une validation du flux réel Parent/Enfant**, et aucune sauvegarde PostgreSQL complète récente n'est certifiée par cette préparation.

**Ne pas exécuter `supabase db push`, ne pas relancer les scripts de migration, et ne pas confondre GitHub avec une sauvegarde des données Supabase.**

## CI et état Vercel

- GitHub signale le commit #14 en succès pour le contexte `Vercel`.
- Dernière Preview contrôlée de la feature : état `READY` (SHA `5ee320b`, sans publication Production).
- La branche d'intégration porte un contexte Vercel `failure` dont le lien pointe vers `?upgradeToPro=build-rate-limit`. **C'est un blocage de fréquence de builds, pas une preuve d'erreur de compilation.**
- Les rapports de commandes Windows déjà transmis : S3-C **15/15**, E2E readiness **16/16**, sandbox **17/17**, ESLint sans erreur bloquante, build Vite réussi.
- **Les tests complets du Lot 5C sur le commit de release ne sont pas encore confirmés ici.** Les seuls statuts Vercel ne prouvent pas que toutes les GitHub Actions ont réussi.

## Portes de validation avant chaque mise en ligne

### Gate A — Test local final et gel du commit (aucune publication)

Sur l'actuelle branche `feature/schoolnet-s2a-classes-tenant-qa`, sans changer de branche ni toucher aux fichiers non suivis :

```powershell
git status --short
git branch --show-current
git pull --ff-only origin feature/schoolnet-s2a-classes-tenant-qa
npm run qa:lot5c
npm run qa:s2b
npm run qa:s3a
npm run qa:s3b
npm run qa:s3c
npm run qa:e2e:readiness
npm run qa:sandbox:prepare
npm run lint
npm run build
```

- `qa:lot5c` exécute déjà lint, build et ses tests spécifiques. Les autres tests confirment l'ensemble des lots scolaires.
- Attendus : **zéro échec** ; les avertissements historiques (React useEffect, Browserslist, bundle) restent consignés et ne constituent pas une excuse pour une compilation ratée.
- Tester les quatre pages `/app/school/classes`, `teachers`, `students`, `assignments`, ainsi que le parcours Parent et Admin du Lot 5C, en lecture seule.
- Ne pas `git reset --hard`, supprimer les scripts personnels ou nettoyer `supabase/proposals/staged/`.

### Gate B — Publication Lot 5C seule (AUTORISATION FUTURE)

1. Vérifier le résultat `qa:lot5c`, les écrans Parent/Administration et les contrôles Edge, et confirmer l'état des protections Admin.
2. Établir une stratégie de sauvegarde **récupérable** du Supabase principal et un plan de retour arrière ; les archives de code Edge ne constituent pas une sauvegarde SQL.
3. Geler le SHA de PR #13, revérifier qu'elle cible `main` et n'inclut pas les 101 commits scolaires.
4. Demander l'accord explicite de **fusion et publication**. Un merge sur `main` peut déclencher automatiquement Production Vercel.
5. Recetter immédiatement le Lot 5C sur le domaine officiel ; toute activation familiale réelle exige un protocole et des comptes autorisés. Pas de données d'élèves réels utilisées comme fixtures.
6. En cas d'anomalie, possibilité d'un rollback **frontend** Vercel sous autorisation ; cela ne restaure **pas** PostgreSQL ni les actions métier réalisées.

### Gate C — Publication S2-A/B et S3-A/B/C (AUTORISATION FUTURE)

1. Après validation du Lot 5C, intégrer PR #14 vers la branche d'intégration prévue ; vérifier l'état exact des références après la fusion de #13.
2. Préparer ensuite le passage de l'intégration vers `main` avec **revue des fichiers et commits restants**, tests locaux sur SHA gelé et nouvelle autorisation.
3. Aucun `supabase db push` : les lots SQL sont déjà installés.
4. Déployer sur le **même projet Vercel SCHOOLNET**, ne pas créer une deuxième application.
5. Vérifier d'abord en ligne les menus, catalogues, rôles et restrictions multi-établissements.
6. Les essais réels de création de classes et d'affectations sur le **Supabase principal** exigent une sauvegarde et des identifiants/données synthétiques approuvés, plus l'autorisation séparée d'écrire. L'historique d'audit peut persister.
7. Recetter le mobile et les profils Admin/Élève/Enseignant/Parent, puis décider de la suite.

## Décisions non prises à ce stade

- Aucun changement de configuration ou de variables Vercel.
- Aucune création de projet Vercel supplémentaire ; le sandbox Auth existant reste facultatif.
- Aucune modification de la base principale.
- Aucune fusion PR #13 ou #14, aucune promotion ni rollback de Production.
- Aucune modification des garde-fous d'origine des six RPCs.

**Prochaine action locale recommandée : lancer d'abord `npm run qa:lot5c` sur la branche feature et transmettre la sortie.** Le Lot 5C est le prérequis métier de publication qui n'a pas encore une recette finale confirmée dans cet audit.
