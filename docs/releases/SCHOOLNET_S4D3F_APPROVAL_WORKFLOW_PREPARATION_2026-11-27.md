# SCHOOLNET V2 — S4-D.3f · Préparation du circuit d'approbation des bulletins

**27 novembre 2026.** Suite de S4-D.3e (PR #66), après validation visuelle utilisateur des dossiers fictifs incomplets. Nouvelle branche dédiée empilée ; aucun changement Supabase principal, main ou Vercel.

## Objectif et limites
Préparer, sans la mettre en service, la procédure administrative précédant la publication des bulletins scolaires V2. La source de vérité existante reste le résultat individuel S4-D.3b déjà validé par RPC côté serveur et le précontrôle S4-D.3e. **S4-D.3f n'effectue aucun calcul de moyenne, aucune décision administrative et aucune écriture.**

Les libellés « précontrôle » et « pédagogique complet » décrivent uniquement la complétude des données affichées. Ils ne signifient **jamais** « approuvé », « prêt à publier » ou « publié ».

## Quatre étapes proposées
| Étape | Responsabilité envisageable | État S4-D.3f |
|---|---|---|
| 1. Contrôles pédagogiques | Admin établissement (consultation déjà autorisée) | Précontrôle HTML en lecture seule ; à compléter ou sans anomalie calculatoire |
| 2. Soumission à examen | Demandeur habilité, à désigner | Non activée |
| 3. Décision administrative | Autorité compétente, rôle à définir | Non activée ; éventuel accord, refus motivé ou retour pour correction |
| 4. Publication officielle | Responsable de diffusion, pouvoir à définir | Non activée et distincte de l'approbation |

La séparation des responsabilités, la délégation, les signatures, le droit au refus et la procédure de dépublication **restent des décisions métier à arrêter**, et non des permissions déjà implémentées.

## Critères observables aujourd'hui
- Cohérence élève/établissement/classe/année/période.
- Programme de matières approuvé, coefficients cohérents, projections de l'école et de la classe autorisées.
- Chaque matière attendue possède un résultat calculable ; **0,00/20 est un résultat valide** ; NULL est manquant, jamais remplacé par zéro.
- Une moyenne générale incomplète reste absente et interdit de considérer le précontrôle terminé.
- Les rangs, absences et appréciations ne sont pas renseignés par ce flux : leur caractère obligatoire ou facultatif doit être décidé. Aucune donnée inventée.

Même si tous les critères pédagogiques sont satisfaits, des verrous structurels restent présents :
1. Règles des informations complémentaires à fixer.
2. Autorités et délégations de décision à définir.
3. Version immuable des notes/programme/bulletin à figer côté serveur.
4. Journal append-only d'audit des décisions à installer et sécuriser.
5. Politique de publication, visibilité des parents/élèves, révocation et corrections à approuver.

## Traçabilité future — proposition non installée
Événements candidats : review_submitted, correction_requested, approval_granted, approval_refused, publication_authorized, publication_revoked.

Contrat minimal par événement :
- **Périmètre scolaire** : schoolId, schoolYearId, classId, periodId, studentId (validés côté serveur).
- **Auteur** : actorId authentifié, rôle et affiliation active **recontrôlés à la date de l'action** ; ne jamais se fier à user_metadata ou à un rôle envoyé par le navigateur.
- **Décision** : type d'événement, motif, éventuel lien vers la demande précédente, statut d'examen.
- **Preuve source** : révision immuable du programme approuvé, des résultats publiés et du bulletin ; protection contre une modification de notes après approbation.
- **Horodatage** : date/heure attribuées par le serveur, identifiant d'événement, identifiant de corrélation et version précédente.
- **Confidentialité** : pas de notes brutes, secrets ou pièces personnelles dans les journaux génériques ; droits d'accès explicitement contrôlés par établissement.

**Aucune table, migration, RPC, entrée d'audit, signature, fichier PDF ou autorisation de publication n'est créée par S4-D.3f.** Les champs ci-dessus sont exclusivement des exigences de conception. Un futur développement serveur devra proposer une transaction atomique, une traçabilité append-only, des vérifications d'identité et de portée, la gestion des doublons/idempotence et les permissions RLS avant activation.

## Interface / points d'entrée
Le sous-panneau « Circuit de validation administrative — préparation » est inséré dans le panneau S4-D.3e **après vérification du résultat individuel déjà autorisé**. Il est donc visible sur les deux parcours existants qui réutilisent ce composant :
- /app/school/official-documents (Bulletins et exports).
- /app/school/official-general-averages (fiche individuelle des Moyennes générales).

Il affiche 4 phases, une synthèse pédagogique (« précontrôle » ou « corrections nécessaires »), les conditions bloquantes et les champs de traçabilité proposés. Les états de soumission, décision et publication restent toujours **« Non activé »**, quel que soit le résultat de l'élève. Aucun bouton d'approbation, d'impression, de téléchargement ou de publication n'est présent.

Le mode fictif reste strictement réservé à import.meta.env.DEV avec schoolnet_c3c4_demo=1. Si la RPC individuelle n'est pas disponible en production, le panneau ne s'affiche pas et le message « Activation SQL en attente » du sous-lot précédent reste applicable.

## CI et recette Windows ciblée
Le workflow GitHub Actions lance qa:s4d3f, les tests de non-régression S4-D.3a/e, les exports fictifs existants, lint et build.

Worktree utilisateur existant : D:\Bakary\10 autres\schoolnet-tests. Depuis un dépôt propre :

~~~powershell
git status -sb
git fetch origin
git switch -c local/schoolnet-s4d3f --track origin/feature/schoolnet-s4d3f-approval-workflow-preparation-20261127
git log -1 --oneline
npm run qa:s4d3f
npm run build
git restore -- tsconfig.app.tsbuildinfo
git status -sb
npm run dev
~~~

Ouvrir http://localhost:5173/app/school/official-documents?schoolnet_c3c4_demo=1 en restant connecté comme admin d'établissement réel dans le DEV local.

**Tests visuels nouveaux uniquement :** sélectionner l'élève fictif 01 (contrôle pédagogique satisfaisant, mais phases 2 à 4 non activées), puis l'élève fictif 03 (contrôle préalable avec corrections à faire, phases 2 à 4 non activées). Vérifier aussi la présence des exigences d'audit et l'absence de bouton d'approbation/publication. Ne pas rejouer les recettes antérieures clôturées.

## Livraisons et décisions à obtenir ultérieurement
PR S4-D.3f en brouillon, empilée sur #66 → #65 → #64 → #63. Preview Vercel désactivée. Aucun GO SQL, aucune fusion main ni déploiement production. La validation locale porte **uniquement sur cette préparation fonctionnelle**, pas sur un circuit d'approbation opérationnel. La définition des rôles habilités, de la politique de publication et du journal d'audit doit être approuvée explicitement avant de créer les tables/RPC associées.
