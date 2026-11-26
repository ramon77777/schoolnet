# SCHOOLNET V2 — S4-D.3b · Bulletins V2 : lignes de matières autorisées

**Date : 26 novembre 2026.** Étape **fonctionnelle** suivant S4-D.3a (maquette fictive validée sur ordinateur avec élèves 01, 02 et 03). PR brouillon empilée sur #62 ; **aucun déploiement**, aucune migration sur Supabase principal et aucun export réel.

## Problème métier résolu

Le bulletin fictif S4-D.3a montrait des moyennes de matières **inventées pour la mise en page**. Le noyau C.3-C.3.2 sait pourtant calculer des moyennes par matière avec `NUMERIC` et les bons coefficients. Sa RPC C.3-C.3.3 de moyenne générale retourne seulement un total par élève. Il faut une lecture unitaire, sécurisée et vérifiable des matières, sans prendre des notes d'enseignants dans une API directe ni recalculer les moyennes dans le navigateur.

## Nouveau parcours

Dans **Moyennes générales officielles** (`/app/school/official-general-averages`), l'administrateur d'établissement choisit déjà son établissement, année, classe et période. Lorsqu'il clique sur **Consulter** dans la fiche d'un élève, un second tableau **Détail des matières pour le bulletin** affiche :

- Matière officielle du programme **approuvé** et son coefficient effectif ;
- Nombre d'évaluations incluses et effectivement publiées (compteurs uniquement) ;
- État **Calculable / À compléter / Non configurée**, et la moyenne/20 seulement lorsqu'elle est calculable ;
- Moyenne générale **inchangée, non publiée**, correspondant exactement à la projection générale déjà autorisée.

L'affichage garde les données de l'élève sélectionné **dans la même portée** (établissement/année/classe/période/compte/révision). En changeant de classe, de période, d'établissement, de compte ou d'élève, les résultats précédents disparaissent **immédiatement**, avant le prochain chargement. Une réponse hors portée, falsifiée ou incompatible est entièrement refusée.

**Important :** une moyenne de matière déjà calculable peut être visible lorsque la moyenne générale de l'élève reste incomplète. Les notes réellement manquantes demeurent **NULL / « — »**, jamais zéro. Une vraie moyenne `0,00 / 20` reste affichée.

## Côté serveur — proposition SQL non installée

`supabase/proposals/s4d3b_school_report_card_authorized_preview.sql` est un **fichier candidat, PAS une migration**. Il définit :

- `public.schoolnet_school_report_card_preview(p_school_id,p_period_id,p_class_id,p_student_id)`, façade `SECURITY INVOKER` accessible uniquement au rôle SQL `authenticated` ;
- `schoolnet_private.school_report_card_preview(...)`, fonction `SECURITY DEFINER SET search_path=pg_catalog` dans le schéma **non exposé**, qui appelle `c3c3_school_class_year` pour revérifier à chaque demande `auth.uid()`, le rôle `school_admin`, l'affiliation active, le statut de l'établissement et la concordance classe/année/période ;
- Un contrôle actif de l'affectation de l'élève, de son appartenance, du programme approuvé et du maximum de 250 élèves / 60 matières / 500 évaluations ;
- Les mêmes jointures admissibles que le noyau général pour les cours, affectations d'enseignants, liens officiels, coefficients d'évaluations, copies publiées et révocations ;
- **La même fonction privée `compute_official_general_average_preview`** pour calculer le résultat par matière et la moyenne générale (aucune seconde formule, aucune note brute publiée).

La sortie contient seulement un élève et ses lignes agrégées. Aucune copie, `score`, `maxScore`, `publishedAt`, note brute, commentaire privé ou rang n'est renvoyé. Une inscription ambiguë en cours d'année entraîne l'absence de moyenne finale. Le code vérifie les clés exactes, la cohérence de tous les ID/coefficients/noms, le statut et l'égalité avec la moyenne générale existante. **La validation du navigateur est une défense supplémentaire : l'autorisation véritable reste dans SQL.**

Les API `schoolnet_school_official_curriculum` et `schoolnet_school_official_general_averages` dont cette nouvelle proposition dépend restent **non installées** sur Supabase principal ; le bulletin réel ne sera donc pas disponible sur l'environnement hébergé tant qu'une étape d'installation et de sécurité n'aura pas reçu un **GO distinct**.

## Modes de fonctionnement

**Mode local DEV strictement fictif :**

- Connecté comme `school_admin` autorisé, démarrer `npm run dev` ;
- Ouvrir `/app/school/official-general-averages?schoolnet_c3c4_demo=1` ;
- Choisir établissement fictif A, 6e B, 1er trimestre ;
- Cliquer **Consulter** sur élève fictif 01, puis ouvrir le tableau de matières qui apparaît dans sa fiche ;
- Répéter avec élève fictif 02 (`0,00`), élève fictif 03 (deux matières à calcul et la dernière à compléter), et changer d'école/période pour vérifier le nettoyage.

Les valeurs présentées dans ce mode sont **fabriquées par une fixture de développement**, jamais des notes d'enseignants ; elles sont clairement marquées « Données 100 % fictives ». La fixture utilise la même forme de réponse stricte que la RPC proposée et **n'est jamais un repli en cas d'erreur serveur**.

**Mode non fictif de l'application :**

- Si les données générales, la configuration ou les droits ne sont pas disponibles, aucun détail n'est affiché.
- Si la RPC nouvelle n'existe pas sur cet environnement : message explicite **« Activation SQL du bulletin V2 en attente »**, aucune simulation clandestine.
- Si accès ou réponse non conforme : refus et aucun score affiché.
- Aucun bouton de **publication, impression ou téléchargement** de bulletin V2.

## Tests

- `npm run qa:s4d3b` : 12 tests de contrat (portée, coefficients, absence des matières, vraie moyenne zéro, refus des notes forgées, données fictives explicitement limitées à DEV et verrouillage de publication) ;
- Suite fonctionnelle `qa:s4d3a`, `qa:s4c5`, `qa:s4c3c4` ; lint TypeScript et build Vite ;
- GitHub Actions sur un **Supabase GoTrue + PostgREST + PostgreSQL local jetable**, avec vrais JWT **fictifs @example.test** :
  - deux écoles A/B, directeur A/B, enseignant, parent et élèves ;
  - autorisation par rôle + affiliation active ; refus école étrangère, classe étrangère, élève étranger, accès anonyme ou rôle enseignant ;
  - programme non approuvé masqué, copies non publiées masquées, moyenne 0 vraie, élève en transfert, révocation et absence de notes brutes.
- Les conteneurs de test sont détruits automatiquement, avec services externes coupés, sans identifiants ni adresse de la production.

**Tests Windows ensuite :** branche locale S4-D.3b → `npm run qa:s4d3b` → `npm run build` → `git restore -- tsconfig.app.tsbuildinfo` → `git status -sb`, puis l'URL de développement ci-dessus. Aucun Docker/PostgreSQL à installer sur le PC.

## Statut et portes

**S4-D.3b = lecture et prévisualisation uniquement.** La proposition SQL n'est pas installée sur Supabase principal ; pas de fusion `main`, pas de Vercel, pas de modification Auth, RLS ou de notes, pas de PDF réel, pas d'édition ni publication de bulletin. Le verrou `SCHOOLNET_REAL_EXPORTS_RELEASED = false` reste fermé.

**Étape fonctionnelle suivante après validation :** renforcer la présentation du bulletin avec les véritables lignes agrégées **une fois le serveur autorisé**, puis envisager séparément les champs de présence/appréciation non disponibles. Ne pas inventer leurs données.
