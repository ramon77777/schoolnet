# SCHOOLNET V2 — C.3-B.2-UI — Interface Enseignant « Moyennes officielles »

**24 novembre 2026 — PR en brouillon, sur branche dédiée.** Cette livraison ne fusionne rien dans `main`, ne modifie aucune note et n'installe aucune fonction sur Supabase principal.

## Fonctionnement prévu

L'enseignant connecté accède au nouvel écran **`/app/teacher/official-averages`** depuis la navigation de l'espace Enseignant, à côté des **« Moyennes · cours libres »** V1 (route existante conservée). L'écran est réservé aux utilisateurs de rôle `teacher` réels ; les modes démo sont exclus.

Les listes déroulantes permettent de sélectionner, par ordre hiérarchique :

1. **Établissement** où l'enseignant dispose d'une affiliation active ;
2. **Année scolaire** parmi ses affectations actives ;
3. **Classe** parmi ses propres affectations dans cet établissement et cette année ;
4. **Matière** qu'il enseigne officiellement dans cette classe ;
5. **Période** configurée par l'établissement pour cette année.

Le changement d'établissement ou d'année invalide immédiatement toute sélection étrangère. Une modification des filtres empêche l'affichage d'une ancienne réponse grâce à une clé combinant l'identité, la période, la classe et la matière.

Le tableau d'élèves possède une recherche par nom, un filtre sur la situation, un affichage responsive avec cartes mobiles, et une pagination. Il montre le nombre d'évaluations incluses déjà publiées, l'état du calcul et la **moyenne de la matière uniquement**. Les compteurs annoncent « calculables », « notes manquantes », « à paramétrer ». Un zéro effectivement publié reste bien **0,00/20** ; une note non publiée ou absente donne une moyenne **non calculable (—)**, jamais un faux zéro.

Aucun bouton de publication, aucun classement, aucune moyenne générale inter-matières et aucun bulletin ne sont intégrés ici. L'enseignant ne peut pas modifier les coefficients de l'administration depuis cette page.

## Appels à la base et confidentialité

L'interface **ne réalise aucun `SELECT` sur les notes, les élèves, les périodes ou les tables privées**. Deux RPC de lecture autorisées côté serveur sont requises :

- `public.schoolnet_teacher_official_average_options()` : **nouvelle proposition SQL** `supabase/proposals/s4c3b2ui_teacher_average_options.sql` ; renvoie exclusivement les affectations école/classe/matière/année autorisées à `auth.uid()` et leurs périodes, **sans identités d'élèves ni notes** ;
- `public.schoolnet_teacher_official_subject_averages(p_school_id,p_period_id,p_class_id,p_subject_id)` : proposition déjà créée en **C.3-B.2** (PR précédente) ; vérifie à nouveau l'accès enseignant et n'émet que les moyennes de sa matière sur notes publiées.

La première RPC est `SECURITY DEFINER` dans le schéma non exposé `schoolnet_private`, avec rôles, adhésions et affectations vérifiés à chaque appel ; la façade `public` est `SECURITY INVOKER`, exécutable seulement par `authenticated`. Aucun paramètre ne fournit l'identité de l'enseignant ; la fonction utilise `auth.uid()`.

Les deux réponses passent par des **validateurs TypeScript stricts** (champ supplémentaire ou référence de période hors établissement = rejet). Les clients ne reconstituent ni ne recalculent les moyennes dans le navigateur.

## Déploiement progressif et absence de SQL

**Aucun SQL n'étant encore installé sur Supabase principal**, la page présentera en attendant « Activation SQL en attente » **sans exposer de notes**. Elle ne doit pas inventer de résultats de substitution. Les modules officiels précédents, les cours libres et la page de moyennes V1 restent inchangés.

- [ ] Vérifier la maquette et la navigation enseignants sur branche d'essai / rendu local ;
- [ ] CI complète Node, ESLint et build réussie ;
- [ ] Base PostgreSQL jetable : simulateur A/B, enseignant sans affectation, autre établissement, rôle admin, anonymat, révocation, rollback ciblé ;
- [ ] **Autorisation distincte et sauvegarde locale vérifiée** avant installation de C3-B.2 et de la nouvelle RPC de sélection sur Supabase principal ;
- [ ] **Autorisation distincte** avant fusion des PR en chaîne vers `main` et déploiement Vercel ;
- [ ] Recette réelle avec un enseignant affecté, au moins une période, un coefficient et une copie publiée, puis vérification du mobile.

## Fichiers du lot
- `src/features/teacher/pages/TeacherOfficialAverages.tsx`
- `src/features/teacher/lib/teacherOfficialAverageOptionsModel.ts`
- `src/features/teacher/lib/teacherOfficialAverageOptionsApi.ts`
- `src/routes/router.tsx` et `src/layouts/DashboardLayout.tsx`
- `scripts/test-schoolnet-s4c3b2-ui.mjs`
- `tests/s4c3b-tenant-ci/fixtures/teacher-averages-options-a-b.sql`
- `supabase/proposals/s4c3b2ui_teacher_average_options.sql`
- `supabase/verification/s4c3b2ui_teacher_average_options_rollback_manual.sql`

**Important : c'est un écran de prévisualisation de la moyenne de la matière de l'enseignant, et non une publication officielle ni une moyenne générale.**
