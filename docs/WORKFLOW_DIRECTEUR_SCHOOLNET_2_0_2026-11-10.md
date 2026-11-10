# SCHOOLNET 2.0 — Workflow directeur actualisé
## Accès, inscriptions, apprentissage libre, établissements et cours à domicile

**Édition : 10 novembre 2026 — version de pilotage V2.0**  
**Référence initiale :** `Workflow_complet_SchoolNet_post_V1(6).pdf` (octobre 2026, 19 pages).  
**Document vivant :** à mettre à jour après chaque lot ou décision importante.  
**Dépôt de travail :** `ramon77777/schoolnet` ; branche `feature/schoolnet-multi-etablissements` ; **PR #6 brouillon**, basée sur la **PR #5** `feature/schoolnet-notifications`, elle-même non fusionnée à `main`.  
**Règle :** cette révision est **documentaire et organisationnelle**. Elle n'autorise **aucune migration Supabase, fusion GitHub, mise en production Vercel ni modification de comptes**.

> **Cap directeur.** SCHOOLNET est une plateforme éducative unifiée permettant d'apprendre librement, de suivre sa scolarité dans un établissement et de bénéficier d'un accompagnement à domicile. Le compte utilisateur reste commun ; les droits sur les données dépendent du rôle, des relations vérifiées et du contexte pédagogique.

---

## 1. Pourquoi revoir notre workflow ?

Le document post-V1 d'octobre 2026 organise les lots **0 à 8** : stabilisation, présences, emploi du temps, bulletins, notifications, inscriptions, vie scolaire, finances et documents scolaires. Cet ordre est **conservé comme historique de référence** ; les lots déjà traités ne sont pas recréés.

Depuis, SCHOOLNET a ajouté la gestion d'établissements et d'administrateurs locaux. L'invitation du premier responsable local fonctionne et son accès central est bloqué. Mais la chaîne **demande publique → vérification → compte → lien parent/enfant → inscription ou groupe → invitation → activation → confirmation** reste complexe et inachevée. L'interface « Rattachement vérifié » exige encore plusieurs objets préexistants. C'est **ce parcours transversal** qui devient la priorité.

Le chantier des classes propres à chaque établissement (S2-A/S2-B) reste **préparé et mis en pause**, pour ne pas ouvrir trop de fronts simultanément.

### Ce qui est déjà une décision et ce qui reste une proposition

| Sujet | Statut |
| --- | --- |
| SCHOOLNET couvre l'apprentissage libre, les écoles et les cours à domicile | **Orientation fonctionnelle à conserver**, détaillée dans ce document |
| Rôles actuels Super Admin / administrateur local / Enseignant / Apprenant / Parent | **Existant** ; ne pas multiplier les comptes |
| Demandes publiques et RPC de résolution 5.C | **Backend appliqué**, mais expérience d'inscription complète à finaliser |
| Invitation manuelle d'administrateur local avec lien sécurisé | **Recette navigateur réussie**, modèle à généraliser prudemment |
| S2-A/S2-B classes par établissement | **Code et tests SQL préparés, migrations non appliquées** |
| Cours à domicile avec affectation et planning | **Parcours métier cible à concevoir**, pas un module déjà livré |
| Suppression du rattachement manuel au profit d'un assistant | **Proposition produit prioritaire**, à valider puis réaliser par étapes |

---

## 2. Un rôle, plusieurs modes d'apprentissage

### 2.1. Acteurs et responsabilités

- **Super Administrateur SCHOOLNET :** gouvernance de la plateforme, habilitation des écoles, administrateurs locaux, référentiels communs, arbitrages et audit. **Ne pas confondre** ce rôle avec un administrateur local.
- **Administrateur d'établissement :** gestion des demandes, comptes, classes et dossiers **de ses établissements autorisés uniquement** ; aucun droit `admin` central.
- **Enseignant :** accès aux cours, groupes, séances et élèves **explicitement attribués** ; il peut exercer dans plus d'un contexte après validation.
- **Apprenant :** dispose de son identité scolaire et pédagogique, suit ses cours et consulte uniquement ses travaux et résultats autorisés.
- **Parent/Tuteur :** soumet les demandes des mineurs, reçoit les invitations, vérifie et suit **uniquement** les enfants liés après confirmation administrative.
- **Visiteur :** découvre l'offre, soumet une demande ou accède à la connexion ; une demande publique ne donne jamais immédiatement accès à un dossier scolaire.

