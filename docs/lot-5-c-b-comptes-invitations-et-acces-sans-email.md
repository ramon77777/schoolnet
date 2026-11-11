# SCHOOLNET 2.0 — Lot 5.C-B : comptes, invitations et apprenants sans e-mail
## Décision fonctionnelle et avancement progressif (11 novembre 2026)

**Branche :** `feature/schoolnet-multi-etablissements` — PR #6.  
**Référence :** `docs/WORKFLOW_DIRECTEUR_SCHOOLNET_2_0_2026-11-10.md` (workflow directeur V2.2).  
**État :** première tranche d'interface préparée ; aucun compte créé, aucune fonction Edge déployée, aucune migration appliquée.

> SCHOOLNET fonctionne déjà : l'enjeu est d'automatiser l'inscription et les accès sans reconstruire le système des classes, des cours, des enseignants ou du LIVE.

## 1. Les trois adresses / identifiants à ne pas confondre

1. **Identifiant d'authentification :** celui que Supabase Auth utilise pour connecter une personne (e-mail propre, ou numéro de téléphone propre si l'authentification téléphonique est activée).
2. **Coordonnée de contact familial :** l'e-mail et le téléphone du parent, qui peuvent être utilisés pour les échanges concernant plusieurs enfants **sans devenir leurs identifiants Auth**.
3. **Identifiant SCHOOLNET de l'apprenant :** code propre au dossier pédagogique, qui ne devient **pas automatiquement** un identifiant utilisable pour `signInWithPassword`. Un éventuel parcours « code élève + mot de passe » nécessitera un vrai mécanisme serveur sécurisé.

**Preuve technique locale :** le schéma Auth du projet comporte `users_phone_key` (index unique sur `auth.users.phone`) et `users_email_partial_key` (e-mail Auth unique). Un parent et plusieurs élèves ne peuvent donc pas disposer simultanément du **même numéro Auth** ou du **même e-mail Auth**.

**Supabase prend en charge :** `signInWithPassword({ phone: '+225...', password: '...' })` si le fournisseur Phone Auth est configuré, et `signInWithPassword({ email, password })` déjà utilisé aujourd'hui. L'OTP SMS/WhatsApp et la validation du téléphone peuvent nécessiter un fournisseur externe payant et doivent être validés avant activation. Supabase recommande une protection forte car les numéros peuvent être réattribués. Ne pas annoncer la connexion téléphonique comme opérationnelle aujourd'hui.

## 2. Matrice des parcours d'accès

| Cas | Accès de l'apprenant | Invitation / transmission | Décision actuelle |
| --- | --- | --- | --- |
| Apprenant avec e-mail personnel distinct | Son propre e-mail + mot de passe choisi lors de l'activation | Lien d'invitation personnel vers cet e-mail ; suivi administratif | **Périmètre de développement 5.C-B**, à tester |
| Parent avec e-mail déjà présent dans un profil Parent actif | Réutilisation de son compte Parent | Pas de création ni promotion automatique ; l'administration confirme identité et lien familial | **Reconnaissance existante + présélection** |
| Parent nouveau avec e-mail personnel | Compte Parent distinct | Lien d'activation personnel, message prêt à envoyer manuellement | **Périmètre de développement 5.C-B**, à tester |
| Apprenant avec numéro personnel unique, sans e-mail | Son téléphone propre + mot de passe, après vérification du numéro et configuration Phone Auth | E-mail parent pour informations de suivi ; **ne pas utiliser un lien Auth lié à l'e-mail parent pour ouvrir le compte élève** | **Capacité à cadrer/configurer séparément** |
| Apprenant sans e-mail et utilisant le téléphone du parent | **Pas de connexion enfant utilisant le même identifiant Auth que le parent.** Prévoir un accès élève individuel via un parcours parent supervisé ou une méthode d'identifiant distinct | Adresse e-mail du parent pour les informations et la supervision, éventuellement un parcours d'activation spécifique, côté serveur | **À concevoir et tester avant toute création d'accès enfant** |
| Deux enfants avec un seul numéro familial | Deux fiches/identités pédagogiques distinctes ; téléphone commun comme **contact**, jamais comme identifiant Auth partagé | Correspondance et invitations suivies par le parent habilité | **Pas de création automatique d'identifiants téléphoniques** |

**Exemple de demande existante :** le responsable possède déjà une adresse e-mail et un compte Parent correspondant, mais l'apprenant n'a pas d'e-mail personnel. SCHOOLNET peut suggérer le Parent après contrôle, puis signaler que **l'accès autonome de l'enfant reste à préparer**. Il ne doit ni inventer un e-mail fictif, ni réutiliser l'adresse du parent comme identifiant Auth de l'enfant, ni créer un mot de passe et l'envoyer en clair.

## 3. Tranches prévues, un seul test à la fois

### 5.C-B.1 — Préparation et présélection des comptes (réalisée sur GitHub)

- **Fichier :** `src/features/enrollments/components/AdminEnrollmentRequestPreflight.tsx`.
- **Intégration :** `src/features/enrollments/components/AdminRequestResolutionPanel.tsx`.
- Pour une adresse e-mail associée à **un seul compte actif**, du bon rôle **et au nom concordant**, afficher un bouton « Présélectionner ce compte ».
- Clic : met à jour **uniquement la sélection dans le formulaire**, efface l'attestation familiale précédente et réinitialise la vérification du lien. La **RPC de finalisation n'est jamais appelée** par cette action.
- Un compte inactif, un compte d'un autre rôle, plusieurs comptes, ou un nom discordant exigent une vérification manuelle, sans suggestion automatique.
- Afficher un plan de préparation **sans écriture** indiquant la situation Parent, Apprenant et les cas sans e-mail.
- **GO :** dans une demande test, le compte Parent proposé est présélectionné en un clic, la confirmation du lien familial reste décochée et rien n'est écrit en base.

