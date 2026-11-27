# SCHOOLNET V2 — S4-D.3h : projet de politique d'approbation et de publication

**Version : proposition de travail du 27 novembre 2026.** Base de travail : S4-D.3b (projection élève contrôlée), S4-D.3e (précontrôle pédagogique), S4-D.3f (circuit préparatoire) et S4-D.3g (matrice des rôles). **Aucune règle métier ci-dessous n'a été adoptée par l'utilisateur ou un établissement, aucun droit n'est accordé.**

## 1. Objet et frontière

Cette livraison convertit **les sept décisions métier encore ouvertes** en clauses proposées, explicite leurs préconditions et prépare un **contrat de transitions** pour une implémentation ultérieure. Ce contrat n'est pas un workflow actif et ne saurait fonder une autorisation d'émission de bulletins. L'état « résultat calculable » ne signifie ni « dossier approuvé » ni « prêt à publier ».

Les rôles existants de SCHOOLNET demeurent inchangés : admin, school_admin, teacher, student, parent. Les futurs responsables de soumission, décision, publication et retrait sont des **habilitations à définir**, pas de nouveaux rôles reconnus par l'application.

## 2. Sept clauses à valider explicitement

| # | Clause | Règle proposée, **non approuvée** | Point à arbitrer avant toute implémentation |
|---|---|---|---|
| 1 | Demande de validation | Demandeur de l'établissement, expressément délégué pour la soumission et le périmètre scolaire ; version figée | Administrateur d'établissement seulement ou autre responsable pédagogique habilité ? |
| 2 | Approbation/refus | Décideur désigné, distinct du demandeur ; approbation, refus ou demande de correction motivés | Qui détient ce pouvoir ? Suppléants, exceptions, délégations ? |
| 3 | Publication/retrait | Autorisation de diffusion indépendante d'une approbation ; aucune publication automatique | L'approbateur et le responsable de diffusion doivent-ils être deux personnes distinctes ? |
| 4 | Délégations | Droit nominatif, borné par établissement, action, période de validité et portée scolaire, révocable | Qui délègue ? Quelles durées et étendues par année/classe/période ? |
| 5 | Mentions complémentaires | Définir le caractère obligatoire ou facultatif des rangs, absences, appréciations, signatures, sans valeur inventée | Selon quelles règles officielles applicables et cycles scolaires ? |
| 6 | Corrections/retrait | Une correction de données invalide l'ancienne décision et impose un réexamen ; garder les traces | Qui retire, dans quels délais, avec quels effets sur les copies déjà publiées ? |
| 7 | Consultation familiale | Après publication réelle uniquement ; élève autorisé à son seul bulletin, parent aux enfants dont le lien est vérifié | Cas de tutelle, calendrier, accès après retrait, droits parentaux particuliers ? |

**Statut initial : 7 propositions / 0 adoption, pour chaque établissement.** La simple consultation de ce panneau ou la validation d'une recette technique ne vaut pas acceptation métier des clauses.

## 3. Circuit des événements proposé

Les transitions suivantes sont des **hypothèses de conception**, toutes désactivées et non exécutées :

| Événement envisagé | État de départ → arrivée | Garde minimale |
|---|---|---|
| review_submitted | draft → submitted | Précontrôle, habilitation, version figée |
| correction_requested | submitted → correction_requested | Demande de correction motivée et horodatée |
| approval_refused | submitted → refused | Décision motivée |
| approval_granted | submitted → approved | Décideur autorisé, différent du demandeur, version intacte |
| publication_authorized | approved → authorized_for_publication | Habilitation spécifique à la diffusion |
| publication_executed | authorized_for_publication → published | **Nouvel événement proposé, non adopté**, exécution atomique et preuve de diffusion |
| publication_revoked | published → withdrawn | Autorité de retrait, motif, révocation des accès |

**Important :** `publication_authorized` et `publication_executed` représentent deux opérations distinctes ; un accord n'émet pas le bulletin. L'événement `publication_executed` **n'existe pas dans le contrat d'événements S4-D.3f antérieur** : il est proposé ici et nécessite un arbitrage contractuel supplémentaire.