### 2.2. Trois contextes distincts, sans trois systèmes de comptes

| Mode | Objet pédagogique | Inscription pertinente | Responsable du traitement |
| --- | --- | --- | --- |
| **Apprentissage libre** | Groupe virtuel ou cours selon niveau | Adhésion au parcours/groupe, **sans dossier annuel scolaire obligatoire** | Équipe centrale SCHOOLNET selon les règles retenues |
| **Établissement scolaire** | Classe officielle d'une école, année scolaire et matières | **Dossier annuel `student_enrollments`** et classe officielle | Administrateur local autorisé, sous supervision centrale |
| **Cours à domicile** | Demande, enseignant, séances, progression individualisée | Dossier d'accompagnement, **sans inscription automatique dans une classe officielle** | Équipe/coordinateur autorisé, parent et enseignant affecté |

Un même apprenant peut combiner les trois modes **sans recréer son identité**. Une classe officielle n'est pas un groupe pédagogique libre. Un enseignant à domicile n'obtient aucun accès scolaire automatique.

**Point technique à ne pas masquer :** `profiles.role` est actuellement unique par compte et `schoolnet_school_memberships` décrit une appartenance avec un rôle local. Le support complet d'une personne exerçant plusieurs rôles métiers nécessitera une **évolution explicite des habilitations** ; ne pas supposer cette capacité déjà livrée.

---

## 3. « Commencer avec SCHOOLNET » : entrée publique cible

La page d'entrée doit présenter quatre actions compréhensibles :

1. **Apprendre sur SCHOOLNET :** apprenant libre ou parent qui inscrit un enfant dans les cours de la plateforme.
2. **Inscrire un établissement :** direction ou représentant habilité demandant l'adhésion de son école.
3. **Demander des cours à domicile :** parent ou apprenant demandant un accompagnement personnalisé.
4. **Accéder à mon compte :** utilisateur existant ou destinataire d'une invitation.

Le formulaire public **s'adapte à la demande** ; il ne cherche pas à tout collecter avant de connaître le besoin. Champs communs : catégorie de demande, identité et contact du responsable, éventuel apprenant, niveau, consentement/information utile. Les pièces, la classe officielle, la période et les options de tutorat sont demandées **seulement dans leur contexte**.

**Pour les mineurs :** demande portée ou autorisée par un responsable habilité. L'enfant sans e-mail personnel peut commencer par une **fiche apprenant liée à son responsable** ; un accès de connexion personnel ne sera créé que si son besoin et la politique d'âge le justifient.

### Trois workflows publics

**A — Apprenant libre**

```text
Visiteur / parent
  -> Choisir "Apprendre"
  -> Informations du responsable et de l'apprenant
  -> Demande publique reçue
  -> Vérification identité / responsabilité / doublons
  -> Réutiliser ou préparer les comptes / fiche apprenant
  -> Lien familial vérifié si applicable
  -> Proposer un cours ou groupe libre adapté au niveau
  -> Invitation / activation éventuelle
  -> Accès et suivi Parent / Apprenant
```

**Gate A :** le parent ne lit que ses enfants vérifiés ; l'apprenant reçoit le bon parcours libre ; **aucune école ni inscription annuelle artificielle**.

**B — Établissement et inscription scolaire (deux opérations distinctes)**

```text
Direction -> demande d'adhésion école -> contrôle par Super Admin
  -> Création école + code automatique SCH-xxxxxx
  -> Invitation du responsable local -> activation -> espace propre à l'école
  -> Classes officielles activées après recette tenant/RLS
  -> Demande élève -> validation par admin autorisé
  -> Compte / lien parent vérifié / inscription année-classe
  -> Invitation(s) -> accès Parent / Élève / Enseignant selon droits
```

**Gate B :** école vérifiée, admin local actif, classe/année valides, inscription annuelle cohérente, refus d'accès aux établissements tiers. **Ne pas mélanger l'adhésion d'une école et l'inscription d'un enfant.**

**C — Cours à domicile**

```text
Parent / apprenant -> demande de soutien -> besoins, niveau, disponibilités
  -> Validation / contact / proposition pédagogique
  -> Affectation d'un enseignant autorisé
  -> Planning de séances -> ressources et activités
  -> Compte rendu / progression -> retour Parent / Apprenant
```

