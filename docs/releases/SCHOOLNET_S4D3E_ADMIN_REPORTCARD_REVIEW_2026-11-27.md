# SCHOOLNET V2 — S4-D.3e · Contrôle administratif des bulletins V2

**27 novembre 2026.** Suite fonctionnelle de S4-D.3d (PR brouillon #65, validée visuellement sur ordinateur). Nouvelle PR S4-D.3e empilée sur #65 ; **aucun SQL de production, aucune fusion main, aucun déploiement Vercel**.

## Objet
Avant de préparer un vrai circuit de validation/publication, fournir à l'administrateur d'établissement une **lecture des anomalies** de la classe et du bulletin individuel, sans consentement implicite ni écriture de statut.

Les résultats doivent rester issus de la **projection scolaire V2 déjà contrôlée** (S4-D.3b). La nouvelle logique **ne recalcule aucune moyenne, ne crée aucune note et ne tente aucune RPC supplémentaire**.

## Interface
- Dans « Bulletins et exports » → « Bulletins individuels V2 » : tableau de bord de contrôle pédagogique par classe avec nombre de dossiers, moyennes calculables, dossiers à compléter et matières non configurées. Il réutilise uniquement la synthèse de la cohorte V2 autorisée.
- Après la sélection d'un élève : panneau **« Contrôle administratif du bulletin »** dans le composant partagé des bulletins (utilisé dans « Bulletins et exports » et « Moyennes générales officielles »).
- Contrôles en lecture seule : identité scolaire (élève, établissement, année, classe, période), programme officiel approuvé et cohérence des matières/coefficient, résultats disponibles, informations complémentaires (rang, absences, appréciation non intégrés).
- Si la moyenne générale est disponible, toutes les matières sont calculables et les libellés du contexte sont présents, affichage **« Résultats pédagogiques complets »** — **jamais « Prêt à publier »**.
- Sinon, indication des matières à compléter / configurer, nombre d'évaluations manquantes, ou résultat indisponible/masqué. Un véritable **0,00/20** reste un résultat calculable ; les notes non publiées restent nulles.
- Rang, absences et appréciation : **« Non intégré »**, sans supposer quelles mentions seraient légalement obligatoires. Les règles de publication et d'approbation demandent une décision métier ultérieure.

## Verrous
- Réutilisation de l'API S4-D.3b, des vérifications anti-IDOR serveur, du programme approuvé et de la portée école/année/classe/période. Le panneau ne se monte **qu'après validation** de la réponse du serveur ou de la fixture explicitement DEV.
- Un changement de contexte ou de compte fait disparaître l'ancien bulletin et les anciennes vérifications, car tous deux dépendent de la même clé de portée.
- Pas d'approbation automatique, pas de validation administrative enregistrée, pas de statut « publié », pas d'export réel, pas d'impression et pas de PDF officiel.
- Aucune activation SQL sur Supabase principal, aucun changement de RLS, aucune nouvelle migration. **En l'absence de la RPC S4-D.3b, le panneau ne s'affiche pas** : l'état d'activation en attente de S4-D.3b reste présenté.

## Recette et continuité
CI : `qa:s4d3e` puis `qa:s4d3d`, `qa:s4d3c`, `qa:s4d3b`, `qa:s4d3a`, `qa:s4d2c2`, `qa:s4c3c4`, `qa:s4c5`, lint et build.

Depuis le worktree Windows **propre** `D:\Bakary\10 autres\schoolnet-tests` :

~~~powershell
git status -sb
git fetch origin
git switch -c local/schoolnet-s4d3e --track origin/feature/schoolnet-s4d3e-admin-reportcard-review-20261127
git log -1 --oneline
npm run qa:s4d3e
npm run build
git restore -- tsconfig.app.tsbuildinfo
git status -sb
npm run dev
~~~

Ouvrir sous un compte réel `school_admin` en environnement de développement :

`http://localhost:5173/app/school/official-documents?schoolnet_c3c4_demo=1`

Contrôle **uniquement des nouvelles fonctionnalités** :
1. Classe fictive 6e B/T1 → tableau **13 dossiers, 8 calculables, 3 à compléter, 2 non configurés** ; aucune fonction de publication.
2. Élève fictif 01 → « Résultats pédagogiques complets », 3/3, aucune anomalie ; rang/absences/appréciations « Non intégré » ; **publication désactivée**.
3. Élève fictif 02 → **0,00/20 valable**, contrôle pédagogique complet.
4. Élève fictif 03 → **Sciences à compléter**, 2/3 ; moyenne générale absente, publication désactivée.
5. Après changement de classe ou de période : contrôle et bulletin antérieurs immédiatement retirés. **Ne pas reprendre les tests anciens**.

## Livraisons
Branche GitHub isolée et PR brouillon empilée sur #65 puis #64 et #63 ; Vercel Preview désactivé. **Ne pas fusionner dans main ni lancer Vercel avant GO explicite**. Le contrôle administratif constitue une préparation **non décisionnelle**, pas l'émission réelle de bulletins.