Le retour de correction vers un nouveau brouillon, le refus suivi d'une nouvelle demande, les décisions concurrentes, la modification d'une version en cours d'examen et les délais de publication **restent à modéliser avant la mise en œuvre du workflow réel**. Les sept transitions ci-dessus ne sont donc pas un automate complet autorisé.

## 4. Garanties nécessaires avant développement serveur

1. **Habilitation active :** vérifier l'identité de l'auteur depuis le contexte d'authentification et sa délégation nominative côté serveur, pas depuis une valeur envoyée par le navigateur ni des métadonnées utilisateur modifiables.
2. **Périmètre :** revoir école, année, classe, période, élève, affiliation et statut actif à chaque décision ; empêcher toute consultation ou action inter-établissements non autorisée.
3. **Séparation des pouvoirs :** empêcher le demandeur d'approuver sa propre demande dans le modèle proposé ; décider si l'approbateur peut aussi être chargé de la diffusion.
4. **Version figée :** décisions liées à un instantané immuable des matières, coefficients et moyennes réellement publiées ; versions périmées refusées.
5. **Transactions :** atomicité de la décision et du journal, gestion des requêtes répétées, de l'idempotence et de la concurrence.
6. **Traçabilité :** événement append-only horodaté côté serveur (acteur, permission effective, portée, décision, motif, révision, corrélation), sans recopier les notes brutes dans un journal générique.
7. **Publication et familles :** aucun PDF officiel, accès parent/enfant ou bulletin diffusé avant émission explicitement autorisée ; politique de retrait et révocation à implémenter.

Aucune migration, table, RPC, politique RLS, journal réel ou permission nouvelle n'est incluse. L'ancienne RPC S4-D.3b demeure non installée sur Supabase principal et aucune donnée ne doit être déduite des fixtures fictives.

## 5. Livrable et recette

Le panneau repliable **« S4-D.3h — Politique d'approbation et de publication — projet »** est intégré sous S4-D.3g, donc exclusivement dans le parcours d'un compte school_admin avec projection individuelle vérifiée. Il présente les sept clauses, les points à arbitrer, les sept transitions toutes « Désactivé » et les sept garanties serveur.

Contrairement à un véritable module de paramétrage, il n'offre **aucune possibilité de modifier un statut, d'adopter une clause, de déléguer des droits ou de publier**. Ce document de travail ne remplace pas une décision de l'établissement.

GitHub Actions : `qa:s4d3h` puis toutes les non-régressions S4-D.3g jusqu'à S4-C.5, lint et build.

Sur Windows, uniquement après CI réussie, à partir du worktree propre `D:\Bakary\10 autres\schoolnet-tests` :

~~~powershell
git status -sb
git fetch origin
git switch -c local/schoolnet-s4d3h --track origin/feature/schoolnet-s4d3h-publication-policy-draft-20261127
git log -1 --oneline
npm run qa:s4d3h
npm run build
git restore -- tsconfig.app.tsbuildinfo
git status -sb
npm run dev
~~~

Ouvrir `http://localhost:5173/app/school/official-documents?schoolnet_c3c4_demo=1` sous le compte administrateur d'établissement déjà utilisé en recette. Sélectionner **Élève fictif 01**, descendre à **S4-D.3g**, puis ouvrir le sous-panneau **S4-D.3h**. Vérifier **7 clauses proposées, 0 validée, 7 transitions désactivées, aucune action réelle**. Ne pas répéter les recettes des sous-lots clos ni demander de tests supplémentaires de notes.

## 6. Suivi et verrou de livraison

Branche dédiée et PR brouillon S4-D.3h empilée sur #68 → #67 → #66 → #65 → #64 → #63 ; Vercel Preview désactivé. **Pas de fusion dans main, migration Supabase principal, déploiement Vercel ou publication officielle.**

Avant de coder un circuit réel, les responsables doivent arbitrer les sept clauses, approuver la version finale du règlement des bulletins et autoriser séparément la conception des permissions, du stockage immuable et de l'audit serveur. Les développements ultérieurs demanderont une recette de sécurité isolée.
