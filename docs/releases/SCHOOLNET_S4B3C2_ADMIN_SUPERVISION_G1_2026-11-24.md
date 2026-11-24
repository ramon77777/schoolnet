# SCHOOLNET V2 — Fiche G1 : supervision des évaluations officielles

**Date :** 24 novembre 2026.  
**Module actif :** Gestion des établissements — raccordement des évaluations et résultats.  
**Identifiant proposé :** S4-B.3-C.2. Cette subdivision prolonge C.1 ; elle n'est pas une numérotation déjà définie dans le Workflow V5.  
**État :** inventaire G0 terminé ; périmètre G1 proposé à la validation. Le développement applicatif et le SQL de ce sous-lot ne sont pas encore réalisés.  
**Base :** `main`, commit `756aad33082ee8aaf15bdeaae1cdef9045c66b5c`.  
**Branche de préparation :** `feature/schoolnet-s4b3c2-admin-supervision-20261124`.

## 1. Point de reprise confirmé

Les remises B.2, corrections/publications B.3 et notifications B.3-N, tableau de bord élève B.4 et résultats Parent C.1 ont été intégrés par la [PR #30](https://github.com/ramon77777/schoolnet/pull/30). La production Vercel du projet existant `schoolnet` est identifiée par `dpl_BKmvxmRkbSU8tkZvvtLQreb5tUBR`, état READY, au commit de base ci-dessus.

Le 24 novembre, l'utilisateur a confirmé sur le domaine officiel la liste Parent et le détail d'un résultat publié, avec la note 20/20, le contexte scolaire et l'appréciation. La confirmation est consignée dans la PR #30. Les identités des comptes et les captures privées restent hors du dépôt. Cette recette réelle porte sur les deux écrans observés ; les scénarios A/B et autres configurations conservent leurs preuves techniques distinctes.

La suite fonctionnelle est étayée par le **Workflow directeur V5 du 19 novembre 2026, page 7, §05.4** : l'Admin local supervise sa seule école dans le raccordement des évaluations, corrections, notes et moyennes. Le dépôt rattache ce travail au groupe **S4-B.3-C** dans la note `SCHOOLNET_S4B3A_EVALUATIONS_OFFICIELLES_2026-11-20.md`.

Les portes **G1, page 11**, et le cycle **§13.1, page 12**, demandent une fiche métier et la liste des fichiers prévus avant le développement du nouveau sous-lot. Le présent document rend ce périmètre concret pour cette validation.

## 2. Objectif utilisateur

L'administrateur d'établissement doit pouvoir savoir quelles évaluations officielles sont suivies dans son école, pour quelles classes, matières, années et enseignants, et où en sont les copies. La première livraison est une **vue de supervision en lecture seule**, centrée sur les statuts et les volumes.

Exemples de questions auxquelles l'écran répond : quelles évaluations concernent la 6e A cette année ? Combien de copies sont remises et attendent leur correction ? Combien de copies sont corrigées mais leur résultat pas encore publié ? Quels résultats ont déjà été publiés ?

## 3. Périmètre métier proposé

| Décision | Proposition G1 |
|---|---|
| Acteur | Administrateur d'établissement, rôle `school_admin`, compte normal et appartenance locale active. |
| Établissement | Sélection parmi les seuls établissements actifs administrés par le compte connecté. |
| Ressources | Évaluations explicitement rattachées à un cours officiel dans un contexte scolaire encore actif et cohérent. |
| Filtres | Année scolaire, classe, matière, enseignant, type d'évaluation, état de l'évaluation et recherche par titre. |
| Informations par évaluation | Titre, type, état, cours, classe, matière, enseignant et année. |
| Suivi des copies | Nombres de copies en cours, remises à corriger, corrigées non publiées et publiées. |
| Indicateurs | Nombre d'évaluations et totaux de copies par statut dans le périmètre filtré. |
| Actions | Consulter, filtrer, rechercher, actualiser et revenir au pilotage pédagogique. |
| Accès global | Le rôle `admin` global ne reçoit pas de nouveau droit transversal dans ce sous-lot local. |
| Données de résultat | La projection ne contient pas de notes, moyennes, réponses, corrigés, appréciations ni identités d'élèves. |

Le rôle `school_admin` et l'`admin` global sont distincts dans le modèle réel. Le terme « Super Admin » désigne actuellement le rôle technique `admin` ; aucun rôle technique `super_admin` supplémentaire n'est créé.

### Définition des compteurs

| Libellé utilisateur | Statut de copie correspondant |
|---|---|
| En cours | `in_progress` |
| À corriger | `submitted` |
| Corrigées non publiées | `graded` |
| Publiées | `published` |

Une copie relève d'un seul statut à l'instant de la lecture. Les totaux comptent des **copies**, pas des élèves distincts : un même élève peut avoir une copie dans plusieurs évaluations. Le compteur « Non commencées », qui exige de définir une population attendue et son évolution, est reporté hors de cette première projection.

Les libellés de l'évaluation et ceux de ses copies restent séparés : une évaluation publiée ne signifie pas que tous les résultats de ses copies sont publiés.

## 4. Règle proposée pour les années et les rattachements actifs

L'année est explicite sur chaque ligne et filtrable. Une ligne n'est comptée que si les liens cours/évaluation, l'école, les appartenances et les affectations nécessaires sont toujours actifs et si école, classe, année, matière et enseignant concordent. Une révocation retire la ressource du suivi actif dès la lecture suivante ; elle ne supprime aucune donnée historique.

**Décision G1 proposée :** permettre la consultation d'une année sélectionnée lorsque son contexte scolaire répond encore à ces conditions, y compris si cette année n'est pas marquée courante. Les archives dont les rattachements sont révoqués ne sont pas reconstituées par cette vue.

L'audit du principal constate que `public.school_years` possède `id`, `name`, `starts_on`, `ends_on`, `is_current`, `created_at` et `updated_at`. Il n'existe aucun champ de fermeture ou d'archivage. `is_current=false` ne signifie donc pas « année fermée » et les dates seules ne créent pas une telle règle. Le catalogue des classes fournit les années autorisées après vérification de l'établissement ; la page n'interrogera pas directement cette table.

La fermeture d'année, le gel des notes et l'archivage sont des règles distinctes à formaliser pour la suite du raccordement S4-C. Le scénario « année fermée » demandé par le Workflow V5 reste **à définir puis à vérifier avant la clôture de S4-C**. La règle de lecture proposée ici ne valide pas ce scénario et ne crée aucun droit de modifier des données d'une année passée. La migration de passage d'année contrôlé présente dans le dépôt n'est pas installée sur le principal ; elle ne fait pas partie de cette préparation.

## 5. Écran et parcours proposés

**Entrée de navigation :** espace Administrateur d'établissement → **Évaluations officielles**, relié à **Pilotage pédagogique**.  
**Route prévue :** `/app/school/assessments`.  
**Titre d'écran :** « Suivi des évaluations officielles ».

Le haut de page présente le sélecteur d'établissement autorisé. Les filtres puis les indicateurs précèdent la liste des évaluations. Chaque ligne contient son contexte scolaire et les quatre compteurs de copies. Sur mobile, ces mêmes informations deviennent des cartes lisibles ; la page conserve les composants et la charte SCHOOLNET existants.

États à traiter : vérification de la session et des écoles, chargement, absence d'école autorisée, absence d'évaluation, absence de résultat correspondant aux filtres, accès révoqué et service indisponible. Une erreur de chargement n'est pas affichée comme un total de zéro.

Lors d'un changement de compte ou d'école, les données précédentes sont immédiatement masquées. Une réponse réseau tardive n'est acceptée que pour le compte, l'établissement et la demande encore courants. L'écran ne bascule pas vers une lecture directe des copies lorsque la synthèse sécurisée est indisponible.

## 6. Réutilisation et changement technique minimal

L'inventaire des sources et du catalogue principal a vérifié les gardes et catalogues existants en lecture seule. Les composants utiles sont :

- `schoolnet_private.assert_s3c_access(schoolId, false)` : identité, rôle local, école active et appartenance locale active ;
- les catalogues existants des écoles administrées, classes, années et cours officiels ;
- les liens privés `school_course_links` et `school_assessment_links` ;
- les évaluations et les copies existantes, avec leur unicité par évaluation/élève ;
- les protections restrictives B.0 déjà installées.

La différence à produire est une **projection agrégée dédiée**, calculée côté serveur puis consommée par l'écran local. Les RPC enseignant, élève et parent restent attachées à leur propre rôle ; leurs contrôles de contexte peuvent servir de référence sans changer d'identité pour les appeler.

Le contrat RPC détaillé, ses limites de volume, les erreurs, les permissions et le retour arrière seront préparés en G2/G3 après validation de la présente fiche. Le SQL sera d'abord proposé et vérifié sur des données fictives isolées. Son installation sur Supabase principal fera l'objet d'un GO distinct sur le script concret.

### Fichiers prévus après validation G1

| Zone | Fichiers prévus ou existants à adapter |
|---|---|
| Écran | `src/features/schools/pages/LocalSchoolAssessmentSupervision.tsx` |
| Contrat et lecture | `src/features/schools/lib/schoolAssessmentSupervisionModel.ts`, `src/features/schools/lib/schoolAssessmentSupervisionApi.ts` |
| Isolation des demandes | Hook dédié dans `src/features/schools/lib/` si nécessaire à la réutilisation des contrôles de session et de requête. |
| Navigation | `src/routes/router.tsx`, `src/layouts/DashboardLayout.tsx`, accès depuis `LocalSchoolPedagogy.tsx` |
| SQL proposé | `supabase/proposals/s4b3c2_school_assessment_supervision.sql` |
| Vérification SQL | Scripts de préflight, postflight et rollback ciblé sous `supabase/verification/` |
| Tests | Script Node sous `scripts/`, fixtures A/B sous `tests/s4b3c2-tenant-ci/`, scénarios navigateur sous `tests/s4b3c2-ui/` |
| Intégration | Commande QA dans `package.json` et workflow CI isolé dédié ; dépendances existantes réutilisées. |
| Livraison | Note de recette et état G0–G8 dans `docs/releases/` |

La préparation actuelle contient seulement cette fiche et la désactivation du déploiement automatique pour le nom exact de la branche proposée dans `vercel.json`. Le projet Vercel existant et la publication de `main` conservent leur configuration.

## 7. Critères d'acceptation du développement

1. Un administrateur A reçoit uniquement les évaluations et compteurs de son établissement autorisé.
2. L'accès à B par identifiant forgé, l'absence de session et les rôles hors périmètre sont refusés côté serveur, avec des fixtures fictives isolées.
3. La révocation d'une appartenance, d'une affectation ou d'un rattachement retire les lignes concernées du suivi actif. Une école inactive n'est plus accessible.
4. Une discordance d'année, de classe, de matière, d'enseignant ou de propriétaire exclut la ligne au lieu de mélanger les contextes.
5. Les quatre compteurs correspondent aux copies admissibles, sans doublons ; une copie corrigée non publiée reste distincte d'un résultat publié.
6. Le contrat retourné ne contient aucune note, réponse, appréciation ou identité d'élève, y compris dans un groupe de faible effectif.
7. Les filtres et indicateurs portent sur le même périmètre ; une limitation de volume est explicite et ne produit pas de totaux tronqués présentés comme exhaustifs.
8. Les réponses tardives ne réaffichent pas les données d'un ancien compte ou établissement.
9. La page est lisible sur ordinateur et mobile et traite les états vides, erreurs et chargements.
10. Les parcours existants, dont les cours libres, restent couverts par les vérifications ciblées nécessaires aux fichiers réellement modifiés.

## 8. Limites de cette première supervision

Les corrections et publications restent réalisées par l'enseignant dans son parcours existant. La modification administrative des notes, les moyennes trimestrielles, les bulletins, la fermeture des périodes/années, les archives historiques, les fichiers de copies, les exports nominatifs et les notifications supplémentaires relèvent de décisions ultérieures.

La finalisation de cette vue ne clôturera pas automatiquement tout S4-C ni le module Gestion des établissements : les autres raccordements du Workflow V5 conserveront leur propre suivi.

## 9. Validation attendue et prochaine action

La décision demandée porte sur **le développement de cette supervision locale en lecture seule, avec les filtres et compteurs définis ci-dessus, ainsi que la règle de lecture des années encore rattachées à un contexte actif**.

Après validation G1 : implémenter sur cette branche, préparer le SQL et son rollback, vérifier en isolation, ouvrir une PR brouillon et fournir une recette Windows sur un commit identifié. Les GO d'installation SQL puis de fusion/publication porteront sur ces livrables concrets après leurs contrôles.

**Prochaine action unique :** validation du périmètre G1 par l'utilisateur.
