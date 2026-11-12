# SCHOOLNET 2.0 — Lot S2 : Classes par établissement
## Architecture, sécurité et recette SQL préalable à l'activation

**Date :** 10 novembre 2026  
**Branche :** \`feature/schoolnet-multi-etablissements\`, PR [#6](https://github.com/ramon77777/schoolnet/pull/6), **brouillon**  
**Projet Supabase :** \`schoolnet_2.0\` (\`anttmbhaphkhmkoqsofd\`)  
**Statut :** **Conception testée, NON activée en base.** Aucune migration S2 appliquée, aucun changement sur \`main\` ou Vercel Production.

## 1. Problème métier et choix d'architecture

SCHOOLNET sert :
1. **Les écoles partenaires** : classes officielles et dossiers scolaires cloisonnés par école.
2. **Les apprenants libres** : classes/groupes pédagogiques hors école partenaire.
3. **Les cours à domicile** : prestations pédagogiques, à gérer ultérieurement comme contexte de cours sans transformer automatiquement ces séances en inscriptions scolaires.

Un seul compte Supabase Auth peut être associé à plusieurs contextes d'apprentissage. Les habilitations sont contrôlées depuis la base, **pas depuis la présence/absence de menus**.

L'administrateur local \`school_admin\` doit voir les classes de **son établissement actif** uniquement. Le Super Admin \`admin\` conserve les accès centraux historiques.

## 2. Audit des tables et des dépendances réelles

| Élément | État au démarrage |
|---|---|
| Migrations Supabase | **34** |
| Établissements actifs | **2** |
| Administrateurs locaux affectés | **1** |
| Classes historiques | **2**, sans \`school_id\` |
| Classes historiques existantes | \`6e A\` (2025–2026), \`6e B\` (2026–2027) |
| Cours | **4**, \`courses.class_id\` facultatif |
| \`class_students\` | **2** associations |
| \`class_teachers\` | **2** associations |
| Colonnes \`classes\` | \`id,level_id,name,school_year,created_at,updated_at,school_year_id\` |
| Contraintes uniques globales | \`classes_unique_per_year\` et \`idx_classes_unique_name_school_year_id\` |
| Politiques RLS sur \`classes\` | **3** avant le Lot S2 : 1 politique d'écriture Super Admin et 2 de lecture |

La présence des deux contraintes uniques signifie que deux écoles ne peuvent pas créer \`6e A\` pour une même année. De plus, le trigger \`ensure_student_single_class_per_school_year\` vérifie l'unicité de l'affectation **globalement**, sans école : sa refonte viendra dans le Lot S3, avant toute affectation d'élèves à des classes d'écoles partenaires.

La page existante \`src/features/admin/pages/AdminClasses.tsx\` sélectionne les classes et les profils sans contexte d'établissement ; **elle ne doit pas être ouverte telle quelle aux administrateurs locaux**. Elle devra distinguer les classes historiques et les classes officielles d'école avant l'activation de l'interface de gestion.

## 3. Proposition technique S2-A — Schéma des classes

**SQL proposé :** \`supabase/proposals/s2_school_classes_tenant_foundation.sql\` — **ce fichier n'est pas dans \`supabase/migrations\`**.

Ajouter à \`public.classes\` :
- \`learning_context text NOT NULL DEFAULT 'legacy_unclassified'\` ;
- \`school_id uuid NULL REFERENCES schoolnet_schools(id) ON DELETE RESTRICT\`.

Valeurs de contexte préparées :
- \`legacy_unclassified\` : toutes les classes existantes, avec \`school_id=NULL\`, **sans migration ni classement artificiel de leurs données** ;
- \`school\` : classe officielle **obligatoirement** liée à une école et à un \`school_year_id\` ;
- \`free_group\` : contexte réservé aux futurs groupes pédagogiques indépendants ; **aucun nouveau flux d'écriture ni de lecture n'est ouvert en phase S2-A**.

Le dispositif "cours à domicile" sera modélisé via un contexte de **cours ou de prestation pédagogique**, sans nécessairement créer de classe officielle. Ne pas déduire le contexte du nom de la classe ou du cours.

Les deux anciennes contraintes uniques globales sont remplacées par :
- deux index **partiels legacy**, qui reproduisent les deux protections précédentes pour \`learning_context='legacy_unclassified'\` ;
- un index **partiel par école**, unique sur \`(school_id, lower(name), school_year_id)\` lorsque \`learning_context='school'\` ;
- un index de lecture ciblée sur \`(school_id,school_year_id,level_id)\`.

Il devient possible de créer \`6e A\` à l'école A et \`6e A\` à l'école B, la même année scolaire, **sans autoriser un doublon au sein d'une même école**.

## 4. RLS et autorisations de S2-A

Le modèle garde les politiques existantes pour les **lignes legacy** des quatre rôles historiques. En revanche, les nouvelles classes scolaires sont verrouillées par défaut.

| Rôle | Classes historiques | Classe école A | Classe école B | Écrire une classe scolaire |
|---|---|---|---|---|
| Super Admin \`admin\` | Oui | Oui | Oui | Droits centraux existants |
| Admin local de A | Non | Oui | Non | **Non en S2-A** |
| Enseignant historique | Oui (comme aujourd'hui) | Non | Non | Non |
| Apprenant historique | Oui (comme aujourd'hui) | Non | Non | Non |
| Parent historique | Oui (comme aujourd'hui) | Non | Non | Non |

Pour l'admin local, la policy SELECT \`classes_select_school_admin_own_school\` vérifie \`schoolnet_private.is_school_admin_for(school_id)\`, qui impose une **appartenance active**, une **école active** et le rôle de profil \`school_admin\`. L'accès ne dépend jamais d'un \`school_id\` transmis par le navigateur sans validation.

**Attention :** deux anciennes policies SELECT sur les classes sont \`PERMISSIVE\` et se combinent par **OU**. Le SQL corrige **les deux** afin qu'aucune d'elles ne contourne le filtre tenant.

**Aucun GRANT ni policy d'écriture locale n'est ajouté dans S2-A.** Une école suspendue ou une affiliation révoquée doit perdre immédiatement l'accès aux classes de cette école via la fonction d'appartenance existante.

## 5. Tests SQL réalisés — tous annulés

**Recette :** \`supabase/verification/20261110_s2_school_classes_tenant_rollback.sql\`.

Script composé de la proposition et des assertions, exécuté dans une transaction \`BEGIN; ... ROLLBACK;\`.

**Tests réussis :**
- schéma proposé et contraintes créés temporairement, puis annulés ;
- deux classes officielles de même nom, niveau et année créées temporairement dans **deux écoles différentes**, tout en conservant la classe legacy portant déjà le même nom ;
- doublon dans une **même école** rejeté ;
- doublon sur une **ancienne classe** rejeté ;
- classe \`school\` sans \`school_id\` rejetée ;
- administrateur local de l'école A : uniquement la classe A ; ni legacy ni école B ;
- aucune modification, suppression ou insertion directe autorisée à l'admin local en phase S2-A ;
- rôles \`teacher\`, \`student\`, \`parent\` : accès aux anciennes classes conservé, nouvelles classes d'écoles invisibles ;
- Super Administrateur : visibilité de toutes les classes conservée.

Les écoles, classes et comptes réellement enregistrés dans Supabase sont intacts. **Aucune migration S2-A n'a été appliquée.**

## 6. S2-B avant activation du bouton « Créer une classe »

La création locale sera développée **après validation** de cette structure, avec les précautions suivantes :

1. **Formulaire local distinct**, dans \`/app/school/...\`, ne réutilisant pas directement \`AdminClasses.tsx\` qui gère les profils globaux ;
2. Sélectionner l'école **parmi les établissements autorisés** ; afficher niveau et année scolaire depuis une référence limitée et sécurisée (le rôle \`school_admin\` ne peut pas lire la table globale \`school_years\` à ce stade) ;
3. Proposer une **fonction serveur ou RPC strictement contrôlée**, avec authentification, validation du rôle \`school_admin\`, école active, appartenance active, niveau et année existants, nom normalisé, contrôle des doublons et journal d'audit ;
4. Éviter l'insertion directe depuis le navigateur tant que les règles de création ne sont pas intégralement couvertes ;
5. Faire apparaître **uniquement** les classes de l'école autorisée et ne pas afficher le contenu pédagogique de l'autre école ;
6. **Ne pas activer les affectations élèves/enseignants, les notes ni les bulletins en S2-A** : les RLS des tables dépendantes et le trigger global d'affectation devront d'abord être adaptés et testés.

### Risques à anticiper avant migration permanente

- Deux index uniques historiques sont remplacés : vérifier toutes les anciennes insertions et les éventuels \`ON CONFLICT\`, y compris hors du seul formulaire.
- L'année scolaire reste un référentiel global : prévoir sa sélection contrôlée sans réouvrir l'accès global à \`school_years\` pour \`school_admin\`.
- La page Super Admin \`AdminClasses.tsx\` doit rendre visible le **contexte** pour éviter une gestion involontaire d'une classe partenaire comme si elle était legacy.
- Un même élève peut appartenir à plusieurs parcours, mais le trigger historique impose une seule classe **globale** par année : revoir cette règle dans S3.
- Les futurs groupes libres ne doivent pas être automatiquement affectés à une école partenaire. Les séances à domicile restent distinctes de l'inscription scolaire.
- Les évaluations, cours, présences et documents ne sont **pas** isolés par une simple colonne \`classes.school_id\` ; chaque module devra hériter d'une politique de rattachement vérifiée.

## 7. Prochaine décision attendue

**La conception et les tests S2-A sont terminés.** Prochaine étape recommandée : revue et approbation du schéma RLS proposé, puis application ciblée d'une migration S2-A versionnée **après autorisation explicite**, avec de nouveaux contrôles et sans \`supabase db push --remote\` global.

Ensuite, créer l'API et le formulaire local de classes (S2-B), leur parcours de test à deux écoles et la règle de sélection des années/niveaux.

**État préservé :** 34 migrations Supabase, PR #6 toujours en brouillon, aucune fusion vers \`main\`, aucune publication Vercel Production.
