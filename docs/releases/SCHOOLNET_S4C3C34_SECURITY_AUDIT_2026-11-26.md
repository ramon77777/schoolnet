# SCHOOLNET V2 — S4-C.3-C.3.4 : audit de sécurité / bases isolées
**26/11/2026 — Proposition révisée, non installée sur Supabase principal.**
**Dépendances** : PR #40 → PR #41 → PR #42 → cette PR d'audit. Ne jamais fusionner la tête de la pile indépendamment des prérequis.

## Constat et correction
La RPC \`schoolnet_private.school_official_curriculum_manage\` de C.3-C.3.3 utilisait \`SELECT ... FOR UPDATE\` pour toutes les actions, y compris \`read\`. Cela prenait un verrou d'écriture inutile et rendait une lecture normale impossible dans \`BEGIN READ ONLY\`.
La révision utilise **SELECT sans verrou pour read**, **SELECT ... FOR UPDATE pour set/approve**, en conservant le verrou transactionnel advisory sur la même combinaison établissement/période/classe pour les écritures. Le contrôle d'accès \`auth.uid()\` + profil \`school_admin\` + appartenance active est inchangé.

## Contrôle du schéma réel (lecture seule, aucune note personnelle consultée)
Métadonnées des tables, contraintes, types et rôles vérifiées via SQL en **lecture seule** :
- PostgreSQL 17.6 ; \`assessments.status\` = draft/published/closed ; \`assessment_submissions.status\` = in_progress/submitted/graded/published ; \`courses.status\` = active/archived.
- \`schoolnet_school_memberships\` comporte bien \`school_id,user_id,member_role,status,revoked_at\` et une unicité (school_id,user_id).
- \`schoolnet_school_student_class_assignments\`, \`schoolnet_school_teacher_subject_assignments\`, \`school_course_links\`, \`school_assessment_links\`, \`school_grading_periods\`, \`school_period_subject_coefficients\`, \`school_official_assessment_coefficients\` comportent les colonnes de jointure et les vérifications attendues.
- \`public.get_my_role()\` renvoie le rôle du profil de \`auth.uid()\`. L'appartenance active est vérifiée côté serveur, **sans se fier au rôle déclaré par le navigateur**.
- Les objets \`schoolnet_private.school_official_curricula\` et \`public.schoolnet_school_official_general_averages\` restent **absents du projet principal** : la vérification de leur absence ne vaut pas validation d'installation.

## Scénarios déjà couverts et maintenus en non-régression
20 preuves SQL de C.3-C.3.3 : écoles fictives A/B, rôle administrateur vs teacher/parent/student/révoqué, IDOR classe/période, zéro publié et non publié, double inscription en transfert, aucune note brute dans la projection, édition/approbation catalogue, période verrouillée, aucun privilège direct du client sur les tables privées et rollback. Tests TypeScript de C.3-C.2, contrats C.3-C.3 et C.3-C.3.3 maintenus.

## Scénarios nouveaux C.3-C.3.4 (PostgreSQL 17 jetable)
- Opération \`read\` réellement exécutée sous \`BEGIN READ ONLY\` avec le rôle \`authenticated\` et \`auth.uid()\` fictif.
- Prévisualisation de catalogue brouillon dans la même transaction de lecture seule : aucune moyenne ni nom non autorisé.
- Refus d'approuver une liste vide ; refus des matières doublonnées, inexistantes ou inactives, et listes de plus de 60 matières.
- Refus d'un argument de mutation pour une action \`read\` et refus d'une action inconnue.
- Une mise à jour idempotente de la liste approuvée ne révoque pas arbitrairement l'approbation.
- Une **révocation réelle de l'appartenance dans la transaction** interdit immédiatement la lecture du catalogue et de la moyenne, même avec un \`auth.uid()\` identique.
- Nettoyage final des données **100 % fictives** de l'environnement CI; aucun contact de base avec Supabase principal.

## Risques restants et GOs requis
1. La base de CI reproduit le **contrat de schéma pertinent** comparé en lecture seule aux métadonnées de Supabase, mais **n'est pas une copie intégrale de Supabase Auth/RLS/PostgREST**. Tester encore sur une instance Supabase **isolée**, dédiée aux données fictives (et avec les mêmes migrations) avant d'envisager la production.
2. Revue opérationnelle : jeux volumineux (limites de 250 élèves / 500 évaluations), performance de calcul, logs de tentative d'accès, erreurs réseau, vérification de sauvegarde-restauration.
3. Validation fonctionnelle séparée du catalogue côté administrateur, dispenses et transferts effectivement résolus, règles de verrouillage. La prévisualisation ne publie rien aux élèves, parents ou enseignants.
4. Exports PDF/Excel par classe (trimestriels, semestriels, annuels), y compris droits toutes matières, sont conservés dans l'issue #39 pour une étape métier ultérieure.
5. **GO séparé exigé** avant toute migration sur Supabase principal, puis **GO distinct** avant fusion \`main\` et publication Vercel Free.

## Suite de recette locale
Dans \`D:\Bakary\10 autres\schoolnet-tests\`, nettoyer uniquement le fichier généré \`tsconfig.app.tsbuildinfo\` (après contrôle), puis suivre la nouvelle branche depuis GitHub, exécuter les 4 commandes QA, ESLint, build et vérifier l'arbre propre. Les tests PostgreSQL complets sont exécutés automatiquement dans GitHub Actions sur service temporaire, sans Docker ou CLI Supabase requis sur Windows.

**Note de sécurité :** l'accès au helper privé \`school_official_general_averages\` est protégé par autorisation serveur à chaque appel; le rôle \`authenticated\` n'implique jamais un droit de consultation scolaire à lui seul.
