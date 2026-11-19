# SCHOOLNET 2.0 — R0 | Clôture opérationnelle du Lot 5.C

**Date de préparation :** 19 novembre 2026
**Workflow de référence :** SCHOOLNET_WORKFLOW_DIRECTEUR_V4_2026-11-19, section « 03. R0 — CLÔTURE DU LOT 5.C ».
**Branche de recette :** `feature/schoolnet-r0-cloture-lot5c-20261119` (**issue de `main`**, sans aucun travail 5D).
**Statut : PRÉPARÉ / RECETTE LOCALE À FAIRE / RECETTE MÉTIER RÉELLE NON AUTORISÉE.**
**Déploiement :** 5.C déjà publié par la PR #13 ; **aucun nouveau déploiement dans ce lot préparatoire**.

## 1. Objet précis

Clore le parcours métier de **rattachement Parent–Enfant du Lot 5.C**, et non
développer une nouvelle fonction de fin d'année :

- un administrateur habilité examine une demande et atteste l'identité et
  la relation familiale ;
- le lien canonique d'appartenance est `parent_links`, jamais
  l'ancienne liste `profiles.child_ids` seule ;
- le Parent voit **uniquement les enfants effectivement liés**,
  y compris avant affectation à une classe ;
- un second Parent non lié ne peut ni lire ni rattacher cet enfant ;
- les demandes répétées ne doivent créer aucun doublon ;
- les preuves et le journal d'audit permettent la vérification et le
  retour arrière en cas d'anomalie.

Cette fiche distingue les essais **en lecture seule**, qui sont
autorisés maintenant, et les opérations **d'écriture réelle**, qui
nécessiteront un GO distinct, une sauvegarde contrôlée et des identités
explicitement autorisées.

## 2. État de référence vérifié avant la recette

| Surface | Constat |
| --- | --- |
| GitHub | La PR #13 Lot 5.C est fusionnée ; `main` au SHA `2761d7384b5ab3603d12bd4dd804506f2c7f4762` après la PR #14 |
| Vercel | Le workflow V4 a confirmé le code 5.C publié ; **revérifier le domaine et le commit lors de la recette** |
| Code Parent `main` | `ParentChildren.tsx` interroge `parent_links` avec `parent_id=user.id` et ne sélectionne les profils d'élèves que par ces IDs |
| Test automatisé existant | `scripts/test-schoolnet-lot5c-parent-children.mjs` : 10 scénarios, dont deux enfants, refus via `child_ids`, doublons, classe indisponible et réponses réseau obsolètes |
| Commande globale | `npm run qa:lot5c` lance lint, build et toute la batterie Lot 5.C (85 tests enregistrés lors de la recette historique) |
| Supabase principal, lecture agrégée | **2 liens familiaux**, 3 profils Parent, 5 profils Élève ; **0 approbation individuelle de nouvel enfant** et **0 finalisation de demande** ; **0 lien dont le rôle Parent ou Élève est incohérent** |
| PR #15 | Lots 5D-A à N : **brouillon non fusionné**, à ne pas intégrer à cette recette |

Les comptes et liens existants ne prouvent **pas** qu'un scénario
de **nouveau** rattachement a été exécuté jusqu'au bout.

## 3. Acteurs, pages et règles d'accès

| Rôle | Écran | Ce qui est permis dans cette recette |
| --- | --- | --- |
| Super Admin / Admin habilité | `/app/admin/enrollment-requests` → dossier → « Accès Apprenant », « Famille & finalisation » / « Dossier & suivi » | Lire, rechercher, examiner, contrôler les états et les preuves **sans valider de modification réelle** |
| Parent A autorisé | `/app/parent/children` (« Mes enfants ») | Lire uniquement ses enfants liés, examiner classes et états, actualiser |
| Parent B non autorisé | `/app/parent/children` | Ne doit pas voir ni demander les données personnelles de la famille A |
| Apprenant | Espace Apprenant | Ne peut s'auto-rattacher ni utiliser l'identifiant Auth de son parent |
| Visiteur non connecté | Pages publiques | Ne peut pas consulter un profil familial privé |

