# SCHOOLNET — Guide de synchronisation GitHub et tests locaux (Windows 11)
## Procédure de secours tant que Vercel Preview ne reflète pas le dernier commit

**Référence :** Workflow directeur V2.2 du 10 novembre 2026.
**Branche de travail :** feature/schoolnet-multi-etablissements.
**PR ouverte :** #6, brouillon, basée sur feature/schoolnet-notifications (#5), elle-même basée sur main.
**Périmètre :** développement et tests du frontend React/TypeScript/Vite. Ne modifie ni main, ni la base Supabase distante, ni la production Vercel par la seule synchronisation Git.

> Important : le dépôt sur le PC de l'utilisateur n'est pas accessible depuis GitHub ou cette conversation. Cette procédure **doit être exécutée sur le PC local** ; aucune synchronisation effective du PC n'est revendiquée dans ce document.

## 1. Préparer la copie locale sans rien perdre

Ouvrir PowerShell dans le dossier de SCHOOLNET (le dossier qui contient package.json), puis lancer **uniquement les commandes de contrôle** :

~~~powershell
git status --short
git branch --show-current
git remote -v
git log -1 --oneline
~~~

**Si git status --short affiche des fichiers modifiés ou non suivis : STOP.** Ne pas écraser, supprimer, réinitialiser, rebaser ou appliquer un stash automatiquement. Conserver la capture du résultat pour examiner ces modifications avant de changer de branche.

Vérifier que le remote origin désigne bien **ramon77777/schoolnet**. Si ce n'est pas le bon dépôt, ne pas poursuivre.

## 2. Récupérer les sauvegardes GitHub

~~~powershell
git fetch origin --prune
git branch --list feature/schoolnet-multi-etablissements
~~~

**Cas A :** la branche apparaît dans la dernière commande.

~~~powershell
git switch feature/schoolnet-multi-etablissements
git pull --ff-only origin feature/schoolnet-multi-etablissements
~~~

**Cas B :** la branche n'existe pas localement, mais origin/feature/schoolnet-multi-etablissements existe.

~~~powershell
git switch --track origin/feature/schoolnet-multi-etablissements
~~~

**Si git pull --ff-only échoue**, la branche locale et GitHub ont divergé. STOP et communiquer les sorties de git status, git branch -vv et git log. Ne pas forcer la synchronisation : le PC peut contenir du travail non sauvegardé.

### Vérification de concordance

~~~powershell
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/feature/schoolnet-multi-etablissements
git log -1 --oneline
~~~

Les deux valeurs de git rev-parse doivent être **identiques**. La SHA du dernier commit peut changer quand le workflow est mis à jour : utiliser la branche distante comme référence, **pas** un ancien code fixe. Le dernier commit **applicatif** vérifié avant la mise à jour documentaire est 563149e.

**S'il n'y a encore aucune copie du dépôt sur le PC**, utiliser une première fois :

~~~powershell
git clone https://github.com/ramon77777/schoolnet.git
cd schoolnet
git fetch origin --prune
git switch --track origin/feature/schoolnet-multi-etablissements
~~~

Un dépôt privé nécessite une authentification GitHub valide ; ne pas transmettre de jeton d'accès dans la conversation.

## 3. Installer et contrôler les dépendances

Le dépôt contient **package-lock.json** et utilise React, TypeScript et Vite 7. Depuis sa racine :

~~~powershell
node -v
npm -v
npm ci
npm run lint
npm run build
~~~

Choisir une version de Node.js compatible avec la version de Vite installée (Node.js LTS moderne). Tout échec de lint ou build doit être corrigé **avant** la recette, sans masquer l'erreur.

## 4. Variables locales et environnement distant : vigilance absolue

Le code lit les variables **VITE_SUPABASE_URL** et **VITE_SUPABASE_ANON_KEY** depuis l'environnement Vite. Le formulaire public utilise **VITE_TURNSTILE_SITE_KEY**.