**Gate C :** autorisation familiale, données strictement limitées au suivi concerné, aucun dossier annuel scolaire créé par défaut. **Le paiement et la contractualisation éventuels sont des décisions métier futures, non une fonctionnalité implémentée ici.**

---

## 4. Assistant administratif unique : supprimer la complexité du « Rattachement vérifié »

Au lieu d'envoyer l'administrateur dans trois menus puis de revenir sur la demande, l'interface doit conduire l'opération **dans un seul assistant**, en réutilisant les tables et la sécurité existantes.

| Étape | Action principale | Automatique / manuel | Contrôle obligatoire |
| --- | --- | --- | --- |
| 1. Dossier reçu | Reprendre les informations publiques, afficher type et référence | Automatique | Pas de création de compte sur simple soumission |
| 2. Recherche de personnes | Rechercher comptes et liens potentiellement existants | Recherche automatique, confirmation humaine | **Ne jamais fusionner sur le seul nom** |
| 3. Vérification | Identité, qualité du responsable, lien familial ou droit de représenter une école | **Validation humaine** | Attestation et preuve enregistrées, pas d'accès anticipé |
| 4. Préparation | Compte ou fiche, lien vérifié, groupe libre, dossier officiel ou demande domicile | Automatisée selon le parcours | Idempotence, pas de doublons, reprise après erreur |
| 5. Invitations | Lien personnel de définition du mot de passe si connexion nécessaire | Génération serveur | Jamais de mot de passe en clair ni de jeton affiché à nouveau |
| 6. Transmission | Copier message et objet ou ouvrir l'application de messagerie | **Envoi manuel actuellement** | Ne déclarer « envoyé » qu'après envoi réel |
| 7. Activation | Destinataire ouvre le lien et définit son mot de passe | Par l'utilisateur | Jeton temporaire, session cohérente, nouvelle connexion vérifiée |
| 8. Clôture | Confirmer comptes liés, inscription/groupe, accès final et journal | Automatique après contrôles et confirmation | Parcours complet et droits Parent/Apprenant vérifiés |

### Statuts de suivi recommandés

`reçue → en examen → vérifiée → préparation en cours → accès prêt → envoi déclaré → activée → finalisée`.  
Branches parallèles : `information manquante`, `refusée`, `erreur technique à reprendre`, `lien expiré à régénérer`.

**Attention :** ces statuts sont le **modèle cible** de l'assistant, pas les valeurs SQL actuellement implantées. L'ancien circuit `new/contacted/processed/rejected` doit être cartographié et migré uniquement après validation de la compatibilité. Ne jamais appeler une demande « finalisée » parce qu'un simple e-mail a été déclaré envoyé.

### Fiabilité transactionnelle et sécurité

- `auth.users` et les écritures PostgreSQL ne forment **pas une transaction unique**. Prévoir une **orchestration par étapes**, un identifiant stable de demande, des opérations idempotentes, des vérifications d'état et une **reprise contrôlée** après échec ; ne pas supprimer un compte existant pour « réparer » une tentative.
- Privilégier l'e-mail vérifié et les identifiants internes pour rapprocher les comptes ; en cas d'ambiguïté, imposer une vérification humaine. Pas d'auto-fusion parent/enfant.
- Les liens familiaux `parent_links` ne sont valides qu'après vérification administrative ; les droits RLS sur les documents et résultats restent déterminants.
- L'accès scolaire officiel impose en plus une école, une année et une classe autorisées. La préparation d'un accès ne vaut pas inscription officielle.
- Journaliser étapes, échecs, régénérations, envois déclarés, acteurs et dates **sans stocker les liens d'activation en clair** dans l'historique.
- Une invitation expirée doit se régénérer via le chemin prévu, en s'assurant des règles d'invalidation et des limitations de fréquence.

### Politique d'e-mail à court terme

Sans domaine d'envoi SCHOOLNET validé, **l'administrateur envoie manuellement** les invitations depuis sa messagerie. SCHOOLNET génère un **objet explicite** (ex. « SCHOOLNET — Activation de votre accès »), un message personnalisé, le bon destinataire, le nom du service / établissement et un bouton pour copier ou ouvrir un brouillon prérempli. L'état « envoi déclaré » n'est pas une preuve de réception.

