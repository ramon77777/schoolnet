# SCHOOLNET V2 — S4-B.3-B.4 : tableau de bord apprenant (cours officiels)

> **Point de situation — 24 novembre 2026**
>
> **Supabase principal :** la migration B.4 `20261124075811` (`schoolnet_s4b3b4_student_official_dashboard`) est installée et vérifiée. Son SQL correspond exactement à `supabase/proposals/s4b3b4_student_official_dashboard.sql`.
>
> **Autorisation actuelle :** l’utilisateur a autorisé la fusion dans `main` et la publication sur le site officiel SCHOOLNET. L’intégration cumulative des PR #27 à #30 est suivie dans la [PR #30](https://github.com/ramon77777/schoolnet/pull/30). L’achèvement du déploiement reste à constater.
>
> Les mentions antérieures « non installé », « non autorisé » ou équivalentes ci-dessous décrivent l’étape de préparation ; elles sont conservées comme historique.

**Branche :** feature/schoolnet-s4b3b4-official-student-dashboard-20261123
**Dependance :** PR #28 en brouillon, commit 6a5b8c05.
**Securite :** aucun changement sur Supabase principal sans autorisation distincte ; pas de fusion main ni de deploiement Vercel.

## Objectif
Le tableau de bord historique compte seulement les inscriptions V1 (course_enrollments), et ignore les cours et remises officiels V2 : l'eleve a donc zero cours/quiz alors que son resultat B.3 est publie.

## Solution
- Nouvelle RPC unique en lecture seule : resume des cours officiels accessibles a auth.uid(), des evaluations officiellement liees et publiees, du statut de la copie propre a l'eleve et du score SEULEMENT apres publication.
- Reutilisation stricte des controles d'acces multi-etablissements B.2 et de la liste de droits B.3-A. Aucune inscription V1 artificielle.
- UI : combinaison avec les donnees V1 sans doublons, nombres corrects, echeances vers les routes V2, detail de cours officiels.
- Differencier progression pedagogique V1 et taux de remise des evaluations ; une seule note ne constitue pas une moyenne scolaire trimestrielle.
- Degradation non destructive en cas de migration B.4 non encore installee : la partie V1 reste utilisable, message d'indisponibilite V2.
- Confidentialite : note et date de publication renvoyees uniquement sur status=published ; aucun feedback, identite, choix correct ou reponse expose par le tableau de bord.

## Recette
1. CI PostgreSQL ephemere A/B et tests contrats Node B.4, lint, build et non-regression B.3.
2. Autorisation distincte avant application de supabase/proposals/s4b3b4_student_official_dashboard.sql sur Supabase principal.
3. Test Windows dans schoolnet-tests : compte TEST SCHOOLNET V2, un cours officiel, un quiz termine et resultat publie 20/20 ; pas de double comptage ni de notes non publiees.
4. Le rollback supabase/verification/s4b3b4_student_official_dashboard_rollback_manual.sql ne touche aucune donnee.
