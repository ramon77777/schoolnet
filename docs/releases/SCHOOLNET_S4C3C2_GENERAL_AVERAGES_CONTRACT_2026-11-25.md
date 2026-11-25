# SCHOOLNET V2 — S4-C.3-C.2 — Contrat pur des moyennes générales officielles
**Cadrage métier S4-C.3-C.1 validé le 25 novembre 2026.**
**Statut : code de référence pour CI et tests fictifs ; pas de SQL principal, aucune moyenne publiée, pas de bulletin V2.**

## Périmètre de ce sous-lot
- Nouveau moteur **d'assemblage des matières attendues** `src/features/schools/lib/schoolOfficialGeneralAverageMath.ts`.
- **Réemploi** de `computeOfficialAveragePreview` (C.3-B.1) : mêmes formules, zéro publié admis, aucune conversion des notes manquantes en zéro, pondération non arrondie jusqu'au résultat final.
- Distinguer explicitement une **liste de matières validée** par l'administration d'établissement (input `curriculumApproved`, futur attribut server-verified), des **affectations** enseignants. Un catalogue incomplet ou non validé ne devient jamais une moyenne générale définitive.
- Exiger l'accord strict `schoolId + schoolYearId + classId + periodId + studentId` pour les données d'entrée ; A/B fictifs empêchent une contamination accidentelle **dans la couche pure**.
- Une matière sans coefficient, sans évaluation attendue, ou une liste vide mène à `not_configured`. Une copie non publiée, une dispense en attente de traitement, ou un transfert en cours de vérification mène à `incomplete`.
- Les évaluations explicitement exclues de la moyenne restent hors calcul, même publiées.
- Le résultat est `previewOnly: true`, jamais un bulletin ni une publication ; aucune authentification ou lecture réseau, aucune persistance.

## Portée des contrôles
Les valeurs `curriculumApproved`, `enrollmentState`, `participation` et les scopes **ne doivent jamais être acceptées directement du navigateur**. Seule la RPC future C.3-C.3 pourra les construire après avoir vérifié JWT, affiliation scolaire active, rôles, années, classes, listes de matières approuvées, dispensations et transferts.

**La validation d'une dispense approuvée n'est PAS implémentée à ce stade.** `exemption_pending` bloque le calcul ; une décision sur les preuves et autorisations de dispense sera nécessaire avant son ouverture. Les transferts sont également bloqués jusqu'à vérification de la scolarité officielle active.

## États de sortie
- `ready` : matières attendues approuvées et complètes, pondération correcte, aucune ambiguïté ;
- `incomplete` : au moins une note attendue non publiée, dispense en attente, transfert à vérifier ;
- `not_configured` : programme non validé/vide, coefficient matière manquant, matière attendue sans évaluation incluse.
La moyenne générale est **NULL** sauf `ready`. Les moyennes de matière incomplètes et les vues non validées n'exposent pas de chiffres partiels.

## Formules retenues
1. Matière, sans arrondi intermédiaire : `Mm = sum((score / maxScore)*20*coefEval) / sum(coefEval)`.
2. Générale, sans arrondi matière : `Mg = round(sum(Mm*coefMatiere) / sum(coefMatiere),2)`.
3. La RPC C.3-C.3 fera les opérations avec `NUMERIC` PostgreSQL ; ce module TypeScript est la référence de comportement sur jeux fictifs, non l'autorité de production.

## Contrôles reproductibles
`npm run qa:s4c3c2` ; régression `npm run qa:s4c3b1` ; `npm run qa:s4c3b2`, `npm run lint`, `npm run build`.
Tests : pondération multi-matières, arrondi, zéro publié, absences, coefficient manquant, évaluation exclue, catalogue non validé, dispense, transfert, mélange écoles A/B, identités/années/classes/périodes incohérentes, doublons, invalides, entrées figées et frontières V1.

## Prochaines étapes (pas de GO implicite)
1. Recette tests GitHub Actions et tests locaux `schoolnet-tests` ; aucun site Preview Vercel voulu sur cette branche.
2. **GO distinct** C.3-C.3 pour création de référentiel matières attendues et RPC de prévisualisation, tests PostgreSQL jetables A/B, refus rôles non habilités.
3. **GO SQL distinct** après sauvegarde/restauration validée ; puis **GO fusion main** après recette locale ; Vercel Free à limiter.
4. **S4-D ultérieur** : génération, validation, gel et publication des bulletins V2 distincts des anciens `public.report_cards` et `public.grading_periods`.

**Ne pas réécrire C.3-B.1/B.2/B.6 ; la PR #38 reste validée et l'issue #39 est le point de suivi.**