- Réutiliser la configuration locale *déjà autorisée* si elle existe ; sinon créer **.env.local** à la racine, et renseigner **uniquement** l'URL du projet Supabase et la clé publique/anon de l'environnement choisi, ainsi que la clé publique Turnstile si le formulaire public est testé.
- **Ne jamais placer SUPABASE_SERVICE_ROLE_KEY, clés administrateur, secrets ou jetons** dans un fichier accessible au navigateur et particulièrement pas dans une variable VITE_.
- Les fichiers **.env*** et .env.local sont ignorés par le .gitignore du dépôt. Ne jamais les commiter ni copier leur contenu dans les captures.
- Une application qui tourne sur localhost peut être connectée au **même Supabase distant que la production**. L'interface locale n'isole **pas** les données. Les tests du sous-lot 5.C-A sont en **lecture seule**.
- Toute opération d'écriture (comptes, invitations, rattachements, classes, demandes) requiert un environnement de test isolé ou une autorisation et un jeu de données contrôlé. Ne pas tester à l'aveugle des migrations sur la base distante.
- Les fonctions Edge restent des fonctions **distantes** lorsqu'elles sont invoquées avec l'URL de Supabase distante ; npm run dev ne les remplace pas localement.
- Si des parcours d'invitation sont testés un jour sur localhost, vérifier la liste des URLs de redirection autorisées dans Supabase Auth et le hostname localhost dans Cloudflare Turnstile, **sans modifier ces paramètres sans validation**.

## 5. Lancer SCHOOLNET sur le PC

~~~powershell
npm run dev -- --host localhost --port 5173 --strictPort
~~~

Ouvrir **http://localhost:5173** dans Chrome. Conserver le terminal Vite ouvert pendant les tests. Pour arrêter : **Ctrl+C**.

### Recette ciblée du sous-lot 5.C-A (premier test recommandé)

1. Se connecter avec le **compte Super Administrateur de test** préalablement autorisé.
2. Aller dans le menu **Demandes publiques** et ouvrir une demande fictive existante.
3. Vérifier l'apparition de **« Assistant de préparation — étape 1 : reconnaissance »**.
4. Vérifier le rapprochement par e-mail, les homonymes signalés sans identité attribuée automatiquement, et la proposition de classes **déjà existantes** du niveau indiqué.
5. Vérifier l'année scolaire proposée ; une année différente de l'année courante doit être signalée et non affectée automatiquement.
6. Vérifier les cas : compte Parent existant, Apprenant existant, e-mail non fourni, adresse employée par un autre rôle, absence de classe.
7. **Ne pas cliquer sur « Finaliser et rattacher » ; ne créer ni compte ni inscription pour cette recette de reconnaissance.**
8. Conserver une capture de l'écran et les messages de la console en cas d'erreur, sans partager les données personnelles ni les liens d'activation.

**GO 5.C-A :** reconnaissance correcte, absence d'écritures, aucun déblocage de rôle ; validation explicite de l'utilisateur.

## 6. Continuer à développer sans Vercel

~~~powershell
git status --short
npm run lint
npm run build
git diff --stat
~~~

Après chaque petit bloc :
- Vérifier la branche active, isoler les changements liés au lot, exécuter la recette locale, faire une sauvegarde Git propre uniquement après validation.
- Pousser vers **feature/schoolnet-multi-etablissements**, jamais vers main par défaut. Tout push peut déclencher une tentative de Preview Vercel, **sans garantir** sa réussite si la limitation de fréquence persiste.
- Une fois le quota Vercel rétabli, comparer **la SHA exacte du déploiement Preview** à la SHA testée localement et à GitHub. « Ready » sur un ancien commit n'est **pas** une preuve de validation du dernier développement.
- Avant toute fusion vers main : tests de sécurité RLS et de non-régression, recette responsive mobile/tablette/desktop, accord explicite de l'utilisateur.

**Interdictions sans autorisation :** git reset --hard, git push --force, suppression/recréation de branche, supabase db push --remote, modification de la base distante, création de comptes réels, envoi d'e-mails, fusion main et déploiement en production.

## 7. Fin de séance : informations obligatoires

- Branche et SHA locale ; SHA de origin/feature/schoolnet-multi-etablissements ;
- git status --short ;
- fichiers et comportements modifiés ;
- lint/build et captures de recette ;
- migrations Supabase appliquées ou explicitement **non** appliquées ;
- statut réel Vercel et SHA de la dernière Preview exploitable ;
- étape suivante **unique**.

**Sources techniques :** package.json, package-lock.json, .gitignore, src/lib/supabaseClient.ts, src/features/public/pages/PublicEnrollmentRequest.tsx et PR #6 de SCHOOLNET (vérifiés le 10/11/2026).
