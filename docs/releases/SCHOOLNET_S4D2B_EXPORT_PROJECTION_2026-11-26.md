# SCHOOLNET V2 — S4-D.2b — Projection serveur sécurisée des relevés provisoires

**26 novembre 2026** · Projet SCHOOLNET · **PR brouillon empilée sur #50**, sans publication. Cette proposition SQL ne doit PAS être exécutée sur Supabase principal.

## Objet et limite précise

Cette livraison prépare le **premier endpoint serveur scolaire pour les exports**, sans encore activer les téléchargements de notes réelles : une projection V2 limitée aux seuls résultats déjà autorisés, consultée avec de véritables jetons GoTrue sur un environnement Supabase jetable. Il n'existe encore **aucun téléchargement PDF/XLSX scolaire réel** et aucun bulletin officiel publié.

Les règles de la demande « Exports des moyennes » restent enregistrées : PDF et Excel (.xlsx), établissement/année/classe/période, provisoire distinct d'officiel, enseignant limité à ses cours, et dérogation spécifique exigée pour une synthèse générale. Les exports **annuels** restent fermés tant que la pondération annuelle approuvée et la complétude de toutes les périodes n'ont pas été certifiées. Les bulletins V1 ne sont pas appelés.

## Couverture exacte de cette première RPC

| Demande | Résultat S4-D.2b |
|---|---|
| Administrateur de son établissement → moyenne générale d'une classe et période approuvée | Projection **provisoire** autorisée côté serveur |
| Enseignant affecté → moyenne d'une matière et période configurée | Projection **provisoire** autorisée côté serveur |
| Administrateur → moyenne par matière | **Refusé pour l'instant**, source V2 admin-par-matière dédiée à préparer |
| Enseignant → tableau toutes matières ou moyenne générale | **Refusé**, la délégation spécifique distincte du coefficient reste à concevoir et tester |
| Tableau toutes matières | **Non pris en charge** par ce premier endpoint |
| Annuel | **Non pris en charge** sans poids officiels validés |
| Document officiel « publié » | **Refusé** sans snapshot immuable d'une véritable publication |
| PDF et Excel | Le format est contrôlé et tracé, **aucun vrai fichier scolaire n'est produit à cette étape** |

Le nouveau SQL candidat est `supabase/proposals/s4d2b_official_export_provisional_preview.sql`. Il réutilise sans les modifier les fonctions déjà proposées et auditées `schoolnet_private.school_official_general_averages` et `schoolnet_private.teacher_official_subject_averages`, leurs propres gardes de rôle/affiliation active/école/classe/année/période, les règles d'approbation et la validité des notes publiées. Les notes brutes, copies, enseignants, réponses et évaluations ne quittent jamais ces fonctions.

### SECURITY — contrôles fail-closed

Le wrapper public `schoolnet_official_export_preview` est `SECURITY INVOKER`, un helper privé `SECURITY DEFINER SET search_path=pg_catalog` vérifie à nouveau `auth.uid()`, le rôle exact issu des profils et l'affiliation scolaire active, puis le périmètre retourné par la fonction métier. L'exécution est retirée à `anon` et `PUBLIC` ; `authenticated` seul peut invoquer, sans être autorisé automatiquement.

La projection retourne les seules clés : source/type, état provisoire, année/école/classe/période, matière facultative, unité de complétude, identifiant de préparation, nombre d'élèves et six champs par élève : identifiant technique, nom, état, moyenne /20 ou null, compte complet et attendu. Le zéro valide reste 0 ; une moyenne incomplète n'est **jamais** remplacée par zéro. La limitation à 250 élèves reprend le périmètre maximal du noyau SQL existant.

Un journal privé `schoolnet_private.school_export_preview_audit` conserve uniquement les métadonnées des préparations **réussies** (acteur, établissement, année, classe, période, matière, type, format, statut, nombre d'élèves, date et identifiant) ; aucune note, aucun nom ni identifiant d'élève, aucun secret ou lien de fichier. RLS activée, aucune policy ni lecture directe client. Les refus font échouer la transaction **sans trace persistante dans cette table** : une journalisation des refus nécessite un canal indépendant à définir, plutôt que de prétendre qu'une exception SQL écrit durablement un log.

Le contrat TypeScript `schoolOfficialExportProjectionModel.ts` refuse les champs supplémentaires, les établissements/classes/périodes étrangères, les états falsifiés, l'incohérence des unités (« évaluations » pour une matière, « matières » pour une moyenne générale), les doublons d'élèves, les scores négatifs ou supérieurs à 20, et toute moyenne pour un dossier incomplet. **Ce validateur n'est pas un contrôle d'autorisation serveur.**

## Recette isolée sans toucher aux données utilisateurs

Le workflow `.github/workflows/schoolnet-s4d2b-secure-export-ci.yml` comporte deux jobs :
1. Contrats et régressions : `qa:s4d2b`, `qa:s4d2a`, `qa:s4d1`, `qa:s4c3c4`, lint et build.
2. Tests HTTP Auth/JWT/PostgREST **réels mais jetables** : démarrage de Supabase local dans GitHub Actions, construction du schéma synthétique et des SQL candidats précédents, dix comptes fictifs GoTrue, séparation A/B, refus des rôles et membres révoqués, calcul/0/null, contrôle strict des champs, vérification du journal privé et absence de mutation des notes. Destruction des conteneurs/volumes en fin de job.

Les fixtures sont des jeux **synthétiques**, pas une copie de la base de production. Aucune authentification Supabase principale, aucune clé hébergée, aucune restauration de données privées. Les SQL de la chaîne C.3-C demeurent des **propositions non certifiées comme migrations historiques** ; ne pas réparer leur numérotation artificiellement.

## Après CI — recette locale sur Windows

Depuis `D:\Bakary\10 autres\schoolnet-tests` :

~~~powershell
git status -sb
git fetch origin
git switch -c local/schoolnet-s4d2b --track origin/feature/schoolnet-s4d2b-secure-export-projection-20261126
git log -1 --oneline
npm run qa:s4d2b
npm run build
git status -sb
~~~

Si `tsconfig.app.tsbuildinfo` est la seule modification générée, examiner puis restaurer ce fichier précis avant un nouveau `git status -sb`. **Aucun test de cette étape n'exige Docker ni accès à PostgreSQL sur Windows**, car l'intégration SQL réelle est exécutée dans la CI jetable.

## Prochain sous-lot autorisé seulement après validation

S4-D.2c : connexion de l'interface de génération de fichiers à la **projection autorisée**, avec choix du format, gestion des erreurs, règles d'édition et tests réels A/B ; puis implémentation des sources manquantes (matières pour admin, tableau complet / délégations spécifiques). La génération / conservation / diffusion des documents **officiellement publiés** exige un snapshot signé et immuable et un workflow de publication distinct (S4-D.3).

**Portes fermées :** aucun \`main\` merge, aucun déploiement Vercel, aucune migration/écriture sur Supabase principal, aucune production PDF/Excel avec données réelles, aucune activation des relevés annuels ou des bulletins. La PR reste brouillon.
