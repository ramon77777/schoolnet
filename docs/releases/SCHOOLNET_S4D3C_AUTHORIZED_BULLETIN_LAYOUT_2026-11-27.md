# SCHOOLNET V2 — S4-D.3c : bulletin individuel à partir de la projection autorisée

**27 novembre 2026 — développement fonctionnel sur branche dédiée.**
Cette branche s'empile sur S4-D.3b (commit initial `ebd4cc1`). Pas de fusion `main`, de migration Supabase principal ni de publication Vercel.

## Pourquoi
S4-D.3a propose une maquette 100 % fictive dans « Bulletins et exports ». S4-D.3b fournit déjà une projection serveur contrôlée des matières du seul élève sélectionné dans « Moyennes générales officielles ». Plutôt que de copier les moyennes simulées S4-D.3a ou créer une nouvelle RPC, S4-D.3c montre **un bulletin individuel complet mais strictement provisoire** sous cette même fiche élève.

## Parcours
- Admin établissement autorisé → Moyennes générales officielles → contexte école/année/classe/période → Consulter un élève.
- Le même résultat déjà validé par `validateAuthorizedReportCardPreview` alimente deux vues : tableau détaillé S4-D.3b et **maquette de bulletin S4-D.3c**.
- En-tête bulletin et métadonnées du contexte actif ; noms des matières et coefficients, compteurs publiés/inclus, états, moyenne sur 20 et moyenne générale.
- Cas 01 : 16,67 / 20 ; cas 02 : zéro valide 0,00 / 20 ; cas 03 : 2/3 matières, Sciences incomplète, moyenne générale « — ».
- Rang, absences et appréciation **non disponibles** ; le navigateur n'invente aucune valeur.
- Mentions visibles « Aperçu privé », « Document non valable », « Non publié ». Pas d'export PDF, pas de bouton impression, pas de signature, pas de bulletin sauvegardé.

## Sécurité et limites
L'interface n'ajoute aucun appel SQL ; les droits et contrôles A/B restent dans la RPC S4-D.3b **proposée mais non installée**. En absence de cette RPC, affichage « Activation SQL en attente », jamais de données fictives de secours. Les données démonstratives ne sont accessibles qu'avec le mode DEV et l'URL fictive déjà homologués.

Le bulletin est un **aperçu HTML privé**, pas un document officiel. Le rendu peut être prévisualisé en local. Toute activation SQL, génération PDF réelle, émission/publication, fusion `main` et déploiement Vercel requièrent des validations ultérieures distinctes.

## Recette locale Windows
Depuis le worktree `D:\Bakary\10 autres\schoolnet-tests` (état propre requis), exécuter :
```powershell
git status -sb
git fetch origin
git switch -c local/schoolnet-s4d3c --track origin/feature/schoolnet-s4d3c-authorized-bulletin-layout-20261127
git log -1 --oneline
npm run qa:s4d3c
npm run build
git restore -- tsconfig.app.tsbuildinfo
git status -sb
npm run dev
```
Puis ouvrir `http://localhost:5173/app/school/official-general-averages?schoolnet_c3c4_demo=1` avec un compte `school_admin` autorisé. Dans la classe fictive 6e B / T1, utiliser « Consulter » pour les élèves 01, 02 et 03 ; vérifier la présentation complète du bulletin en bas de la fiche et l'absence de toute action de publication. Changer de classe/période pour s'assurer que le bulletin précédent disparaît. Une vérification mobile peut être groupée à cette recette si nécessaire.

## Cycle de livraison
GitHub branche dédiée et PR brouillon → QA CI → recette Windows → validation propriétaire → futures autorisations SQL/merge/production **distinctes** au moment de la livraison consolidée du module S4-D.