**Interdiction :** en production, ne pas cliquer « Finaliser »,
« Approuver », « Préparer un accès », « Activer », « Refuser »
ou « Déclarer envoyé » dans le cadre d'une simple recette
en lecture seule. Ne pas tenter d'accéder à des profils
d'autres familles par des paramètres d'URL ou du SQL manuel.

## 4. Porte R0-A — Tests automatiques depuis GitHub vers Windows

**Pourquoi un dossier Git séparé ?** Le workspace Windows SCHOOLNET
actuel contient des scripts non suivis et une modification de
`tsconfig.app.tsbuildinfo`, et il est sur la branche 5D-A à N.
Il faut éviter de changer cette branche, d'écraser des fichiers
ou d'amener la PR #15 dans R0.

Depuis PowerShell, **dans le dossier actuel**
`D:\Bakary\10 autres\schoolnet` :

```powershell
git status --short
git branch --show-current
git fetch origin
git worktree add -b review/schoolnet-r0-5c-20261119 "..\schoolnet-r0" origin/feature/schoolnet-r0-cloture-lot5c-20261119
cd "..\schoolnet-r0"
git status --short
git branch --show-current
npm ci
npm run qa:lot5c
git status --short
```

**Attendu :** nouvelle arborescence
`D:\Bakary\10 autres\schoolnet-r0`,
branche locale `review/schoolnet-r0-5c-20261119`,
aucune modification des fichiers du dossier SCHOOLNET initial.
`qa:lot5c` doit se terminer sans erreur, en conservant
la distinction avertissement ESLint non bloquant / erreur.
**Ne pas lancer d'outil `supabase` de migration ou de
déploiement depuis cette étape.**

Si `npm ci` échoue, conserver sa sortie avant toute tentative
de réparation ; ne pas supprimer `package-lock.json`
ni utiliser `git clean`.

## 5. Porte R0-B — Recette visuelle et lecture seule

Utiliser **uniquement les comptes que le propriétaire est autorisé
à consulter**. Le site existant (déjà publié) peut être utilisé
en **lecture seule** pour ces observations.
Les identités, noms, e-mails et numéros sont masqués dans
les captures partagées ; **aucun mot de passe, jeton
ou clé de service** ne doit être transmis.

| ID | Scénario vérifiable sans écriture | Critère OK |
| --- | --- | --- |
| R0-B01 | Admin ouvre la liste des demandes et un dossier existant autorisé | Dossier et onglets présents, absence d'erreur d'accès |
| R0-B02 | Admin ouvre « Accès Apprenant » | Statuts et contrôles visibles ; aucune action de mutation exécutée |
| R0-B03 | Admin examine « Famille & finalisation » | Identité Parent / Élève distincte, indication de validation humaine et confirmation avant écriture |
| R0-B04 | Parent A ouvre « Mes enfants » | Seulement les profils autorisés par `parent_links`, pas ceux présents seulement dans `child_ids` |
| R0-B05 | Parent A actualise | Pas de doublons, aucun profil disparu/ajouté par erreur |
| R0-B06 | Parent sans enfant lié | Message « Aucun enfant lié » conforme, pas d'accès à une autre famille |
| R0-B07 | Parent avec enfant sans classe connue | Enfant toujours visible, mention « Classe à affecter » ou indisponibilité selon le cas |
| R0-B08 | Déconnexion et changement de compte | L'ancien Parent ne laisse pas ses cartes visibles pour le suivant |
| R0-B09 | Téléphone/mobile (écran étroit) | Cartes lisibles, boutons accessibles, pas de débordement horizontal |
| R0-B10 | Absence de droit Admin / Élève | Pas de consultation d'un dossier familial d'autrui via les menus autorisés |

**Important :** ne pas provoquer une anomalie en changeant
des enregistrements réels. Si aucun jeu de données ne couvre B06/B07
ou la double fratrie, noter **NON TESTABLE SANS FIXTURE AUTORISÉE**,
pas « OK » par supposition. Les 10 tests unitaires couvrent
le comportement attendu, pas une preuve de navigation réelle.