La première invitation locale est arrivée dans les **spams, sans objet** lors du test utilisateur : le modèle d'e-mail manuel et sa délivrabilité sont des points de recette. Aucun envoi SMTP automatique n'est promis à ce stade.

---

## 5. État d'avancement réel — instantané du 10 novembre 2026

### 5.1. Réalisé ou activé

| Domaine | État constaté / frontière |
| --- | --- |
| V1, site public, cours/évaluations, notes, profils et messagerie | Socle existant, **à préserver**, avec recette de non-régression |
| Lots 1 à 4 : présences, emploi du temps, bulletins, notifications | Implémentations et **recettes ciblées déjà effectuées**, pas une nouvelle clôture globale |
| Lot 5.A : consultation des dossiers | Développé et recette ciblée Parent/Apprenant rapportée |
| Lot 5.B : confidentialité / justificatifs | RLS et stockage privé des documents d'inscription activés ; recette de téléchargement complet à confirmer |
| Lot 5.C : résolution vérifiée des demandes | Migration `20261109170500` **appliquée**, tests SQL positifs/négatifs réussis ; **parcours d'administration trop manuel** |
| Multi-écoles / comptes responsables | 2 écoles, code SCH automatique, 1 responsable local invité et activé, parcours réel d'activation testé |
| Sécurité S1 local | Migration `20261110141631` appliquée : 8 politiques de lecture renforcées sur 7 tables historiques, tests pour 5 rôles réussis |

### 5.2. Vérification Supabase lue aujourd'hui (lecture seule)

- **34 migrations** enregistrées ;
- **2 établissements**, **1 appartenance d'administrateur local**, **1 invitation** ;
- **4 demandes publiques**, **0 résolution finalisée** en base ;
- **1 lien familial vérifié**, **2 inscriptions annuelles historiques**, **2 classes historiques** ;
- Aucun champ S2 `classes.school_id` ou `classes.learning_context` installé et **aucune migration 5.D** appliquée.

Ces chiffres sont un **instantané de recette**, à actualiser lors du prochain jalon. Ils ne signifient pas que les demandes sont des inscriptions réelles : les demandes de test doivent rester distinguées des familles réelles.

### 5.3. Préparé mais non activé

| Chantier | État précis | Décision de pilotage |
| --- | --- | --- |
| **S2-A** — contexte et rattachement des classes | Proposition SQL, doublons et RLS multi-écoles testés avec `ROLLBACK` | **En pause**, pas d'activation |
| **S2-B** — formulaire / RPC de classes locales | Interface visible sur Preview, fonctions SQL préparées et testées avec `ROLLBACK` | **En pause**, écran en lecture seule / « activation en attente » |
| **Lot 5.D** — réinscription / passage d'année | Interface et SQL préparés, non appliqués ; anomalie sur une inscription active d'année non courante | **En attente**, après clarification du parcours officiel |
| Durcissement des RPC anciennes évaluations | Migration `20261109140104_harden_assessment_legacy_rpcs.sql` toujours non appliquée | Autorisation distincte et audit requis |
| Isolation multi-écoles complète | S1 est appliqué, mais cours, notes, emplois du temps, documents et stockage demandent encore des politiques tenant cohérentes | Condition préalable à l'ouverture de nouveaux modules locaux |
| Cours à domicile / groupe libre moderne | Parcours cible formalisé, tables et API spécifiques non validées | À développer après les fondations d'inscription |

---

## 6. NOUVEL ORDRE D'EXÉCUTION — une étape fonctionnelle à la fois

Les étapes **P** ci-dessous sont une **séquence transversale de remise en ordre** insérée avant la fin du Lot 5 et les modules restants. Elles **ne remplacent pas** les anciens numéros de lots.

