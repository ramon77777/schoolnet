# SCHOOLNET V2 — S4-D.1 — Bulletins et exports des moyennes (socle de sécurité)

**Date : 26 novembre 2026** · **Statut :** branche de développement / PR en brouillon · **Portée :** conception exécutable + interface de préparation fictive uniquement.

## 1. Audit de l'existant — résultats documentés

**Bulletins V1 à préserver sans les appeler pour la V2 :**

| Ancien module | Fonctions vérifiées | Décision V2 |
|---|---|---|
| `src/features/report-cards/lib/adminReportCardsApi.ts` | `get_admin_report_cards`, `generate_report_cards_for_class`, `publish_admin_report_card` | Ne pas réutiliser : contrats historiques du rôle global `admin`, bases `report_cards` / `student_period_averages` non scindées par établissement |
| `src/features/report-cards/lib/teacherReportCardsApi.ts` | `get_teacher_report_card_subjects` / commentaires | Ne pas fusionner avec la nouvelle chaîne d'évaluations et notes V2 |
| `src/features/report-cards/lib/parentReportCardsApi.ts` et `studentReportCardsApi.ts` | Liste + détail des bulletins V1 | Garder accessibles selon leurs droits actuels, sans leur attribuer de faux résultats V2 |
| `src/features/attendance/lib/attendanceApi.ts` / `adminAttendanceApi.ts` | `attendance_sessions`, `attendance_records`, justificatifs | Ne pas afficher un agrégat local d'établissement avant preuve des liaisons et RLS multi-écoles |

Audit antérieur dans l'issue #39 : les bulletins historiques reposent sur `student_period_averages`, `grading_periods` et l'ancien rôle `admin` ; `report_cards` ne porte pas directement de `school_id`. Les écritures de V1 ne sont pas des substitutions valides aux futures RPC scolaires V2. Une génération V2 nécessite son propre modèle scolaire, un snapshot de notes/présences validé et la séparation stricte des établissements.

