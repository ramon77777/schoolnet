# SCHOOLNET V2 — S4-C.3-C.4 — Interface des moyennes générales officielles

**26 novembre 2026 — PR brouillon / branche isolée / pas de publication.**

## Périmètre livré

Nouvelle page « Moyennes générales officielles », réservée par le routeur au rôle `school_admin`, intégrée au menu et au tableau de bord de l'établissement :

- Établissement **autorisé** par affiliation `school_admin` active, année scolaire, classe et période ; aucun accès croisé A/B.
- Reprise de la RPC existante de **configuration** C.3-A pour les années, périodes, matières et classes ayant des matières activement affectées. Aucune table privée lue directement.
- **Programme des matières attendues** : lecture et statut `missing/draft/approved`, coefficients éventuels, sélection de 1 à 60 matières, enregistrement sur confirmation explicite, approbation distincte sur confirmation ; verrouillage de la période respecté. Ces écritures utilisent uniquement la RPC C.3-C.3.3 proposée, **non installée actuellement sur le Supabase principal**.
- Prévisualisation des moyennes **exclusivement après approbation**, avec comptages `ready/incomplete/not_configured`, recherche locale accent-insensible, filtre, pagination de 20, affichage mobile dans un conteneur défilant.
- Aucun recalcul de note ou collecte de soumissions côté navigateur. Une moyenne existe uniquement si le serveur répond `ready` et renvoie un chiffre `0..20`; zéro publié est valide, les résultats non complets restent « — ».
- Le réseau renvoie uniquement la projection minimale *élève, état, moyenne générale, complétude* ; le validateur frontend refuse tout champ imprévu, note brute, données d'autre classe/école ou nombre d'élèves incohérent.
- **Pas de bulletin**, pas d'export, pas de publication ni modification de notes. Les moyennes V1 restent intactes.

## Dépendances et contrats de sécurité

Cette PR repose sur les PR #40 → #41 → #42 → #43 → #44 → #45 → #46 → #47, sans aucune fusion. Les signatures des RPC proposées (depuis la PR #42) sont :

- `schoolnet_school_official_curriculum(p_school_id, p_period_id, p_class_id, p_action, p_subject_ids)`
- `schoolnet_school_official_general_averages(p_school_id, p_period_id, p_class_id)`

Le navigateur utilise les fonctions publiques uniquement ; la véritable autorisation reste **serveur**, via rôle, affiliation active et périmètre école/année/classe/période. La validation locale côté TypeScript est une défense supplémentaire, pas une autorisation d'accès.

Sans RPC sur la base réellement connectée, l'écran affiche **« Activation SQL en attente »** et ne présente jamais des notes fictives à la place des vraies données. Le test isolé Supabase Auth/JWT/PostgREST de #45/#46 reste distinct d'une installation sur production.

L'éditeur de programme n'utilise que les matières déjà exposées par la configuration C.3-A pour la classe sélectionnée. Si le programme enregistré référence une matière absente des affectations disponibles, l'édition est bloquée plutôt que de supprimer silencieusement la matière. Le catalogue complet d'une classe sans enseignant actif nécessite une évolution serveur distincte : ne pas contourner les RPC par SELECT direct.

## Recette purement fictive sur le PC — zéro écriture hébergée

**Nécessite l'accès `school_admin` dans le routeur**, même en mode local. Depuis le dépôt dans VS Code :

~~~powershell
git status -sb
npm run qa:s4c3c4
npm run lint
npm run build
npm run dev
~~~

En environnement local Vite (seulement `import.meta.env.DEV`), ouvrir :

`http://localhost:5173/app/school/official-general-averages?schoolnet_c3c4_demo=1`

L'écran porte visiblement « DONNÉES 100 % FICTIVES ». Les deux établissements, périodes, classes, treize élèves et leurs moyennes sont entièrement simulés ; **aucun appel à Supabase n'est effectué par cette page en mode fictif**. Les actions d'enregistrement et d'approbation sont désactivées. Tester les sélecteurs, filtres (accents), cas `ready`, `incomplete`, `not_configured`, zéro publié, états sans programme, et responsive mobile.

Sans le paramètre `schoolnet_c3c4_demo=1`, la page appelle les RPC réelles dans la session school_admin autorisée ; en attendant le GO SQL, l'avertissement « Activation SQL en attente » est attendu.

**Attention** : ne pas saisir des clés sensibles en chat, ne pas copier des données scolaires vers GitHub Actions ou un environnement de démonstration.

## Recette automatisée

`npm run qa:s4c3c4` teste les formes strictes du catalogue, les états, les comptes, le zéro, les valeurs manquantes, la séparation A/B, les frontières d'accès, la correspondance SQL/API, la signalisation d'absence de RPC et la séparation explicite de la démo.

GitHub Actions applique également : `qa:s4c3c2`, `qa:s4c3c3533`, `qa:s4c3b6-1`, `lint`, `build`. **Aucun accès Supabase, migration, déploiement Vercel ou donnée de production en CI**.

## Portes de livraison encore fermées

- Sous-lot C.3-C.4 : revue GitHub Actions + recette Windows + contrôle responsive, puis GO métier.
- Installation SQL C.3-C.3.1/.2/.3 : GO séparé, résolution historique des migrations, restauration indépendante et sécurité avant toute écriture.
- Recette réelle après installation : contrôle multi-établissement Auth/RLS, approbation, résultats et refus des rôles non habilités.
- Fusion vers `main` et déploiement Vercel : GO explicite distinct après toutes les dépendances et la recette réelle.
- Publication des bulletins / accès Parents / exports officiels : futurs sous-lots, non inclus.

**Workflow conservé** : développement GitHub → CI → synchronisation `schoolnet-tests` → test Windows → validation → fusion `main` seulement au jalon de livraison autorisé.
