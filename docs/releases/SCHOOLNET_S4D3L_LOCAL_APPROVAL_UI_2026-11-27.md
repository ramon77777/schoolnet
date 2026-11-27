# SCHOOLNET V2 — S4-D.3l : actions d'approbation fonctionnelles sur Supabase local

**27 novembre 2026 — Interface de laboratoire uniquement, aucune production modifiée.**

## Ce qui fonctionne réellement dans ce lot

Sur la page SCHOOLNET « Bulletins et exports », avec le mode de laboratoire explicitement demandé :
- Connexion avec **de vrais comptes Auth GoTrue locaux** \`school_admin\` (demandeur et décideur distincts).
- Sélection d'un **élève fictif** issu de la projection officielle V2 locale.
- **Ouvrir le dossier** : appelle une véritable RPC PostgreSQL, crée snapshot + dossier + audit.
- **Soumettre le bulletin** : modifie l'état du dossier et écrit l'événement PostgreSQL.
- **Changer de compte**, puis **Approuver / Refuser / Demander une correction**, avec motif requis pour les deux dernières actions.
- **Autoriser la publication**, via une habilitation distincte, après approbation.
- **Actualiser depuis PostgreSQL** : relit le dossier, son numéro de version, les permissions actuelles et les événements réellement persistés.

Aucun statut n'est inventé après un clic : **l'interface relit la RPC serveur** avant d'annoncer l'enregistrement. Un compte ayant perdu son appartenance ou son mandat est refusé. Un dossier incomplet n'est pas ouvert ; une note publiée égale à zéro reste valide.

### Limite explicite

Le **PDF officiel**, le stockage privé, le droit d'accès des familles et la transition \`publication_executed\` **ne sont pas opérationnels**. L'état final visible dans ce lot est \`authorized_for_publication\`, **pas \`published\`**.

Le laboratoire exploite uniquement le SQL installé dans **les conteneurs Supabase jetables** :
- \`tests/s4d3k/disposable-bulletin-workflow.sql\` : six tables privées et RPC de création/décision.
- \`tests/s4d3l/disposable-case-read-and-login.sql\` : lecture restreinte du dossier et de l'historique, plus lecture RLS de son propre profil pour que la connexion normale SCHOOLNET fonctionne.
- Les données d'élèves et les programmes V2 sont les fixtures fictives déjà éprouvées en S4-D.3k.

## Protection contre toute intervention sur Supabase principal

Le mode ne s'affiche que si **toutes** ces conditions sont vraies :
1. \`import.meta.env.DEV===true\`.
2. \`VITE_SCHOOLNET_S4D3L_LAB=1\`.
3. L'origine du navigateur est \`localhost\` ou \`127.0.0.1\`.
4. \`VITE_SUPABASE_URL=http://127.0.0.1:55421\` **exactement**.
5. La page porte le paramètre \`?schoolnet_s4d3l_lab=1\`.
6. Le compte est un vrai \`school_admin\` (pas un compte de démo).

La bibliothèque d'appels refuse également toute mutation si un de ces contrôles n'est plus respecté. Le serveur PostgreSQL **revérifie indépendamment** JWT, établissement, adhésion active, délégation, version et état. Ne jamais mettre une clé \`service_role\` dans le frontend : l'initialiseur l'utilise seulement côté Node pour créer les comptes **sur localhost**, jamais pour une page web.

Le script refuse tout Supabase local non vierge, vérifie le projet Docker exact et ne possède aucune commande de \`supabase link\`, \`db push\` ou connexion hébergée.

## Recette sur Windows — progression ciblée

Ne pas relancer les anciennes recettes S4-D.3a à S4-D.3k. Vérifier d'abord que le travail local est propre.

### A. Récupérer le lot et tester les fichiers

~~~powershell
cd "D:\Bakary\10 autres\schoolnet-tests"

git status -sb
git fetch origin
git switch -c local/schoolnet-s4d3l --track origin/feature/schoolnet-s4d3l-local-interactive-approval-20261127
git log -1 --oneline

npm run qa:s4d3l
npm run build

git restore -- tsconfig.app.tsbuildinfo
git status -sb
~~~

### B. Préparer l'environnement isolé (Docker Desktop requis)

Le test local utilise **Docker Desktop**, **Node/npm** et Supabase CLI \`2.122.1\` via \`npx\`. Aucun psql Windows n'est nécessaire : le script exécute les commandes dans le conteneur Docker de ce laboratoire.

~~~powershell
docker version
npx --yes supabase@2.122.1 --version

cd "D:\Bakary\10 autres\schoolnet-tests\tests\s4c3c35-supabase-ci"
npx --yes supabase@2.122.1 start -x realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

cd "D:\Bakary\10 autres\schoolnet-tests"
npm run lab:s4d3l:setup
~~~

Le script vérifie et peuple **seulement** \`http://127.0.0.1:55421\`, avec onze comptes fictifs et deux administrateurs distincts de l'établissement A. Il crée deux fichiers locaux **ignorés par Git** :
- \`.env.s4d3l.local\` : URL + clé publique (\`anon\`) du Supabase local.
- \`tests\s4d3l\.lab-credentials.local\` : identifiants fictifs du compte *requester* et du compte *decisionMaker*.

**Ces identifiants sont des comptes de laboratoire, pas des comptes réels.** Ne jamais copier les mots de passe, les URL ou les clés du projet Supabase principal dans ces fichiers.

~~~powershell
Get-Content "tests\s4d3l\.lab-credentials.local"
npm run dev -- --mode s4d3l --port 5174
~~~

Lancer Vite sur **5174**, indépendamment du port 5173 de SCHOOLNET habituel, pour ne pas réutiliser les sessions précédentes.

### C. Vérifier les actions dans le navigateur

1. Ouvrir : \`http://localhost:5174/auth/login\`, puis se connecter avec \`requester\`.
2. Ouvrir : \`http://localhost:5174/app/school/official-documents?schoolnet_s4d3l_lab=1\`.
3. Établissement fictif A → **Élève fictif A1**, moyenne calculable. Cliquer **Ouvrir le dossier**, puis **Soumettre le bulletin**. Vérifier **Soumis à décision** et deux événements dans l'historique.
4. Cliquer **Changer de compte** et se connecter avec \`decisionMaker\`. Revenir à la même adresse du laboratoire, puis choisir **A1**. Cliquer **Approuver** ; le statut doit devenir **Approuvé**. Ensuite **Autoriser la publication** ; l'état doit devenir **Publication autorisée — pas encore publiée**, avec quatre événements.
5. Cliquer **Actualiser depuis PostgreSQL** : le statut et les quatre événements doivent être conservés.
6. Vérifier qu'aucun bouton **Publier un PDF** n'est proposé. **Élève fictif A2** doit rester incomplet ; **A3** possède une moyenne nulle valide.

Ne pas réutiliser l'environnement de test pour des données scolaires réelles. L'affichage du laboratoire est une fonctionnalité **réelle mais destinée à la recette**, pas une installation de production.

### D. Nettoyage après recette et vérification

Après avoir enregistré les captures et les résultats, fermer le serveur Vite (\`Ctrl+C\`), puis **uniquement si tu souhaites détruire le bac à sable** :

~~~powershell
cd "D:\Bakary\10 autres\schoolnet-tests\tests\s4c3c35-supabase-ci"
npx --yes supabase@2.122.1 stop --no-backup
~~~

**Attention :** cette commande supprime la base jetable et les comptes fictifs. Le script de création refuse ensuite une deuxième initialisation tant que les deux fichiers locaux précédents existent ; pour refaire une installation entièrement neuve, supprimer **uniquement** \`.env.s4d3l.local\` et \`tests\s4d3l\.lab-credentials.local\` après avoir détruit le bac à sable.

## Vérification automatisée GitHub Actions

La CI doit installer le vrai Supabase local, exécuter \`npm run lab:s4d3l:setup\`, puis des tests HTTP **avec authentification JWT réelle** :
- Le compte ne peut voir que son propre profil.
- Le demandeur voit son dossier en lecture, mais ne peut approuver lui-même.
- Le décideur relit le dossier, approuve puis autorise la publication avec permission distincte.
- L'historique persiste entre les différents comptes.
- Un établissement étranger ou un compte non habilité est refusé.
- Aucun PDF, aucune publication familiale, aucune écriture sur l'instance hébergée.

Le contrôle de cette PR est **un test technique et fonctionnel**, pas une validation d'utilisation par les établissements. Une migration principale et la fusion des PR ne sont **pas autorisées** par ce lot.

## Suite de livraison sans nouveaux panneaux de conception

Après validation visuelle S4-D.3l, la suite prioritaire sera :
1. Finaliser les opérations de **correction/reprise** et raccorder les habilitations à la véritable administration des établissements sur une **préproduction isolée**.
2. Générer un document PDF privé/versionné à partir d'un snapshot approuvé, autoriser sa diffusion séparément et tester l'accès parent/élève et le retrait.
3. Recette consolidée de sécurité et des règles officielles propres aux cycles scolaires, puis GO explicites pour la base principale, les PR, \`main\` et le déploiement Vercel.

**État : PR brouillon, SQL exclusivement sous tests/, Vercel Preview désactivée, aucun Supabase principal modifié.**