**Fonctions V2 déjà préparées (PR #41 à #48), ne pas refaire :** le noyau SQL calculant les moyennes pondérées, les catalogues de matières approuvés, les RPC de consultation `schoolnet_school_official_general_averages` et `schoolnet_teacher_official_subject_averages`, la recette Auth/JWT isolée et l'interface école C.3-C.4. Le SQL des moyennes générales et du référentiel est **non installé sur Supabase principal** ; la restauration Auth/DB/Storage de production reste un jalon séparé.

## 2. Extension « Exports des moyennes » — périmètre approuvé

L'extension PDF / Excel (.xlsx) est une fonctionnalité scolaire distincte du **bulletin officiel**. Elle couvre :

| Relevé demandé | Enseignant | Administrateur d'établissement |
|---|---|---|
| Moyennes d'une matière par trimestre | Matières et classes officiellement affectées | Toutes les matières/classes de son école |
| Moyennes d'une matière par semestre | Même règle ; semestre configuré | Même règle |
| Moyennes d'une matière sur l'année | Même règle après validation des poids annuels | Même règle |
| Tableau d'une classe, toutes matières | **Délégation pédagogique spécifique** | Autorisé pour ses classes |
| Moyennes générales de classe | **Délégation pédagogique spécifique** | Autorisé pour ses classes |
| Format | PDF imprimable et Excel .xlsx | PDF imprimable et Excel .xlsx |

**Interdit :** considérer la délégation technique de saisie/modification d'un coefficient comme une autorisation à lire ou exporter les résultats d'un collègue. Toute délégation de synthèse doit être spécifique, tracée, révocable et revalidée côté serveur.

**Filtres obligatoires pour toute projection :** établissement autorisé, année scolaire, classe, et période effectivement configurée. Le cas annuel conserve les années/classe/école mais n'est possible qu'avec une **pondération annuelle explicitement approuvée**, la complétude des périodes requises, et des règles d'exemption/transfert documentées. Ne jamais créer artificiellement T3 ou S2 ni agréger des moyennes déjà arrondies.

**Données minimales à exporter, selon le droit accordé :** identité scolaire autorisée (nom et/ou matricule validé), nom d'école, classe, année, période, matière, coefficient, moyenne sur 20 ou « — » (jamais 0 pour une note manquante), état de complétude, date, origine et statut de publication. Pas de copie, réponse libre, téléphone, email, token ou note brute, et aucune métadonnée cachée dans le .xlsx.

**Séparation des états :**
- `provisional` → en-tête et filigrane « RELEVÉ PROVISOIRE — NON PUBLIÉ » sur chaque page/feuille ;
- `published` → UNIQUEMENT depuis un **snapshot serveur immuable, signé/traçable et lié à une publication effective** ; pas à partir d'une prévisualisation actuelle ou du booléen de période seul ;
- l'enseignant/administrateur ne peut ni publier un bulletin ni dévoiler des notes supplémentaires via une simple action de téléchargement.

## 3. Contrat exécutable déjà ajouté dans ce sous-lot

`src/features/official-documents/lib/schoolOfficialExportPlanning.ts` définit et teste :
- les 3 types `subject_period` / `class_subjects` / `class_general` ;
- les 3 rythmes `trimester` / `semester` / `annual` ;
- les 2 formats `pdf` / `xlsx` ;
- les 2 états `provisional` / `published` ;
- les refus explicites hors établissement, membre révoqué, matière non affectée, délégation de synthèse absente, période absente, pondération annuelle inconnue, publication non prouvée ;
- un statut `eligibleForServerReview` qui **NE vaut jamais autorisation effective d'accès**. `realDownloadAvailable` reste toujours `false`.

L'interface `src/features/official-documents/pages/SchoolOfficialDocumentsHub.tsx` est intégrée **aux menus enseignant et administrateur d'établissement**, sous des routes distinctes protégées par leurs `RoleGate`. Elle affiche le référentiel de droits et un assistant interactif **100 % fictif en mode Vite DEV**, sans notes nominatives et sans appels Supabase. Les boutons PDF/XLSX sont volontairement désactivés pour l'instant : ne pas présenter ce sous-lot comme un générateur PDF ou Excel terminé.

Aucun fichier .pdf ou .xlsx n'est généré dans S4-D.1. Cette décision évite d'exposer les relevés à travers le navigateur avant le développement des RPC d'export dédiées. Elle ne modifie aucun bulletin historique.

## 4. SECURITY — chaîne serveur requise avant l'export réel

1. Créer une projection d'export **server-side** dédiée (pas une lecture directe de tables de notes), `SECURITY INVOKER` ou helper privé `SECURITY DEFINER` audité ; session Supabase vérifiée, statut de membre actif, établissement/classe/année/période et matière/délégation contrôlés pour **chaque requête**, refus anonyme et révoqué.
2. Journaliser chaque export avec heure, auteur, type, école, période, succès/échec et identifiant technique, **sans** journaliser les données personnelles, notes ou URL privées.
3. Produire le PDF et le véritable Excel `.xlsx` depuis un modèle de données validé, avec entêtes et charte SCHOOLNET ; pas de lien public permanent, fichiers privés ou téléchargement éphémère selon les capacités d'hébergement.
4. Tests : école A/B, enseignant d'une autre classe/matière, parent/élève, membre révoqué, délégation technique coefficient seule, publication inexistante, notes incomplètes, annuel sans poids, noms Excel commençant par des caractères de formule (= + - @), données cachées et fichiers malveillants. Le client ne remplace jamais ces contrôles.

**Aucun** ancien appel `generate_report_cards_for_class`, `publish_admin_report_card` ou `student_period_averages` ne peut être branché dans une page `school_admin` V2. Les bulletins V1 restent disponibles dans les écrans historiques correspondants, sous leurs protections existantes.

## 5. Plan de livraison S4-D, sans revenir sur les sous-lots validés

- **S4-D.1 (cette PR)** : audit, matrices de droits PDF/XLSX, routes isolées, formulaire et diagnostic fictif, QA sur Windows et GitHub.
- **S4-D.2** : projection scolaire V2 sécurisée et contrôles SQL/tenants sur infrastructure jetable ; aucune donnée de production. Préparer ensuite le générateur PDF/XLSX et les fixtures de rendu.
- **S4-D.3** : workflow bulletins V2 `draft → reviewed → published` avec snapshot immuable, droits administrateur, modèle officiel, liens parents/élèves seulement après publication ; recette séparée.
- **S4-D.4** : vues présences V2 par école/classe/année, contrôles des justifications et absence de confusion avec décisions disciplinaires ; raccordement aux bulletins sans inventer de règles d'assiduité.

La granularité pourra être ajustée selon les tests ; les opérations de production ne sont pas autorisées automatiquement par cette feuille de route.

## 6. Recette locale — simulation sans réseau scolaire

**Depuis `D:\Bakary\10 autres\schoolnet-tests` sous Windows PowerShell :**

~~~powershell
git status -sb
git fetch origin
git switch -c local/schoolnet-s4d1 --track origin/feature/schoolnet-s4d1-reportcards-exports-foundation-20261126
git log -1 --oneline
npm run qa:s4d1
npm run build
git status -sb
npm run dev
~~~

Si la branche locale existe déjà, utiliser `git switch local/schoolnet-s4d1` au lieu de `-c`. Si l'arbre n'est pas propre avant bascule, **ne pas écraser les modifications**. Si le build ne modifie que `tsconfig.app.tsbuildinfo`, examiner le diff puis restaurer ce fichier seul s'il n'y a pas de modification voulue.

URLs de recette sous session `school_admin` ou `teacher` (en Vite local) :
- `http://localhost:5173/app/school/official-documents?schoolnet_s4d_demo=1`
- `http://localhost:5173/app/teacher/official-exports?schoolnet_s4d_demo=1`

Tester : refus de l'école fictive B, enseignant seulement affecté aux mathématiques, synthèse refusée à enseignant sans délégation, annualité bloquée, demande « officiellement publié » refusée sans snapshot, formats PDF/Excel présents mais boutons inactifs. Sans paramètre DEV, seuls les prérequis sont affichés et aucun fichier scolaire n'est téléchargé.

La CI vérifie aussi les tests C.3-C.4, C.3-C.3.5.3.3 et C.3-B.6.1, lint et compilation. GitHub Actions ne doit contenir aucune clé ni donnée d'élève réelle.

## 7. Portes de livraison maintenues fermées

- **Supabase principal** : aucune nouvelle migration ni autorisation d'accès accordée ;
- **GitHub `main`** : aucune fusion (PR #40 à #48 empilées, nouvelle PR brouillon) ;
- **Vercel** : Preview désactivée sur la branche, aucune publication ;
- **Document officiel** : aucune génération, signature ou publication réelle ;
- **Exports réels** : PDF et Excel explicitement **non actifs** jusqu'à la projection serveur sécurisée et les tests.

**Méthode inchangée :** enregistrer sur GitHub → CI → synchroniser `schoolnet-tests` → valider la recette Windows et l'écran fictif → décider du sous-lot suivant ; GO SQL et GO de fusion distincts.
