# SCHOOLNET V2 — S4-C.3-B.2 — Prévisualisation des moyennes officielles par enseignant

**Date : 24 novembre 2026** — En développement, sur branche dédiée. **Aucun SQL de ce lot n'est autorisé sur Supabase principal, aucun merge sur main, aucun déploiement Vercel.**

## Décision validée
L'enseignant doit pouvoir *prévisualiser et préparer* les moyennes officielles des élèves des **classes et matières auxquelles il est actuellement affecté**. Les paramètres de périodes et les coefficients de C.3-A restent sous le contrôle de l'administrateur d'établissement.

Un enseignant **ne voit pas** les moyennes ou les résultats des matières/évaluations de ses collègues. Une moyenne générale multi-matières ne peut pas être déduite du seul aperçu de sa matière. Le futur bulletin, le classement, la validation finale des moyennes et la publication aux élèves/parents constituent des étapes distinctes.

## Livraison technique (proposition non installée)
- SQL **proposal-only** : `supabase/proposals/s4c3b2_teacher_official_subject_averages.sql`.
- Fonction privée : `schoolnet_private.teacher_official_subject_averages(school,period,class,subject)`, `SECURITY DEFINER` et `search_path=pg_catalog`, avec contrôle strict des habilitations et des joins tenant.
- Façade Data API : `public.schoolnet_teacher_official_subject_averages` : `SECURITY INVOKER`, `GRANT EXECUTE` uniquement à `authenticated`.
- Fichier UI-compatible : `src/features/teacher/lib/teacherOfficialAveragesApi.ts` utilise **une seule RPC** ; aucune lecture directe de copies, réponses, notes ou classements.
- Contrat TypeScript strict : `src/features/teacher/lib/teacherOfficialAveragesModel.ts`, validation identités, classe/établissement/période, moyenne et état.
- Batterie QA : `scripts/test-schoolnet-s4c3b2-teacher-averages.mjs`.
- Scénarios PostgreSQL A/B jetables, avec transaction `ROLLBACK` : `tests/s4c3b-tenant-ci/fixtures/teacher-averages-a-b.sql`.
- Suppression ciblée des 2 fonctions C.3-B.2 (sans toucher C.3-A) : `supabase/verification/s4c3b2_teacher_official_subject_averages_rollback_manual.sql`.
- GitHub Actions : `.github/workflows/schoolnet-s4c3b2-teacher-averages-ci.yml`.

## Accès au périmètre personnel de l'enseignant
La fonction refuse toutes les lectures sans `auth.uid()` d'un rôle `teacher`, une adhésion `teacher` locale active et non révoquée, et une affectation active de l'enseignant pour **cette école, cette année, cette classe et cette matière**. Elle recontrôle les références et le statut de l'établissement, puis filtre uniquement les évaluations officielles liées au **cours et à l'affectation du demandeur**. Elle ne reçoit **aucun identifiant d'enseignant contrôlable par le navigateur**.

Le tableau de résultats ne contient que les élèves actuellement inscrits et membres actifs de cette même classe et école. Les membres ou affectations révoqués disparaissent immédiatement.

## Calcul de prévisualisation
Par élève :
1. Partir uniquement des évaluations officielles **expressément incluses** pour la période (option `include_in_average=true`).
2. Ne retenir que les évaluations officielles publiées/fermées, avec lien école/cours/enseignant toujours actif.
3. Compter comme **note utilisable** seulement une copie `status='published'`, avec `published_at`, un `score` valide entre 0 et le `max_score` strictement positif.
4. Moyenne de matière = `Σ(20 × score / max_score × coefficient_evaluation) / Σ(coefficient_evaluation)`.
5. Un **0** explicitement publié compte bien comme 0. Une copie absente, remise ou seulement corrigée ne devient **jamais** 0.
6. La moyenne n'est visible dans la réponse que lorsque **toutes** les évaluations incluses de l'élève sont publiées **et** le coefficient de matière existe. Sinon `averageOn20=null`, état `incomplete` ou `not_configured`.
7. Utiliser PostgreSQL `numeric`, arrondir uniquement la réponse à deux décimales. Aucune note n'est publiée ou recalculée en base.

Exemple fictif : deux quiz officiels publiés, `20/20` coefficient 1 et `5/10` coefficient 3 → moyenne `12,50/20`. Le coefficient **2** de Mathématiques est retourné dans le contexte : il servira à la moyenne générale **future**, pas à doubler la moyenne de la matière.

## Confidentialité et non-régression
- Aucun détail de copie ni appréciation, ni classement, ni note individuelle par évaluation : seule la **moyenne de matière** est retournée à l'enseignant autorisé.
- Pas de moyenne générale ni de résultat officiel définitif ; `previewOnly=true` et `teacherScoped=true` obligatoires.
- Les RPC V1 et les tables `public.student_period_averages`, `public.student_subject_averages`, `public.average_grade_entries` ne sont pas modifiées.
- Les périodes et coefficients T1/T2 sur le principal ne changent pas.
- Les fonctions et migrations sont seulement **proposées**, non appliquées au principal.
- L'accès étudiant/parent aux moyennes publiées reste hors périmètre C.3-B.2.

## Recette et conditions de passage
- [ ] Tests Node purs et TypeScript, lint et build réussis.
- [ ] Scénarios A/B PostgreSQL jetable : liste de classe A, retrait élève A2, droits enseignant A, école B inaccessible, matière non affectée, enseignant révoqué, administrateur sans notes, anonyme refusé.
- [ ] Pondération : 20/20 coeff. 1 et 5/10 coeff. 3 donnent 12,50/20 ; 0 publié donne 0 ; copie non publiée donne `null` ; V1 et évaluations non incluses exclus.
- [ ] Annulation ciblée vérifiée sur la **base jetable** sans altérer C.3-A.
- [ ] Relecture SQL/sécurité avant un **GO SQL principal distinct** accompagné d'une sauvegarde et d'un rollback.
- [ ] Intégration de la page enseignant, contrôles visuels et GO fusion/publication distincts.

**Ne pas installer ce SQL sur Supabase principal sans une nouvelle autorisation explicite.**
