# SCHOOLNET V2 — S4-D.2a — Génération de PDF et Excel sur données fictives

**26 novembre 2026** · PR brouillon empilée sur S4-D.1 / PR #49.  
**Livrable : fichiers PDF et Excel réels à télécharger, mais contenant uniquement des données fictives.** Le raccordement aux résultats scolaires réels n'est **pas** réalisé.

## Objectif

Faire passer SCHOOLNET des simples maquettes de boutons PDF/Excel à des générateurs de **vrais fichiers** vérifiables dans un lecteur PDF et Microsoft Excel, tout en préservant strictement les frontières de sécurité entre les établissements et entre données V1 et V2.

## Ce qui est implémenté

- Modèle strict `schoolFictitiousExportDocument.ts` : le document doit être marqué `SCHOOLNET_LOCAL_FICTITIOUS`, `provisionalOnly: true`, avec des lignes entièrement synthétiques et aucune moyenne pour les élèves incomplets.
- Générateur PDF `schoolFictitiousPdf.ts` : A4, présentation SCHOOLNET bleu marine et indigo, pagination automatique, identification de la classe/année/période, état et complétude, zéro numérique valide, avertissement « RELEVÉ PROVISOIRE - NON PUBLIÉ » et « DONNÉES FICTIVES - TEST LOCAL » répété par page.
- Générateur Excel `schoolFictitiousXlsx.ts` : véritable classeur `.xlsx` OOXML encapsulé en ZIP, feuille unique « Relevé fictif » visible, en-têtes SCHOOLNET, lignes filtrables, entête figée, nombres formatés à deux décimales, absence de formules et de liens externes, protection contre la réinterprétation des textes `= + - @` en formules lors d'une recopie.
- Téléchargement déclenché localement par `schoolFictitiousExportDownload.ts` via `Blob`, uniquement sous `import.meta.env.DEV` et `?schoolnet_s4d_demo=1`.
- Dans le portail `/app/school/official-documents` ou `/app/teacher/official-exports`, deux nouveaux boutons **« Télécharger PDF fictif »** et **« Télécharger Excel fictif (.xlsx) »** sont actifs uniquement si la simulation de droits retourne l'éligibilité du relevé *provisoire* et pour les types **matière** ou **moyenne générale**, selon les droits du rôle. Les boutons d'export réel restent désactivés.
- Les scénarios « autre école », « matière non affectée », « tableau complet d'une classe sans délégation », « annuel sans poids », « document publié sans snapshot » restent interdits.

## Périmètre actuellement exclu

- Aucun export de note scolaire réelle, même si la session est une véritable session `school_admin` ou `teacher` ; seuls les élèves « Élève fictif 01…13 » figurent dans les fichiers.
- Aucun certificat ou bulletin officiel, aucun relevé « publié », aucun journal réel d'export, aucune écriture dans Storage.
- Le tableau détaillé *toutes matières* et les exports annuels sont reportés au volet backend, car leurs projections et règles de pondération ne sont pas encore établies.
- **Aucun appel à V1** (`student_period_averages`, `report_cards`, `publish_admin_report_card`), aucune migration Supabase principal et aucune modification de `main`.
- Même si la règle de simulation « éligible » passe, elle n'est **pas une autorisation serveur**. Le vrai raccordement exigera un contrat RPC sécurisé, journalisation, habilitations et un snapshot approuvé pour les documents publiés.

## Ajustement après inspection des fichiers réellement téléchargés (26 novembre 2026)

L'utilisateur a remis le PDF et le fichier Excel issus du navigateur : le PDF **s'ouvre correctement sur une page A4** ; le classeur Excel **s'ouvre avec une feuille**, 13 lignes de données, filtre et gel de la ligne d'en-tête, avec zéro numérique et cinq moyennes indisponibles non transformées en zéro.