| Ordre | Bloc | Livrable attendu | Critère de sortie / « GO » | État |
| --- | --- | --- | --- | --- |
| **P0** | Workflow de référence unique | Présent document V2, inventaire, points d'arrêt | Feuille de route relue, code gelé sur autres chantiers | **Documenté** |
| **P1** | Reprendre 5.C et les demandes publiques | Audit des 4 demandes, parcours administratif simplifié, modèles de demandes | Une demande fictive complète peut être traitée sans navigation manuelle entre modules | **Priorité immédiate** |
| **P2** | Comptes, identifiants et invitations | Recherche/reprise de comptes, parent-enfant vérifié, fiche mineur sans e-mail, envoi manuel assisté, reprise d'échec | Un parent et un apprenant de test obtiennent l'accès approprié, sans doublon ni divulgation | **À développer** |
| **P3** | Parcours **apprenant libre** | Entrée « Apprendre », groupe/cours libre, suivi Parent/Apprenant | Inscription et première activité libres de bout en bout, sans école ni dossier scolaire fictif | **À développer en premier parmi les 3 modes** |
| **P4** | Parcours **établissement** | Demande école, validation centrale, invitation admin local, inscription élève officielle, enseignants autorisés | Une famille et une école de test, classes/année cohérentes, aucune fuite vers école B | **Partiel ; S2 en pause** |
| **P5** | Parcours **cours à domicile** | Demande de soutien, affectation enseignant, calendrier, ressources, suivi | Un parcours domicile de test complet, sans création de classe officielle | **À cadrer / développer** |
| **P6** | Reprise **Lot 5.D** | Réinscription / redoublement / départ et bascule d'année réservées au mode établissement | Historique intact, 1 année courante, aucun doublon, anomalie 2026–2027 résolue par décision | **Préparé, non activé** |
| **P7** | Reprise des Lots 6 à 8 | Vie scolaire, frais de scolarité, documents scolaires et tests transversaux | Validation spécifique de chaque module et de chaque contexte | **Planifié** |

**Politique anti-dispersion :** ne pas ouvrir P4/S2, P5 ou P6 tant que **P1-P3** ne sont pas acceptés, sauf correctif de sécurité bloquant documenté et autorisé. On peut conserver la recherche/conception en réserve, mais **pas lancer plusieurs migrations en parallèle**.

### Détail de P1 : prochain travail exact

1. **Reprendre une demande fictive existante** dans Administration → Demandes publiques et documenter l'état réel des champs et des erreurs.
2. Classer la demande : apprenant libre / demande scolaire / demande d'accès parent existant / domicile / école ; ne pas modifier les anciennes données sans inventaire.
3. Dessiner **un assistant unique** avec étapes Réception → Recherche → Vérification → Préparation → Invitation → Finalisation.
4. Définir les actions réutilisant les RPC 5.C et identifier ce qui manque côté comptes Auth, messagerie et dossiers. **Ne pas casser la logique idempotente déjà testée**.
5. Construire et tester **un seul parcours bout-en-bout de référence : parent demande un accès pour un enfant apprenant libre** ; ensuite les variantes mineur sans e-mail et parent déjà inscrit.
6. Réconcilier les quatre demandes existantes de test : conserver leurs historiques, éviter les résolutions fictives non contrôlées.
7. **GO P1** seulement quand le formulaire, l'assistant, les vérifications et le statut final concordent dans l'interface **et** en base.

### Détail de P2 : accès et identifiants

- Un utilisateur existant est réutilisé selon des preuves et des autorisations explicites.
- Un compte non encore créé est préparé par une étape sécurisée ; un mineur sans e-mail peut rester une fiche liée au responsable.
- Un lien d'activation personnel n'est montré qu'une fois, son destinataire est contrôlé, et les renvois sont tracés.
- Le Super Admin et l'admin local peuvent inviter **uniquement dans leur domaine d'autorité** ; les enseignants/parents/apprenants n'ont pas de pouvoirs de promotion de rôles.
- Après activation, le navigateur effectue **une vraie connexion authentifiée** avant de charger les données protégées ; ne pas afficher un faux état « Aucun établissement » si la requête a échoué.
- Vérifier l'objet d'e-mail, la délivrabilité, l'ouverture et la régénération du lien ; aucun mot de passe n'est transmis à l'administrateur.

---

## 7. Les Lots 0 à 8 sont conservés

