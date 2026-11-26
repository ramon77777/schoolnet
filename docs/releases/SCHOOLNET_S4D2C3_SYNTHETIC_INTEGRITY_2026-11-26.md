# SCHOOLNET V2 — S4-D.2c.3 : intégrité de l'ordre des élèves et des métadonnées synthétiques

**26 novembre 2026 — PR brouillon empilée sur S4-D.2c.2 (#53).**

## État d'entrée confirmé

Recette Windows S4-D.2c.2 : commit `9149660`, QA 13/13, compilation Vite/TypeScript 934 modules, statut Git propre après restauration du cache TypeScript. Quatre fichiers PDF/XLSX 100 % synthétiques générés sous TEMP Windows, joints et examinés : 13 élèves, 8 résultats calculables, 3 à compléter, 2 à configurer, zéro 0,00 distinct de la note manquante, complétude en évaluations ou matières et PDF A4 correct. Les classeurs ont une seule feuille visible, de vrais nombres et aucune formule.

## Nouvelle portée de S4-D.2c.3 : intégrité **synthétique uniquement**

1. `orderSchoolExportStudents` fournit un ordre alphabétique français prévisible sans tri dépendant de la locale du poste : normalisation NFD, suppression des marques d'accent, casse normalisée et départage des homonymes par UUID. L'entrée n'est pas modifiée et la liste n'est jamais filtrée. Une identité dupliquée ou mal formée provoque un rejet.
2. Le modèle `makeSyntheticPreviewDocument` trie avant d'attribuer les numéros de ligne 001, 002... Le même jeu de projection produit les mêmes documents quelle que soit l'ordre de réponse technique, sous Linux et Windows.
3. Les métadonnées de **présentation synthétiques** sont strictement limitées à 11 champs attendus. Les identifiants d'école, année scolaire, classe, période et matière doivent correspondre exactement aux paramètres et à la projection validée ; tout champ inattendu ou décalage provoque un refus.
4. La référence de recette imprimée sur les PDF affiche désormais les **8 derniers caractères** de l'UUID synthétique (ex. `00000090`) plutôt que les 8 premiers (`00000000`), peu distinctifs. Le classeur Excel continue d'afficher l'UUID synthétique entier. Ceci **ne vaut pas journalisation d'une exportation réelle**.
5. Tous les contrôles S4-D.2c.2 restent applicables : moyenne zéro véritable, manque affiché par tiret, pagination A4, Excel OOXML, formats correctement séparés, aucune génération côté navigateur.

## Limite importante — ne pas surinterpréter

Les intitulés restent **100 % synthétiques** et leur cohérence d'identifiants ne prouve **pas** encore qu'une chaîne de labels provient effectivement de tables scolaires certifiées par un serveur. Le contrat des métadonnées d'établissement réelles (libellés école/année/classe/période/matière, appartenance, session active et droit de consultation) devra être mis en place et testé séparément, via une source serveur autorisée sur Supabase **jetable**, avant tout usage réel.

La présente PR **n'ajoute aucune requête, migration, API Supabase, fichier V1, lecture de notes réelles, ni nouveau droit d'accès**. La barrière `SCHOOLNET_REAL_EXPORTS_RELEASED = false` reste en place. Aucune route ne charge les moteurs de rendu synthétiques. Les PR demeurent brouillon : pas de merge dans `main`, pas de déploiement Vercel, pas d'écriture Supabase principal.

## Recette Windows, après la CI GitHub

Depuis `D:\Bakary\10 autres\schoolnet-tests`, passer sur la branche `feature/schoolnet-s4d2c3-synthetic-identity-order-20261126`, exécuter `npm run qa:s4d2c3`, `npm run build`, restaurer `tsconfig.app.tsbuildinfo` et vérifier `git status -sb`. En option `npm run demo:s4d2c2` régénère les quatre exemples synthétiques ; la seule différence visible attendue par rapport aux fichiers fournis est la référence abrégée PDF corrigée (le jeu standard de 13 élèves était déjà trié).

## Étape ultérieure conditionnée

S4-D.2c.4 : auditer et préparer **la source serveur** des intitulés et du registre des élèves avec des JWT réellement autorisés en Supabase jetable ; refuser explicitement les paramètres d'une école B et les délégations dépassant leur scope. Pas d'activation de téléchargement réel avant autorisation explicite de l'utilisateur, procédure d'historique de migrations certifiée et validation du workflow de publication.