L'inspection a également révélé un point métier : un intitulé **« Moyennes par matière - Mathématiques »** ne doit pas afficher une complétude **« 3/3 matières »** (réservée à la moyenne générale). Le jeu fictif a donc été rendu explicitement cohérent :
- **Relevé d'une matière** → nombre d'**évaluations** complètes et moyenne fictive **spécifique** à la matière ; Mathématiques et Français utilisent des valeurs différentes ;
- **Moyennes générales** → nombre de **matières** complètes et moyennes générales fictives distinctes ;
- la correspondance entre le type de relevé et l'unité de complétude est désormais **obligatoire et validée** avant chaque sérialisation PDF ou Excel ;
- ajout d'un style « Normal » explicite au fichier Excel pour une meilleure compatibilité avec les lecteurs OOXML.

Les anciennes captures et les fichiers téléversés restent la **preuve de la première génération** ; un nouveau contrôle est nécessaire sur les deux formats après ce correctif. Ce changement n'accède toujours à aucune note réelle.

## Recette automatisée

Commande : `npm run qa:s4d2a`.

La suite vérifie le document synthétique (dont `0/20` valide, `null` sur notes manquantes), le blocage du statut publié et d'une école étrangère, l'entête et les offsets internes du PDF, la pagination, les fichiers ZIP Excel, leurs CRC32, les parties OOXML, l'absence de formule Excel exécutable, les valeurs numériques, la séparation des boutons réel/fictif et l'absence de secrets/SQL/déploiement.

La CI exécute aussi `qa:s4d1`, `qa:s4c3c4`, `qa:s4c3c3533`, `qa:s4c3b6-1`, lint et build. Pas de données d'élèves ni de clés Supabase dans GitHub Actions.

## Recette sur le PC Windows

Dans `D:\Bakary\10 autres\schoolnet-tests` :

```powershell
git status -sb
git fetch origin
git switch -c local/schoolnet-s4d2a --track origin/feature/schoolnet-s4d2a-fictitious-pdf-xlsx-renderers-20261126
git log -1 --oneline
npm run qa:s4d2a
npm run build
git status -sb
npm run dev
```

Si `git status -sb` indique `M tsconfig.app.tsbuildinfo` après un build, vérifier la modification, puis restaurer **seulement ce fichier** (`git restore -- tsconfig.app.tsbuildinfo`). Ne jamais faire de `git reset --hard`.

Sous une session `school_admin` et Vite local, visiter :

`http://localhost:5173/app/school/official-documents?schoolnet_s4d_demo=1`

Conserver **Établissement fictif A**, « Moyennes par matière », « Trimestriel », « Provisoire ». En bas, deux boutons dédiés génèrent les fichiers `schoolnet_fictif_releve_provisoire.pdf` et `schoolnet_fictif_releve_provisoire.xlsx`. Vérifier leurs deux ouvertures (PDF dans navigateur/lecteur et XLSX dans Excel), l'affichage des 13 lignes, du zéro, des absences et des mentions de test.

Vérifier ensuite que les deux boutons se désactivent si l'on choisit :
- Établissement fictif B ;
- Période annuelle ;
- Statut « Officiel - publié » ;
- Type « Tableau de classe - toutes matières ».

Le mode test est réservé au développement local. Les boutons réels portant « bientôt » restent désactivés, **même dans le mode fictif**.

## Suite S4-D.2b — condition pour ouvrir de vrais exports

Avant de permettre des exports réels : fabriquer la **projection V2 autorisée** par une RPC dédiée avec RLS ou `SECURITY INVOKER` et helper privé `SECURITY DEFINER` audité ; vérifier à chaque requête l'identité, le rôle, l'établissement, l'affectation enseignant, la délégation spécifique, la classe et la période ; contrôler l'approbation et la publication effective ; journaliser chaque export sans données scolaires nominatives ; puis réaliser les tests A/B Supabase jetables Auth/JWT/PostgREST.

**Aucune étape SQL de production ou fusion `main` n'est autorisée par cette PR.**
