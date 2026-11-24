# SCHOOLNET V2 — S4-B.3-B.2 · Tentatives et remises officielles sécurisées

> **Point de situation — 24 novembre 2026**
>
> **Supabase principal :** la migration B.2 `20261123105413` (`schoolnet_s4b3b2_official_assessment_attempts`) est installée et vérifiée. Son SQL correspond exactement à `supabase/proposals/s4b3b2_official_assessment_attempts.sql`.
>
> **Autorisation actuelle :** l’utilisateur a autorisé la fusion dans `main` et la publication sur le site officiel SCHOOLNET. L’intégration cumulative des PR #27 à #30 est suivie dans la [PR #30](https://github.com/ramon77777/schoolnet/pull/30). L’achèvement du déploiement reste à constater.
>
> Les mentions antérieures « non installé », « non autorisé » ou équivalentes ci-dessous décrivent l’étape de préparation ; elles sont conservées comme historique.

**Date :** 23 novembre 2026  
**Branche de développement :** `feature/schoolnet-s4b3b2-secure-assessment-submissions-20261123`  
**Base :** correctif Windows `3fcc32229bffe7cfa12dabbfaeb9bf31fb964a9e`  
**Statut :** développement GitHub et tests locaux/CI. **AUCUN SQL appliqué sur Supabase principal, aucune fusion `main` ni publication de production.**

## Périmètre fonctionnel B.2

Un élève réellement affecté à une classe d'un établissement SCHOOLNET
peut ouvrir une évaluation **publiée et explicitement rattachée** à son
cours officiel. Quatre opérations sont disponibles via une seule RPC :

| Action | Effet |
|---|---|
| `read` | Lire uniquement l'état de sa propre copie et ses réponses |
| `start` | Ouvrir sa tentative unique, démarrer le chronomètre côté serveur |
| `save` | Enregistrer atomiquement le brouillon écrit et les choix |
| `submit` | Remettre définitivement ; une seconde requête est idempotente |

Les évaluations de type **quiz, devoir en ligne et examen avec questions
en ligne** sont prises en charge. Une copie peut contenir des QCM,
vrai/faux (choix réellement présents dans la base), réponses libres et,
pour un devoir/examen, une réponse écrite complémentaire.

**Hors périmètre B.2 :** devoirs par fichiers, examens `file_only` ou
`file_and_questions`, ouverture de documents privés, notation,
correction, publication des résultats et consultation parentale.
Ces parcours doivent recevoir leurs propres autorisations et tests.

L'évaluation de recette créée le 20 novembre 2026 possède une **échéance
déjà dépassée** : il faudra utiliser une évaluation de test encore
ouverte dans un environnement autorisé, sans modifier spontanément les
données principales.

## Architecture de sécurité

Proposition SQL **NON INSTALLÉE** :
`supabase/proposals/s4b3b2_official_assessment_attempts.sql`.

- `public.schoolnet_student_school_assessment_attempt(...)` :
  proxy **SECURITY INVOKER**, droit `EXECUTE` uniquement à
  `authenticated`, aucun accès anonyme.
- `schoolnet_private.student_school_assessment_attempt(...)` :
  **SECURITY DEFINER** non exposé par Data API, `search_path=pg_catalog`,
  contrôle de `auth.uid()`, du rôle réel `student` et réutilisation du
  contrat **S4-B.3-B.1** pour contrôler l'établissement, la classe,
  l'année scolaire, l'enseignant et le rattachement actif.
- Aucun `student_id`, score ou horodatage n'est accepté du navigateur.
  Les dates et délais sont calculés exclusivement en base
  (`clock_timestamp()`), y compris après redémarrage du navigateur.
- Verrou de ligne `FOR UPDATE`, unicité `(assessment_id,student_id)`,
  `ON CONFLICT DO NOTHING` et transaction SQL empêchent les doubles
  tentatives et l'écrasement concurrent.
- Les réponses sont validées : question appartenant à l'évaluation,
  choix appartenant à la question, champs fermés, pas de doublon, textes
  limités. `is_correct` reste `NULL` ; ni correction ni note
  n'est transmise au client.
- La copie devient verrouillée après `submitted`, `graded` ou
  `published`. Une seconde demande `submit` ne modifie rien.
- Les huit politiques RLS restrictives B.0 demeurent **inchangées** :
  les consultations et écritures directes depuis le navigateur restent
  interdites pour les copies officielles.
- Deux fonctions V1 existantes sont adaptées **uniquement pour les objets
  officiellement rattachés** : pas de création de progression V1 sur une
  copie officielle et pas de notification de correction V1 inaccessible.
  Les notifications de remises officielles seront traitées avec
  l'interface enseignant du lot B.4.

## Interface élève

- `src/features/student/pages/StudentSchoolAssessmentPreview.tsx`
  propose « Commencer ou reprendre l'évaluation » lorsqu'une remise en
  ligne est disponible et que l'échéance n'est pas dépassée.
- Nouvelle route protégée :
  `/app/student/school-courses/:courseId/assessments/:assessmentId/take`.
- `src/features/student/pages/StudentSchoolAssessmentTake.tsx` :
  affichage responsive des consignes et questions via le composant
  `SafeRichText`, saisie, sauvegarde explicite de brouillon,
  confirmation de remise, avertissement avant sortie, chronomètre
  indicatif et statut de copie.
- `studentSchoolAssessmentAttemptApi.ts` :
  un unique appel `supabase.rpc`. Pas de `.from('assessment_submissions')`.
- `studentSchoolAssessmentAttemptModel.ts` :
  validation stricte du JSON et des réponses autorisées, aucune
  propriété de correction ou score.
- Aucune tentative de repli vers les anciennes routes de soumission V1.

## Tests et recette

Les tests Node `npm run qa:s4b3b2` peuvent être exécutés **sans Docker,
sans Supabase local, sans fichier `.env.local`** sur le Worktree déjà
préparé : `D:\Bakary\10 autres\schoolnet-tests`. Ensuite,
`npm run lint` et `npm run build`.

La CI GitHub recrée une base Supabase **jetable dans GitHub Actions**,
rejoue les schémas minimaux V1/V2 et teste :

- étudiant A et B dans deux établissements indépendants ;
- sauvegarde puis remise, absence de doublon, rejet après remise ;
- refus d'un choix étranger ou d'un champ de bonne réponse falsifié ;
- rejet d'une remise sans tentative préalable ou après échéance ;
- vrai/faux et devoir écrit sans fichier ;
- refus des parents, enseignants, élèves non affectés ;
- protection des tables RLS, absence d'auto-notation ;
- aucune progression ou notification V1 parasite pour les copies
  officielles et parcours V1 historique inchangé ;
- restauration manuelle SQL B.2 sur base locale.

Le rollback est préparé, **sans exécution sur production** :
`supabase/verification/s4b3b2_official_assessment_attempts_rollback_manual.sql`.

**Conditions de sortie B.2 :** tests GitHub verts, tests Node et
compilation locale Windows validés, recette fonctionnelle réelle sur
un backend de test autorisé, puis autorisation explicite **distincte**
pour toute migration principale et toute publication de production.

## Restrictions en vigueur

- Développement GitHub autorisé.
- **Supabase principal : aucun changement autorisé.**
- **`main` et Vercel production : aucun déploiement autorisé.**
- **Vercel Preview :** la connexion GitHub peut automatiquement déclencher
  une Preview lors du push ; cette génération automatique ne constitue
  ni une validation de production, ni une autorisation de publication.
- Le correctif Windows B.1 non encore fusionné est inclus dans cette
  branche pour garantir que `npm run build` fonctionne sur le PC.
