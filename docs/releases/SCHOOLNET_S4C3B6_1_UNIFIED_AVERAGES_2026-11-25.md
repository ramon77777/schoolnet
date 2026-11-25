# SCHOOLNET S4-C.3-B.6.1 — Navigation unifiée des moyennes (25/11/2026)

## Décision validée
Une seule entrée « Moyennes » dans l'espace Enseignant. Le backend détermine les possibilités via les RPC déjà sécurisées : `schoolnet_teacher_official_averages_catalog` pour V2 et `teacher_average_classes` pour V1. Cette vérification ne charge aucune note.

| Affectations | Route /app/teacher/averages |
|---|---|
| V2 seules | Afficher directement la prévisualisation officielle |
| V1 seules | Afficher directement l'ancien module |
| V1 et V2 | Deux onglets, V2 par défaut ; `?tab=free` pour V1 |
| Aucune | Message clair, sans classe inventée |
| Vérification échouée | Refaire l'appel ; ne pas déduire les droits |

## Compatibilité
- `/app/teacher/official-averages` : accès direct V2 toujours autorisé.
- `/app/teacher/averages/free` : accès V1 direct rétrocompatible.
- `TeacherAverages.tsx`, calculs V1, moyennes scolaires sécurisées V2, notes et bulletins : **inchangés**.
- Pour V1, la source couvre les classes historiques ; l'onglet porte donc « Cours libres / historiques ».
- Changement de compte : ne pas afficher la disponibilité d'un autre enseignant.
- Compte Démo : aucun appel au catalogue réel.
- L'interface n'est pas un mécanisme d'autorisation ; les RPC et RLS restent la protection serveur.

## Recette à faire sur schoolnet-tests
1. Synchroniser branche GitHub après sauvegarde des modifications locales et lancer `npm run qa:s4c3b6-1`, `npm run lint`, `npm run build`.
2. Compte enseignant scolaire : un menu « Moyennes », clic -> classe 6e A / Mathématiques / T1, moyenne 20/20.
3. Compte enseignant V1 : clic -> moyennes V1 sans perte de fonctionnalités.
4. Compte mixte : deux onglets, sélection persistante via `?tab=`.
5. Compte sans affectation, erreur réseau, mode mobile : états corrects sans fuite inter-écoles.
6. Conserver les liens directs historiques et contrôler la non-régression.

## Publication
Pas d'installation SQL. Aucune fusion vers main ni publication Vercel avant nouvelle autorisation. Un seul commit de travail est privilégié pour limiter les builds Preview.