## 6. Porte R0-C — Cas métier nouveau / familles multiples (BLOQUÉ)

**À ne PAS lancer maintenant.** Après **GO écrit distinct** :

1. Choisir un scénario avec **un Parent et un nouvel enfant
   explicitement autorisés**, et un deuxième Parent dont
   les droits sont distincts. Préférer une pile de test
   séparée pour les écritures fictives ; la création
   de comptes réels impose consentement et sauvegarde.
2. Photographier l'état initial **sans donnée personnelle
   dans le PV** : comptes, rôle, invitation, statut du dossier,
   liens, audit, sauvegarde et restauration testée.
3. Admin examine les preuves de filiation et la demande,
   atteste individuellement le nouvel enfant, confirme
   le bon compte Parent, puis utilise la fonction
   serveur **autorisée pour cet environnement**.
4. Vérifier qu'un nouveau lien `parent_links` est
   enregistré **une fois**, et qu'une éventuelle
   invitation/approbation serveur reste propre
   à cet enfant.
5. Vérifier la visibilité chez le bon Parent, le refus
   chez le Parent B et la persistance après nouvelle
   connexion, sans accès via `child_ids` seulement.
6. Répéter dans un environnement de test autorisé
   pour confirmer l'absence de doublon et les
   comportements de reprise après échec.
7. Contrôler le journal d'audit sans diffuser
   les données de la famille ni les secrets d'accès.

**Cas Élève sans e-mail :** parcours distinct,
AUCUN partage d'identifiant Auth Parent/Élève
et aucune activation sans GO supplémentaire.

## 7. Porte R0-D — Sauvegarde, droits et publication

Avant toute mutation/activation en production :
- disposer d'un état initial, d'une sauvegarde vérifiée
  **Auth + base + objets Storage pertinents** et d'un
  chemin de restauration testé et autorisé ;
- contrôler migrations, triggers, règles RLS,
  permissions Admin/Parent et appels serveurs ;
- vérifier le domaine Vercel, le commit réellement
  en ligne et la procédure de retour arrière ;
- établir le PV de recette avec cases
  **OK / KO / NON TESTABLE**, preuves datées,
  anomalie, correctif et responsable ;
- demander un **GO spécifique** avant fusion
  `main`, déploiement Vercel, écriture SQL,
  création d'identité ou approbation.

**Si le code 5.C déjà publié fonctionne sans correction,
R0 pourra être clos par PV** ; une modification applicative
et une nouvelle publication ne sont pas nécessaires
uniquement pour rejouer des tests. En revanche,
la PR documentaire restera en brouillon jusqu'à
la décision de fusion. Toute fusion sur `main`
est susceptible de déclencher Vercel automatiquement.

## 8. Journal de décision initial

| Gate | État au 19/11/2026 |
| --- | --- |
| G0 État initial GitHub/Supabase | **FAIT — lecture seule**, rapports agrégés, pas de PII exportée |
| G1 R0 périmètre et critères | **PRÉPARÉ**, soumis à validation du propriétaire |
| G2/G3 Sécurité des écritures réelles | **NON AUTORISÉES** |
| G5 Tests locaux Lot 5.C | **À EFFECTUER** dans le worktree séparé |
| G5 Recette visuelle Parent/Admin | **À EFFECTUER EN LECTURE SEULE** |
| G6 Preview isolée | **NON NÉCESSAIRE pour ce document seul** ; à décider en cas de correction |
| G7 Merge/production | **NON AUTORISÉ** |
| G8 PV de clôture métier R0 | **EN ATTENTE du cas nouveau autorisé ou d'une dérogation explicite documentée** |

**Point de reprise :** recevoir la sortie de `npm run qa:lot5c`
et la recette visuelle en lecture seule, puis confronter
les écarts éventuels à la PR #13. **Ne pas commencer R1
tant que la porte de sortie R0 n'est pas clarifiée.**
