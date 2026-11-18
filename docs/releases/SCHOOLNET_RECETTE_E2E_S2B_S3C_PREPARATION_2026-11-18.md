# SCHOOLNET 2.0 — Recette fonctionnelle S2-B → S3-C (plan d'exécution)

**Date : 18 novembre 2026**  
**Statut : PRÉPARATION UNIQUEMENT — aucun utilisateur, établissement, cours, classe ou rattachement de test créé.**  
**Branche :** `feature/schoolnet-s2a-classes-tenant-qa` · **PR :** [#14](https://github.com/ramon77777/schoolnet/pull/14) (brouillon).

## 1. Objet et périmètre

Vérifier un parcours cohérent **Établissement → Classes (S2-B) → Enseignants (S3-A) / Élèves (S3-B) → Affectations et journal (S3-C)**.

Deux modes de recette sont strictement séparés :

- **Mode A — immédiatement autorisé :** lecture seule des catalogues, vérification de routes, tests hors réseau et audit SQL composé exclusivement de `SELECT`. Réalisable depuis localhost et une Preview autorisée en lecture.
- **Mode B — à autoriser séparément :** créations, révocations, réactivations et transferts effectifs avec *comptes de test synthétiques* dans une **base isolée**, ou protocole de production approuvé. **Non exécuté** à cette étape.

Le présent document est un plan, **pas une preuve de réussite d'une recette navigateur avec écritures**.

## 2. État initial vérifié (Supabase principal au 18/11/2026)

| Ressource | État |
|---|---:|
| Établissements actifs | 2 |
| Établissements avec au moins un school_admin actif | 1 |
| Classes officielles (`learning_context='school'`) | 0 |
| Affiliation locale élève active | 0 |
| Affiliation locale enseignant active | 0 |
| Affectations officielles élèves/classes | 0 |
| Affectations officielles enseignants/classes/matières | 0 |
| Journal des mouvements S3-C | 0 |
| Niveaux | 16 |
| Matières actives | 1 |
| Années scolaires | 3 |
| Comptes élèves avec e-mail personnel vérifié éligibles | 4 |
| Comptes enseignants avec e-mail vérifié éligibles | 2 |
| Demandes du parcours élève sans e-mail personnel | 1 |
| Classes historiques / classe-élèves / classe-enseignants / inscriptions | 2 / 2 / 2 / 2 |
| Événements d'audit historiques | 5 |

**Calendrier à traiter :** le flag `school_years.is_current` désigne encore **2025-2026**. Ne pas présumer qu'il représente l'année métier attendue. Le formulaire S2-B impose de sélectionner une année ; S3-C reprend celle de la classe. **Ne changer aucune année globale sans validation métier.**

Les migrations canoniques installées sont :
`20261117150838` (S2-B), `20261117155641` (S3-A),
`20261117162853` (S3-B) et `20261118083254` (S3-C).
S2-A reste leur fondation multi-établissements.

## 3. Contrôle préliminaire sans écriture

**Fichier SQL lecture seule :**
`supabase/verification/20261118_schoolnet_e2e_readiness_readonly.sql`.

Le script lit uniquement des agrégats, la présence des RPC et les permissions RLS/SQL.
Il n'affiche **ni noms, ni e-mails, ni identifiants d'élèves, ni secrets**.
Lancé avec succès en mode lecture seule le 18/11/2026.
**Ne pas** utiliser `supabase db push`, `apply_migration` ou une RPC de création pour cette étape.

**Fichier de tests locaux hors réseau :**
`scripts/test-schoolnet-e2e-readiness.mjs`, lancé par
`npm run qa:e2e:readiness` (contrôle structurel, pas une recette de mutations).
La validation Windows de ce script reste à confirmer par capture.

## 4. Matrice des comptes de test (spécifications, AUCUNE création)

Les libellés ci-dessous sont des **alias**. Ne jamais commiter d'adresse réelle, de mot
de passe, de clé `service_role`, de jeton ou d'UUID personnel dans GitHub.

| Alias à préparer plus tard | Rôle attendu | Rattachement | Usage |
|---|---|---|---|
| `ADMIN_A` | `school_admin` | Actif sur `ECOLE_A` uniquement | Parcours positif école A |
| `ADMIN_B` | `school_admin` | Actif sur `ECOLE_B` uniquement | Isolation A/B et homonymes |
| `ELEVE_A` | `student` | Compte synthétique avec e-mail personnel confirmé | Affiliation/affectation A |
| `ELEVE_B` | `student` | Autre compte synthétique confirmé | Plusieurs élèves / filtres |
| `ENSEIGNANT_A` | `teacher` | Compte synthétique confirmé | Intervention classe + matière |
| `ENSEIGNANT_B` | `teacher` | Compte synthétique confirmé | Deux intervenants / doublons |
| `PARENT_TEST` | `parent` | Compte synthétique sans accès admin école | Test négatif de rôle |
| `ELEVE_SANS_EMAIL` | `student` | Parcours sans e-mail personnel, si activé dans le bac à sable | Vérifier le rejet de l'e-mail technique ; pas de rattachement par l'adresse technique |
| `ADMIN_GLOBAL_TEST` | `admin` | Compte global synthétique | Ne doit pas s'octroyer le rôle `school_admin` via cette route |

La base principale n'a pour l'instant qu'une affiliation `school_admin` active :
**le test de parcours entre deux établissements demande un deuxième responsable
de test dans un environnement isolé**. Il n'est pas prêt à être exécuté sur
les comptes réels actuels. Aucun compte existant n'est automatiquement adopté
comme « compte de test ».

Les e-mails factices `@example.invalid` peuvent figurer dans les documents
comme *placeholders seulement*. Ne pas s'en servir comme identifiants
fonctionnels avant création encadrée de comptes synthétiques dans un bac à sable.
Les mots de passe et codes de récupération doivent rester dans un coffre externe.

## 5. Matrice de recette fonctionnelle (exécution différée, sauf R01–R05)

| ID | Scénario | Préparation | Attendu | Mode |
|---|---|---|---|---|
| R01 | Connexion locale `ADMIN_A` au menu Classes, Enseignants, Élèves, Affectations | Compte existant habilité, sans écriture | Les 4 routes et le menu sont visibles ; aucune mutation | A |
| R02 | Changer d'établissement depuis le sélecteur | `ADMIN_A` limité à A | Seules les écoles autorisées sont listées | A |
| R03 | Ouvrir les quatre catalogues | S2-B/S3-A/S3-B/S3-C installés | Pas de bandeau « activation en attente », réponse valide même à 0 ligne | A |
| R04 | Essayer localhost et Preview en lecture seule | Build local / Preview | Tous les boutons de création, révocation et réactivation restent inactifs | A |
| R05 | Contrôler l'absence de fuite des tables legacy | Audit SELECT + code | 2/2/2 historiques inchangés, pas de données d'autre école | A |
| R06 | Créer `6e A` dans `ECOLE_A` pour une année explicitement choisie | `ADMIN_A`, niveau et année valides | Classe officielle A créée une fois, visible dans le catalogue S3-C | B |
| R07 | Créer `6e A` dans `ECOLE_B` pour la même année | `ADMIN_B` | Homonymie autorisée dans des établissements distincts | B |
| R08 | Recréer `6e A` dans A pour la même année | Classe A déjà créée | Refus du doublon `23505` avec message compréhensible | B |
| R09 | Créer classe sans nom, niveau ou année valides | `ADMIN_A` | Refus client et serveur ; aucune classe supplémentaire | B |
| R10 | Rattacher `ENSEIGNANT_A` par e-mail personnel confirmé | Compte teacher existant dans bac à sable | Affiliation teacher active dans A, sans compte Auth supplémentaire | B |
| R11 | Rattacher `ELEVE_A` par e-mail confirmé | Compte student existant dans bac à sable | Affiliation student active dans A, sans inscription en classe | B |
| R12 | Tenter rattachement du mauvais rôle ou d'un e-mail inconnu | Comptes non éligibles | Refus ; aucun rattachement créé | B |
| R13 | Tenter e-mail technique du parcours sans-e-mail | `ELEVE_SANS_EMAIL` synthétique | Rejet ; aucune donnée familiale modifiée | B |
| R14 | Affecter `ELEVE_A` à `6e A` | Élève affilié A, classe A/année valides | Une affectation élève/classe/année active et événement `assigned` | B |
| R15 | Affecter le même élève à une autre classe de A, même année | Affectation R14 active | Refus du conflit ; une seule classe active en A pour cette année | B |
| R16 | Transférer l'élève de `6e A` à `6e B` | Deux classes officielles dans A | Révocation préalable, nouvelle affectation, historique conservé | B |
| R17 | Réactiver l'ancienne classe alors que `6e B` est active | Après R16 | Refus du conflit de réactivation | B |
| R18 | Affecter `ENSEIGNANT_A` à `6e A` / matière active | Enseignant affilié, matière valide | Affectation enseignant/classe/matière active, événement `assigned` | B |
| R19 | Affecter `ENSEIGNANT_B` à la même matière et classe | Deux enseignants affiliés | Deux intervenants autorisés ; doublon du même triplet refusé | B |
| R20 | Révoquer puis réactiver une affectation enseignant | R18 active | Les statuts changent ; événements `revoked/reactivated` tracés | B |
| R21 | Révoquer l'affiliation d'un membre | Rattachement et affectation active | `effective_active=false`, historique conservé, réactivation refusée tant que l'affiliation est inactive | B |
| R22 | Effectuer un même parcours élève dans deux écoles | `ADMIN_A` / `ADMIN_B`, élève autorisé dans A et B | Affectations A/B indépendantes, aucune fuite de listes ni statuts | B |
| R23 | Accéder à l'école B avec `ADMIN_A` | Admin non membre B | Refus de lecture et écriture même avec UUID B | B |
| R24 | Accéder à `/app/school/assignments` en student/teacher/parent/admin global | Comptes synthétiques | Route refusée/redirigée, aucune mutation RPC | B |
| R25 | Utiliser une année différente | Deux classes de deux années distinctes | Une affectation autorisée **par école/année**, sans altérer l'historique | B |
| R26 | Consulter le journal et auditer les opérations | R14–R25 exécutés | Auteur, personne, classe, matière, action et date corrects, uniquement école autorisée | B |
| R27 | Contrôler les données historiques après la recette | Capture du baseline et requêtes agrégées | Cours, notes, bulletins, inscriptions et anciens liens inchangés | B |
| R28 | Valider l'interface sur mobile | Android/iOS ou DevTools | Pas de débordement ; formulaires et listes accessibles | A puis B |

*R01–R05 et la partie lecture seule de R28 peuvent être exécutés maintenant, sans données de test.
R06–R27 demandent la levée des prérequis du mode B. Les statuts dans cette matrice sont des
**objectifs**, pas des résultats déjà obtenus.*

## 6. Parcours opératoire B (documenté, NON exécuté)

1. Obtenir autorisation et bac à sable isolé, le jeu de données synthétique,
   ainsi qu'une sauvegarde/restauration **testée** du bac à sable.
2. Vérifier que les politiques d'écriture acceptent **uniquement** l'origine
   officielle du bac à sable ET son projet Supabase, sans assouplissement de
   l'environnement de production. Le code actuel impose exactement
   `https://schoolnet-snowy.vercel.app` et le projet Supabase principal ;
   un site Preview classique ne permet donc **pas** cette étape.
3. Valider l'année scolaire de recette ; ne pas corriger automatiquement `is_current`.
4. Provisionner seulement les comptes **synthétiques** de la matrice, puis
   les écoles A/B dans le bac à sable suivant le circuit d'administration approuvé.
5. Faire R06 → R28 dans l'ordre, relever les refus attendus et contrôler
   l'isolation par deux sessions d'administrateurs distinctes.
6. Comparer avant/après : `class_students`, `class_teachers`,
   `student_enrollments`, comptes/parents et journaux existants ;
   conserver l'historique des actions S3-C dans l'environnement de recette.
7. Archiver les captures **expurgées** des e-mails/tokens, résultats et
   anomalies. Nettoyer le bac à sable selon la procédure de restauration.
8. N'autoriser ni merge, ni promotion Vercel, ni changement des RPC de
   production sans décision de recette et nouvel accord.

**Ne jamais « simuler » une origine HTTP officielle en falsifiant les headers**
pour une recette navigateur : le header `Origin` est un garde-fou secondaire,
pas une identité, et son usurpation ne prouve pas le bon fonctionnement de l'UI.
Le test d'intégration doit utiliser une véritable configuration d'environnement.

## 7. Exigences de sécurité / critères de sortie

- Écriture interdite depuis localhost, Preview, SSR et projet Supabase incorrect.
- Côté SQL : `auth.uid()` obligatoire, rôle `school_admin`, affiliation
  administrative active de **cette** école et classe/membre de même école.
- `anon` ne peut pas exécuter les RPC sensibles ; aucun accès direct
  `authenticated` aux 3 tables d'affectations S3-C.
- Élèves sans e-mail : aucune adresse technique affichée ou utilisée pour les rattacher.
- Une classe active maximum par élève/école/année ; un triplet unique
  classe/enseignant/matière ; matière active vérifiée.
- Les révocations préservent les données d'apprentissage et les journaux.
- Aucune modification automatique des `profiles`, liens parents/enfants,
  notes, bulletins, cours et historiques legacy.
- Exécution de `qa:s2b`, `qa:s3a`, `qa:s3b`, `qa:s3c`,
  `qa:e2e:readiness`, `lint` et `build` **sans erreur** ;
  l'avertissement `useEffect` existant est consigné séparément.
- Tous les scénarios B doivent être signés par l'administrateur recette
  avant toute proposition de publication/merge.

## 8. Blocages explicites avant une recette B

1. **Aucun bac à sable isolé** ni domaine de test autorisé en écriture n'a été provisionné.
2. **Le second administrateur d'établissement de test est absent.**
3. **Aucune classe officielle, aucun rattachement local** n'existe actuellement.
4. **L'année marquée courante est 2025-2026**, à confirmer métier.
5. **Pas de sauvegarde intégrale récente/restauration vérifiée** de la base principale.
6. **Aucune autorisation** de créer des comptes, de publier Vercel, de
   modifier les politiques d'origines, ni de fusionner PR #14 n'est donnée ici.

## 9. Reprise VS Code — lecture seule

```powershell
git pull --ff-only origin feature/schoolnet-s2a-classes-tenant-qa
npm run qa:e2e:readiness
npm run qa:s2b
npm run qa:s3a
npm run qa:s3b
npm run qa:s3c
npm run lint
npm run build
npm run dev
```

Pages de contrôle navigateur :

- `http://localhost:5173/app/school/classes`
- `http://localhost:5173/app/school/teachers`
- `http://localhost:5173/app/school/students`
- `http://localhost:5173/app/school/assignments`

Résultat attendu : catalogues lisibles, contrôle d'accès par école,
bandeau **lecture seule**, boutons de mutation bloqués ; aucune
ligne d'essai créée. Vérifier les interfaces sur mobile.
Fournir captures des résultats **sans données personnelles**.

**Interdictions** : `supabase db push`, rejouer S2-B/S3-A/S3-B/S3-C,
écrire sur la base principale, utiliser `service_role` dans React,
publier/promouvoir Vercel, fusionner PR #14 ou supprimer
`supabase/proposals/staged/` et les scripts locaux non suivis.

## 10. Décision de clôture

La préparation sera jugée prête lorsque le diagnostic SQL agrégé, les tests
hors ligne, `lint/build` et l'interface de lecture seule sont validés.
Cela **ne** clôture **pas** la recette fonctionnelle réelle.
Une seconde décision devra autoriser l'environnement isolé, ses
comptes synthétiques, les mutations de tests et leur nettoyage.

**Rapport à compléter ensuite :** date, contexte, commit, environnement,
responsable, IDs de scénarios, statut PASS/FAIL/BLOCKED,
preuves expurgées, anomalies, corrections, validation de la reprise.
