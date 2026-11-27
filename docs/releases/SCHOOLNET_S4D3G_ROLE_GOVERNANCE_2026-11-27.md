# SCHOOLNET V2 — S4-D.3g : cadrage des responsabilités et des habilitations

**Date : 27 novembre 2026 — document de conception non opérationnel.**
Suite de S4-D.3f (PR #67, recette Windows et parcours visuel principal confirmés). Cette branche n'active aucun droit nouveau. Elle se superpose à S4-D.3f et reste séparée de main, de Supabase principal et de Vercel.

## 1. Faits tirés du code SCHOOLNET existant

La définition des rôles actuellement en service est celle de src/lib/auth/auth-context.ts :
- admin : administrateur général SCHOOLNET ;
- school_admin : administrateur d'établissement ;
- teacher : enseignant ;
- student : apprenant ;
- parent : parent/tuteur.

La consultation du bulletin individuel scolaire V2 dans « Bulletins et exports » passe par le composant SchoolOfficialBulletinWorkspace, limité au compte school_admin réel (non-démo). La sélection d'établissement est filtrée par schoolnet_school_memberships.member_role=school_admin et status=active, puis par schoolnet_schools.status=active. Ces filtres d'interface ne remplacent **jamais** les vérifications de la RPC individuelle côté serveur (auth.uid, affiliation et école/classe/période/élève). Le compte admin général ne reçoit **aucune** permission implicite de validation de bulletins d'établissement.

L'accès aux propres matières affectées à un enseignant appartient à d'autres interfaces scolaires, **pas au parcours de prévisualisation des bulletins d'établissement**. Les parents et élèves ne disposent pas de ce parcours individuel privé, pré-publication.

Aucun des cinq rôles applicatifs ne possède aujourd'hui, dans ce module S4-D, de permission permettant de soumettre, approuver, publier ou retirer un bulletin individuel. **Le rôle n'est pas une preuve d'autorité de signature.**

## 2. Matrice de responsabilités — proposition

| Rôle existant | Prévisualisation individuelle V2 dans cet espace | Soumettre à décision | Approuver/refuser | Publier | Retirer |
|---|---|---|---|---|---|
| school_admin | Lecture conditionnée au serveur + affiliation école active | Non attribué | Non attribué | Non attribué | Non attribué |
| teacher | Pas dans ce parcours ; ses matières affectées relèvent d'autres vues | Non attribué | Non attribué | Non attribué | Non attribué |
| admin | Pas dans ce parcours ; administration de plateforme ≠ décision scolaire | Non attribué | Non attribué | Non attribué | Non attribué |
| parent | Pas de prévisualisation de bulletin non publié | Non attribué | Non attribué | Non attribué | Non attribué |
| student | Pas de prévisualisation de bulletin non publié | Non attribué | Non attribué | Non attribué | Non attribué |

Les fonctions à **désigner**, plutôt que d'inventer de nouveaux rôles applicatifs sans accord :
1. **Contrôle pédagogique en lecture seule** : déjà possible par school_admin sous contrôle serveur, aucune validation officielle.
2. **Soumission à examen** : demandeur habilité, avec délégation par établissement à définir ; school_admin est un candidat métier et non un titulaire actuel.
3. **Décision administrative** : responsable compétent à désigner, distinct du demandeur selon la séparation proposée ; accord, refus ou retour pour correction motivés.
4. **Publication et retrait** : responsable de diffusion à désigner ; action distincte de la décision d'approbation, jamais automatique.

## 3. Règles de sécurité à arbitrer et construire ultérieurement

- **Portée du droit** : authentification serveur actuelle et appartenance active à l'établissement pour l'école, l'année, la classe, la période et l'élève demandés, à chaque action sensible.
- **Droits explicites** : une habilitation spécifique, limitée dans le temps, au site, à l'action et révocable ; ne pas déduire de droit à partir de school_admin, admin ou teacher.
- **Double contrôle proposé** : le demandeur ne devrait pas approuver sa propre demande ; examiner la nécessité de personnes différentes pour approbation et publication.
- **Version immuable** : apposer la décision sur une version figée du programme et des résultats. En cas de correction, invalider l'approbation de l'ancienne version et reprendre le circuit défini.
- **Transactions serveur** : vérifications atomiques des habilitations, état courant, idempotence, prévention des doubles décisions et journal append-only, horodatage du serveur.
- **Confidentialité** : vérification des accès école et filiation parent/enfant ; les notes brutes n'entrent pas dans les journaux génériques.
- **Aucun recours au client** pour décider des permissions, du rôle effectif ou de l'auteur d'une décision.

## 4. Sept décisions métier à valider avant activation

| Décision à prendre | Proposition non validée |
|---|---|
| Demandeur | Administrateur de l'établissement avec délégation explicite, active et limitée |
| Approbateur | Responsable de l'établissement habilité, distinct du demandeur |
| Publication/retrait | Responsable de diffusion désigné, distinct de l'approbation fonctionnelle |
| Délégations | Périmètre école/année/classe, durée, révocation, historique |
| Mentions obligatoires | Fixer rang, absences, appréciations, signatures et autres champs selon les règles de l'établissement |
| Correction après décision | Réexamen d'une nouvelle version ; procédure de dépublication à définir |
| Accès famille | Consultation après publication uniquement pour l'élève/parent autorisé |

Ce tableau **n'est ni une décision de gouvernance adoptée, ni un règlement intérieur, ni une configuration effective**. Il offre une base concrète pour obtenir l'accord métier.

## 5. Livrable UI et limites

Un sous-panneau déroulant **« S4-D.3g — Responsabilités et habilitations — cadrage »** apparaît à la suite du circuit préparatoire S4-D.3f, qui reste conditionné par la réception d'une projection scolaire individuelle S4-D.3b validée.

Il affiche : les cinq rôles SCHOOLNET, leur accès courant à cette prévisualisation seulement, les quatre opérations sensibles toutes marquées « Non attribué », les fonctions à instituer, les règles de séparation des pouvoirs et les décisions restant à confirmer.

**Aucun formulaire d'attribution de droits, aucune validation métier enregistrée, aucun nouvel utilisateur ou rôle, aucune table/RPC/migration, aucun bouton d'approbation, d'export, de publication ou de retrait.** Le sous-panneau ne transmet rien à Supabase et n'altère aucune donnée.

## 6. Recette et clôture

CI : qa:s4d3g + qa:s4d3f, qa:s4d3e, qa:s4d3d, qa:s4d3c, qa:s4d3b, qa:s4d3a, qa:s4d2c2, qa:s4c3c4, qa:s4c5, lint et build.

Sur la copie Windows existante D:\Bakary\10 autres\schoolnet-tests :

~~~powershell
git status -sb
git fetch origin
git switch -c local/schoolnet-s4d3g --track origin/feature/schoolnet-s4d3g-approval-role-governance-20261127
git log -1 --oneline
npm run qa:s4d3g
npm run build
git restore -- tsconfig.app.tsbuildinfo
git status -sb
npm run dev
~~~

Mode fictif limité à DEV, sous compte administrateur d'établissement déjà utilisé :

http://localhost:5173/app/school/official-documents?schoolnet_c3c4_demo=1

Recette ciblée **sans rejouer les anciennes** : ouvrir l'élève fictif 01, descendre au circuit S4-D.3f, constater le nouveau bloc S4-D.3g. Vérifier cinq rôles, aucun droit de soumission/décision/publication/retrait attribué, les 7 décisions en suspens et l'absence de bouton opérationnel. Pas de nouveau test des notes ou de l'élève 03 requis.

La PR S4-D.3g doit rester brouillon, empilée sur #67 → #66 → #65 → #64 → #63 ; Vercel Preview désactivé. **Aucun SQL Supabase principal, aucune fusion main, aucun déploiement Vercel ou publication officielle avant autorisation spécifique.**