| Lot historique | Objet | État de pilotage actualisé | Dépendance future |
| --- | --- | --- | --- |
| **0** | Stabilisation transverse | Socle en place ; sécurité à améliorer continuellement | RLS, CI, stockage, authentification |
| **1** | Présences et absences | Implémenté, recettes ciblées | À revalider en contexte école A/B après P4 |
| **2** | Emploi du temps et salles | Implémenté ; codes automatiques des salles validés, recette complète selon parcours à confirmer | École et classe vérifiées, salles propres à chaque école |
| **3** | Bulletins | Implémenté avec recettes ciblées, vérifier publication et PDF sur scénarios réels | Inscriptions annuelles cohérentes |
| **4** | Notifications enrichies | Implémentations et tests réalisés ; vérifier évènements des parcours refondus | P1-P5, préférences et habilitations |
| **5** | Inscriptions et dossiers | **Lot en cours :** A/B engagés, C backend installé mais UX/recette inachevées, D préparé | **P1-P6 avant clôture finale** |
| **6** | Vie scolaire | À reprendre après le Lot 5 et l'isolation école | Classes, présences, responsables et confidentialité |
| **7** | Scolarité / Finances | À reprendre après dossiers officiels | **Différencier tarifs du site public et frais d'établissement** |
| **8** | Documents scolaires | À reprendre après dossiers, bulletins et finances | Numérotation, archivage, accès fichiers et PDF |

Les tests de la **visioconférence en conditions réelles** (caméra/micro sur mobile et ordinateur) ainsi que les recettes responsive et RLS transversales restent des **contrôles de qualité à prévoir**, pas des fonctionnalités supposées validées du seul fait qu'une page s'affiche.

---

## 8. Architecture de données : réutiliser plutôt que reconstruire

### Ressources existantes à préserver

- `auth.users` et `profiles` : **une identité**, pas de mot de passe enregistré dans le profil ou transmis en clair.
- `parent_links` et `profiles.child_ids` : liens familiaux vérifiés et synchronisés.
- `public_enrollment_requests` et `public_enrollment_request_resolutions` : demandes et clôture contrôlée du Lot 5.C.
- `student_enrollments`, `student_enrollment_events`, `student_enrollment_documents` : **dossiers annuels officiels** uniquement quand le contexte scolaire l'exige.
- `schoolnet_schools`, `schoolnet_school_memberships`, `schoolnet_school_admin_invitations`, `schoolnet_school_audit` : organisations, autorisations, invitations et audit.
- `classes`, `courses`, `course_enrollments` : héritage à conserver ; distinguer progressivement le groupe libre et la classe scolaire officielle.
- `school_years`, `rooms`, `timetable_slots`, `report_cards` : référentiels et modules scolaires historiques, à contextualiser sans déplacement massif.

### Structures **à étudier seulement si réellement nécessaires**

- `learning_context` / `school_id` pour la distinction classe officielle / groupe libre : **S2-A déjà testé, non activé**.
- Dossier de service d'accompagnement à domicile, affectation de l'enseignant et séances planifiées : **modèle futur**.
- Suivi de l'assistant et orchestration de préparation des comptes : privilégier **un journal d'étapes/idempotence** au lieu de dupliquer les profils, inscriptions ou demandes.
- Multi-rôles / relations pédagogiques d'une même personne : **analyse séparée**, ne pas casser `profiles.role`.

### Sécurité non négociable

- **RLS par établissement, par parent-enfant vérifié, par cours/élève et par ressource** ; un filtrage React n'est jamais une barrière suffisante.
- Les fonctions `SECURITY DEFINER` sensibles restent privées ou explicitement contrôlées ; vérification d'identité et de rôle côté serveur.
- Les accès aux fichiers privés exigent des politiques Storage / liens signés. Certains buckets historiques sont encore publics : ne pas promettre que leur lecture est sécurisée tant qu'ils ne sont pas revus.
- Ne pas publier d'adresse ou de lien d'activation avec jeton dans les captures ni les journaux.

---

## 9. Livrer sans se disperser : nos gates obligatoires

**Pour chaque prochain sous-lot :**

```text
Décision métier validée
  -> Audit des données / du code existants
  -> UX et règles de sécurité proposées
  -> Implémentation isolée sur branche
  -> SQL en BEGIN ... ROLLBACK (si nécessaire)
  -> Autorisation explicite AVANT toute migration réelle
  -> Recette ciblée avec utilisateurs de test
  -> RLS (5 rôles + 2 écoles dès que pertinent)
  -> Lint + build + responsive 412px/tablette/desktop
  -> Captures et GO explicite
  -> GitHub, vérification Vercel Preview
  -> Fusion main et production uniquement sur autorisation distincte
  -> Mise à jour immédiate du présent workflow
```

**À ne pas faire :** `supabase db push --remote` global sans revue, car des migrations indépendantes non autorisées existent (Lot 5.D, ancien durcissement des évaluations, S2). Pas de nouveau module ouvert simplement parce que son code est déjà sur GitHub.