### 5.C-B.2 — Invitation serveur Parent et Apprenant avec e-mail propre (prochaine étape)

- Créer une **fonction serveur spécifique aux familles**, distincte de `schoolnet-admin-invitation` réservée aux administrateurs d'école.
- Authentifier l'appelant Admin, contrôler les états de la demande, la vérification humaine et l'e-mail cible ; éviter l'élévation de rôle et les doublons Auth/`profiles`.
- Utiliser le mécanisme éprouvé de génération de lien temporaire **sans mot de passe administrateur** et la page de définition de mot de passe existante ; l'appel serveur seul peut accéder à la clé privilégiée.
- Prévoir une reprise **idempotente** : ne jamais effacer un compte existant en cas d'échec ; journaliser la préparation et les relances sans stocker le jeton en clair.
- L'administrateur copie le message préparé avec son **objet**, destinataire et lien personnel, envoie manuellement, puis déclare l'envoi. Ne jamais prétendre que l'ouverture de la messagerie prouve l'envoi.
- **Pas de déploiement de fonction ni de compte réel dans la tranche B.1.**

### 5.C-B.3 — Accès pour les apprenants sans e-mail

- Vérifier d'abord les options Supabase Phone Auth **et leurs coûts réels en Côte d'Ivoire** avant de l'activer. Le formulaire public devra recueillir le téléphone **personnel de l'apprenant** lorsqu'il en possède un, distinct du téléphone familial.
- Si un apprenant n'a que le téléphone du parent, définir un parcours d'identifiant enfant **non partagé**, avec activation sous la responsabilité d'un Parent déjà authentifié et lien familial vérifié.
- L'e-mail du parent est une **adresse de correspondance**, pas un e-mail Auth secondaire permettant de créer plusieurs comptes enfant par `generateLink`. L'envoi de l'accès de l'enfant par cet e-mail exigerait une logique d'invitation/activation sécurisée propre.
- Tester les cas : même numéro fourni pour parent + enfant, deux enfants d'un même parent, changement de numéro, récupération de compte et aucune fuite vers un autre enfant.
- Aucun dispositif de téléphone n'est activé tant que ces conditions ne sont pas validées.

### 5.C-B.4 — Raccordement à la finalisation 5.C-C

Après les invitations et les connexions, garder la vérification du Parent, la RPC de classe existante (`admin_assign_student_to_class`) et la RPC de finalisation (`admin_finalize_public_enrollment_request`). L'ordre de création et l'échec intermédiaire doivent être gérés proprement ; **aucun nouvel élève ne doit être lié sur simple coïncidence de nom ou d'e-mail**.

## 4. Sécurité et contraintes conservées

- 5.C-B.1 **n'envoie aucune requête d'écriture** ; il ne fournit que des pré-sélections d'identifiants existants déjà visibles à l'Admin.
- **Le lien Parent–Enfant n'est jamais vérifié automatiquement.** Il faut confirmation de l'Administrateur et finalisation dans la RPC de sécurité.
- Ne pas insérer d'e-mail fictif pour les enfants ; ne pas partager le même mot de passe ou le même compte Auth Parent entre membres de la famille.
- Pour l'instant, SCHOOLNET utilise **e-mail + mot de passe** sur son écran de connexion. Le téléphone **n'y est pas encore connecté**.
- Tous les nouveaux liens d'activation doivent être temporaires, réservés au bon destinataire et protégés contre la réutilisation et les tentatives répétées.
- Tester les liens de Supabase avec l'environnement voulu : localhost/Preview/Production, et ne jamais utiliser la session Admin en cours pour activer un compte élève.
- Ne pas mélanger ce chantier avec E3/S2 écoles, migration 5.D, finances, documents ou développement de cours à domicile.

## 5. Tests ciblés et état de livraison

**Local (PC utilisateur) :** une fois le code récupéré, `npm run lint`, `npm run build`, `npm run dev -- --host localhost --port 5173 --strictPort`, puis Super Admin → Demandes publiques → ouvrir une demande fictive déjà existante.

Vérifier :
1. Bloc « Étape 2 — Accès à préparer » visible et explicitement non actif.
2. Compte Parent connu et concordant : bouton **Présélectionner ce compte**, puis sélection effective dans le formulaire.
3. Case de vérification familiale **non cochée**, aucun bouton de finalisation activé sans les conditions existantes.
4. Cas enfant sans e-mail : avertissement numéro propre / téléphone parent de contact, pas de promesse de connexion téléphone déjà opérationnelle.
5. Absence d'écriture : pas d'invitation envoyée, aucun compte ou dossier créé.
6. Capture d'écran et résultat à valider **avant** 5.C-B.2.

**Important :** le PC local peut être connecté au même projet Supabase distant que Vercel ; ne pas cliquer « Finaliser et rattacher » pour ce test.

## 6. État de GitHub et de Supabase

- Code et document préparés sur **PR #6, branche `feature/schoolnet-multi-etablissements`**.
- **34 migrations Supabase** au dernier contrôle ; aucune migration supplémentaire demandée ou appliquée ici.
- Pas de déploiement de nouvelle Edge Function, pas de modification du fournisseur Phone Auth, pas de nouveau compte, pas de nouveau mot de passe, pas d'e-mail envoyé.
- Le dernier commit GitHub devra être récupéré **sur le PC** avec `git status --short` puis `git pull --ff-only` si le répertoire est propre. Vérifier ensuite la SHA locale ; le PC ne se synchronise pas automatiquement.
