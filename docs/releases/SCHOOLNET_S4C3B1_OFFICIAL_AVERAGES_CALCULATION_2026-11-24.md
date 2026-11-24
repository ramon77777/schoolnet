# SCHOOLNET V2 — S4-C.3-B.1 — Moteur de référence des moyennes officielles

**Démarrage autorisé : 24 novembre 2026.** PR en préparation, branche isolée. **Aucun SQL C.3-B appliqué à Supabase principal, aucune note calculée ni publiée, aucun changement Vercel.**

## Constat de l'existant
C.3-A et C.3-A.1 fonctionnent sur l'établissement fictif `SCH-000001`, année 2026-2027 :
- `T1` et `T2` modifiables ;
- coefficient de **Mathématiques, 6e A, T1 = 2** ;
- évaluation officielle « TEST S4-B.3-A — Nombres entiers », `T1`, coefficient **1**, `include_in_average=true` ;
- copie **20/20**, publiée le 23 novembre 2026 ;
- aucun paramétrage de coefficient `T2`.

L'ancienne V1 calcule des moyennes via `public.student_assessment_average_entries`, `teacher_class_average_results` et d'autres tables de cours libres. **Ces données ne sont ni migrées ni additionnées à V2.** L'ancienne table V1 `public.grading_periods` n'est pas l'annuaire des périodes V2.

## Frontière de C.3-B.1
Cette première proposition crée uniquement une référence de mathématiques et des tests sur données fictives :
- `src/features/schools/lib/schoolOfficialAverageMath.ts` — calcul **pur et sans réseau** à destination des tests ;
- `scripts/test-schoolnet-s4c3b1-official-averages.mjs` — tests de calcul et invariants ;
- `npm run qa:s4c3b1` et CI dédiée.

**Ce module ne doit pas être branché sur les pages de moyennes V1**. Il ne contient aucun accès Supabase, aucune identité d'élève, aucun calcul de classement, aucun bouton de publication.

## Formules proposées (prévisualisation seulement)

Pour une évaluation officielle *explicitement incluse* et *publiée* :
- Note sur 20 = `20 × note_publiée / barème_max`.
- Moyenne de la matière = `Σ(note_sur_20 × coefficient_évaluation) / Σ(coefficient_évaluation)`.
- Moyenne générale prévisionnelle = `Σ(moyenne_matière_non_arrondie × coefficient_matière) / Σ(coefficient_matière)`.

**Pas d'arrondi intermédiaire ; affichage sur deux décimales.** PostgreSQL `numeric` fera autorité dans le futur SQL. Les coefficients existants autorisés sont de `0.25` à `20`, au plus deux décimales.

### États et exceptions
- Copie non remise, en cours, seulement corrigée, non publiée ou non notée : **aucun zéro automatique**. La moyenne générale est `null` (état `incomplete`) tant que les évaluations explicitement incluses ne sont pas toutes publiées.
- Une note `0` est prise en compte **uniquement** si elle a été officiellement publiée.
- Discipline active sans coefficient, sans évaluation incluse ou sans résultat publié : `incomplete`, pas de moyenne générale affichée comme définitive.
- Une évaluation avec `include_in_average=false` ne compte jamais, même si sa note a été publiée.
- Aucun sujet ni coefficient : état `no_subjects`, pas de moyenne générale.
- Rejet des doublons d'évaluation, barèmes nuls, notes supérieures au barème, valeurs négatives et données de notes non publiées présentes dans une projection.
- Même lorsqu'un résultat est disponible, il ne constitue **qu'une prévisualisation** ; l'état `previewOnly=true` est explicite.
- Le verrouillage des périodes, le classement, la publication des moyennes et les bulletins appartiennent à des étapes futures **avec GO distinct**.

## Sécurité à appliquer en C.3-B.2 (pas encore implémentée)
Le calcul réel se fera **dans PostgreSQL** derrière des RPC spécifiques, jamais par des `SELECT` du navigateur sur les tables privées :
1. Vérifier l'identité `auth.uid()`, le rôle et les droits actuellement actifs avant chaque lecture.
2. Vérifier la correspondance intégrale `école + année + classe + matière + période`, les affectations et la scolarité actives.
3. Prendre uniquement les évaluations officielles liées avec lien de cours/enseignant actif, les coefficients de C.3-A, et des copies `status='published'` avec `published_at` et note dans le barème.
4. Dédupliquer par `assessment_id`, contrôler la présence des matières autorisées et ne pas interpréter une absence de résultat comme un zéro.
5. Respecter la confidentialité actuelle : **ne pas exposer les notes nominatives des élèves au school_admin par défaut** (le module supervision C.2 est sans notes personnelles). Enseignant : seulement ses classes habilitées ; élève : ses notes publiées ; parent : uniquement ses enfants dont le lien est autorisé et actif.
6. Retourner des projections strictes et minimales ; aucune liste de réponses, appréciations confidentielles, identités tierces ou notes non publiées.
7. Isoler les calculs B.3-V2 des publications, bulletins et RPC V1 ; pas d'écriture dans `public.student_period_averages` ni `public.average_grade_entries`.

## Jalons de validation
- [ ] **C.3-B.1 :** tests mathématiques et CI, sans accès aux données hébergées.
- [ ] **C.3-B.2 :** conception des RPC de lecture et tests PostgreSQL jetable A/B (élève A / école B refusé, révocation, non publication, configuration manquante, classes différentes).
- [ ] **GO SQL principal distinct** après nouvelle sauvegarde et vérification du rollback.
- [ ] **GO fusion main / Vercel distinct** après CI et recette sécurisée.
- [ ] **C.3-B.3 futur** : publication des moyennes et classement éventuel, seulement après validation métier du périmètre.

**Aucune modification des résultats existants n'est prévue dans C.3-B.1.**