### Conditions précises de clôture du chantier « inscriptions et accès »

1. Une demande publique de test est reçue, suivie et traitée **sans intervention technique dans Supabase Dashboard**.
2. Le parent existant est réutilisé, le parent nouveau peut être invité et le mineur sans e-mail est pris en charge selon un parcours documenté.
3. Aucun compte doublon n'est créé ; les échecs intermédiaires peuvent reprendre sans perdre le dossier ni élever les droits.
4. Le lien familial est vérifié et ses droits Parent/Enfant sont prouvés par un test négatif avec un autre enfant.
5. La différence est testée entre **adhésion libre**, **inscription scolaire annuelle** et **accompagnement à domicile**.
6. La gestion manuelle des e-mails est simple, avec objet, message, lien temporaire et statut d'envoi honnête.
7. Les administrateurs locaux ne voient que leur école ; le Super Admin conserve sa supervision ; toutes les données de test sont contrôlées.
8. La version prête est validée après test, et la documentation reflète le résultat réellement livré.

---

## 10. Tableau de pilotage à actualiser après CHAQUE séance

| Champ de suivi | Valeur au 10/11/2026 |
| --- | --- |
| **Priorité active** | P1 : 5.C, demandes publiques et assistant de finalisation |
| **Action utilisateur suivante** | Ouvrir une demande fictive dans « Demandes publiques », analyser le panneau de rattachement sans finaliser |
| **Dernier lot réalisé** | S1 : cloisonnement initial du rôle local, appliqué et testé ; S2-B : écran préparé, testé et suspendu |
| **Blocages connus** | 0 demande 5.C durablement résolue ; création comptes/identifiants multi-profils encore manuelle ; certains buckets Storage publics ; 5.D non appliqué |
| **Prochaine recette GO** | Inscription libre + parent vérifié + identifiants + première connexion, sans créer un dossier scolaire artificiel |
| **Branche** | `feature/schoolnet-multi-etablissements` / PR #6 brouillon (base PR #5) |
| **Base** | Supabase `schoolnet_2.0`, 34 migrations |
| **Production** | `main` non fusionné, site Vercel principal non modifié |
| **Lot à ne pas ouvrir** | S2-A/S2-B, 5.D, Lots 6–8 avant les gates correspondants |

**Rituel obligatoire de fin de séance :** indiquer *étape*, *travaux effectués*, *preuves/tests*, *scripts appliqués ou non*, *commit et branche*, *blocages*, *seule prochaine action*, puis **mettre à jour le tableau**. En cas d'interruption de travail, relire ce tableau et l'état Git/Supabase avant de reprendre.

## 11. Historique et documents de référence

- **Octobre 2026** : workflow original post-V1, 19 pages, Lots 0–8, règles de qualité et de déploiement ; **conservé comme référence historique**.
- **9–10 novembre 2026** : Lot 5.C backend de résolution, Lot 5.D préparé, nouvelle fondation écoles et invitation manuelle, génération automatique des codes, sécurité S1.
- **10 novembre 2026** : re-priorisation **inscriptions et identifiants d'abord**, prise en compte explicite des **trois modes d'apprentissage**, **mise en pause de S2-A/S2-B**, préservation des Lots 0–8.

### Références GitHub détaillées

- `docs/roadmap-schoolnet-post-v1-lots-restants-et-salles.md` : suivi antérieur des lots, conservé pour historique.
- `docs/lot-5-c-cadrage-demandes-et-rattachement.md` : sécurité des résolutions et état backend Lot 5.C.
- `docs/lot-5-d-reinscriptions-et-cloture-annee.md` : passage d'année non activé et anomalie annuelle existante.
- `docs/architecture-schoolnet-multi-etablissements-et-invitations.md` : écoles, rôle local et invitations.
- `docs/audit-isolation-multi-etablissements-phase-1.md` : audit RLS, protection S1 activée.
- `docs/lot-s2-classes-multi-etablissements-conception-et-recette.md` et `docs/lot-s2-b-formulaire-classes-et-rpc-securisees.md` : propositions S2 **non activées**.

**Prochaine décision :** valider ce workflow V2 comme source de pilotage, puis **reprendre uniquement P1**. Ne pas lancer de migration ni de chantier S2 en attendant.
