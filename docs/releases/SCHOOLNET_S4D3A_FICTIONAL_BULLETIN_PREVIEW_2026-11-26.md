# SCHOOLNET V2 — S4-D.3a
## Prévisualisation interactive d'un bulletin scolaire individuel V2 — données 100 % fictives

**26 novembre 2026 — retour au travail fonctionnel demandé par l'utilisateur.**

### Point de départ confirmé

La fiche individuelle S4-C.5, intégrée à l'écran **Moyennes générales officielles**, a été vérifiée sur Windows (commit `2433774`, **9/9 tests**, compilation réussie) et dans le navigateur. L'utilisateur a explicitement confirmé « Tout est ok » pour les derniers contrôles : moyenne fictive égale à **0,00**, élève incomplet sans moyenne et fermeture après changement de classe/période.

**Décision : S4-C.5 validé.** Cette étape ne relance pas les audits SQL ni les préparatifs de sauvegarde. La priorité est le bulletin V2.

### Ce qui est réellement ajouté

L'écran existant **`/app/school/official-documents`**, intitulé « Bulletins et exports des moyennes », reçoit une nouvelle section **« Prévisualisation d'un bulletin scolaire »**, sans nouvelle route.

En mode **DEV uniquement**, un administrateur d'établissement connecté avec un compte autorisé peut sélectionner l'un des **13 élèves fictifs** dans la liste. Une maquette de bulletin individuel s'affiche avec :

- en-tête SCHOOLNET V2, établissement, année scolaire, classe et trimestre fictifs ;
- nom de l'élève, état de calcul et complétude des matières ;
- trois matières du catalogue fictif déjà approuvé : **Mathématiques (coef. 2), Français (coef. 1), Sciences (coef. 1)** ;
- moyennes par matière **explicitement simulées pour l'illustration**, cohérentes avec la moyenne générale fictive existante ;
- moyenne générale déjà validée par la fixture : zéro valide préservé, aucun résultat inventé pour les élèves incomplets ;
- rang, absences et appréciation **marqués « Non disponible »**, jamais inventés ;
- avertissements **« SPÉCIMEN FICTIF »**, **« DOCUMENT NON VALABLE »** et « non publié » répétés dans le bulletin.

Cette maquette représente **la disposition visuelle d'un bulletin**, pas un document officiel ni une projection serveur des notes par matière. Les valeurs illustratives par matière ne sont **pas des évaluations d'enseignants**, pas des moyennes de l'API et ne doivent jamais être utilisées pour le calcul réel d'un bulletin.

### Parcours de recette locale

Sur la branche validée, exécuter `npm run dev`, puis ouvrir avec une session **`school_admin` réelle et autorisée** :

`http://localhost:5173/app/school/official-documents?schoolnet_s4d_demo=1`

La route utilise **l'indicateur DEV existant** `schoolnet_s4d_demo=1`. Le contrôle `import.meta.env.DEV`, le test `!user.isDemo`, le rôle `school_admin` et le `RoleGate` de l'application sont préservés. Sans ces conditions, **la maquette fictive est absente**. Un enseignant ne voit pas cette maquette de bulletin de classe.

Vérifications fonctionnelles proposées :

1. Le bulletin de l'**élève fictif 01** s'affiche avec son nom, ses trois matières et une moyenne générale fictive cohérente. Les notes par matière sont visiblement indiquées comme **illustratives**.
2. Sélectionner **l'élève fictif 02** : sa moyenne doit rester **0,00 / 20**, et les trois notes illustratives doivent également être à zéro, jamais « non disponible ».
3. Sélectionner un élève **« À compléter »** : toutes les valeurs par matière sont « — » et la moyenne générale est **absente**.
4. Sélectionner un élève **« À configurer »** : même comportement, sans valeur inventée.
5. Vérifier le rendu sur écran mobile : en-tête, identité et synthèse adaptatifs ; tableau des matières défilant horizontalement si nécessaire.
6. Vérifier l'absence de boutons **Publier, Imprimer, Télécharger un bulletin**. Les anciens téléchargements de **relevés fictifs PDF/Excel** appartiennent à un autre test et restent inchangés.

### Isolation et sécurité

- **Aucun nouveau SQL, aucune nouvelle RPC, aucune modification Supabase principal, aucune migration.**
- Toutes les données proviennent **uniquement** de `makeDemoGradeConfig`, `makeDemoCurriculum` et `makeDemoGeneralPreview`, préexistants dans SCHOOLNET. La maquette ne reçoit ni note brute, ni compte d'élève réel, ni dossier V1.
- Le modèle sélectionne seulement un `studentId` parmi le périmètre fixe **Établissement fictif A / 6e B / 1er trimestre**. Un identifiant de l'établissement fictif B ou un identifiant arbitraire échoue.
- Les contrôles des données (classe, année, période, état `approved`, `isOfficialCurriculum`, `isOfficialGeneralPreview`) et des coefficients de la fixture refusent toute incohérence.
- **Calcul illustratif de présentation :** pour un élève fictif calculable, trois notes simulées sont dérivées algébriquement de la moyenne générale fictive existante en conservant la pondération 2:1:1. Elles permettent uniquement de vérifier l'apparence d'un tableau de bulletin. Pour les élèves incomplets/non configurés : aucune note simulée.
- Aucune fonction d'impression ou d'export de bulletin, aucun déclenchement de notification, aucune modification de note, aucune publication.
- Les exports scolaires réels restent bloqués avec `SCHOOLNET_REAL_EXPORTS_RELEASED = false`. La PR reste **brouillon**, la branche désactivée sur Vercel, aucune fusion `main`.

### Fichiers livrés

- `src/features/official-documents/lib/schoolFictionalReportCardPreview.ts` : modèle de bulletin fictif, filtrage du périmètre et vérification de cohérence de l'illustration.
- `src/features/official-documents/pages/SchoolFictionalReportCardDemo.tsx` : maquette premium, responsive et interactive.
- `src/features/official-documents/pages/SchoolOfficialDocumentsHub.tsx` : affichage conditionnel dans l'écran existant, **DEV + school_admin uniquement**.
- `scripts/test-schoolnet-s4d3a-fictional-bulletin.mjs` : contrôles de la fixture, cohérence, zéro, valeurs nulles, isolation A/B, absence d'export et garde de rôle, avec normalisation CRLF sur Windows.
- `.github/workflows/schoolnet-s4d3a-fictional-bulletin-ci.yml` : QA ciblée, non-régression fonctionnelle S4-C.5, lint et compilation.

**Étape suivante, après validation visuelle :** concevoir la **projection V2 réellement autorisée pour un bulletin** (matières, coefficients, résultats, appréciations et présence) en conservant le verrou de publication. Aucun réel bulletin n'est activé par cette maquette.
