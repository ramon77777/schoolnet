# SCHOOLNET V2 — S4-C.3-C.3.3 — RPC sécurisées des moyennes générales
**26 novembre 2026 — VERSION PRÉPARATOIRE EN BRANCHE ISOLÉE, NON INSTALLÉE SUR SUPABASE PRINCIPAL**

## 1. Dépendances déjà vérifiées (ne pas refaire)
- PR #40 : contrat TS pur C.3-C.2, 19/19 tests.
- PR #41 : référentiel des matières attendues + calcul PostgreSQL NUMERIC non arrondi, testé en PG17 isolé.
- Ce sous-lot relie ces deux composants aux *tables existantes* de SchoolNet V2 sans accéder aux moyennes des cours libres V1 ni aux bulletins historiques.

## 2. Nouvelle surface d'API scolaire (proposée)
- \`public.schoolnet_school_official_curriculum(school_id,period_id,class_id,action,subject_ids)\` :
  - lecture du catalogue de classe autorisé ;
  - \`set\` : définition atomique de la liste des matières attendues (1 à 60, UUID existants et actifs) ;
  - \`approve\` : approbation par administrateur de l'établissement, interdite si période verrouillée.
  - Après tout changement de matières, le catalogue retourne en brouillon jusqu'à une nouvelle approbation. Les coefficients sont conservés dans \`school_period_subject_coefficients\`, pas copiés ici.
- \`public.schoolnet_school_official_general_averages(school_id,period_id,class_id)\` :
  - prévisualise **seulement** les élèves ayant une inscription officielle active dans cette classe ;
  - traite toutes les matières attendues approuvées, coefficients officiels et évaluations publiées et incluses ;
  - retourne uniquement l'identité de l'élève, la moyenne générale (/20), le statut \`ready/incomplete/not_configured\` et la complétude ;
  - \`previewOnly:true\`, pas de bulletin ou de publication, pas de notes brutes, copies, feedback, ni moyennes des cours libres V1 ;
  - en cas de catalogue non approuvé, retourne \`not_configured\` sans charger les notes.
- Aucune sélection d'un étudiant ou enseignant arbitraire : le serveur reconstruit le périmètre depuis l'école et les relations officielles.

## 3. Autorisations et mécanismes
- Seul le profil \`school_admin\` avec appartenance \`school_admin\` **active et non révoquée** à l'établissement actif peut lire/écrire.
- Le contrôle se fait dans une fonction de schéma privé \`SECURITY DEFINER SET search_path=pg_catalog\` qui utilise \`auth.uid()\` et **\`public.get_my_role()\`** du schéma réel. Les fonctions publiques sont **SECURITY INVOKER**.
- \`anon\` n'a aucun EXECUTE sur les nouvelles RPC ; les fonctions privées ne sont pas exposées via PostgREST et refusent elles-mêmes les utilisateurs non habilités.
- Vérification liée école + année + classe + période + inscription élève active. Les deux inscriptions actives simultanées dans une même année (transfert ambigu) bloquent la moyenne de l'élève.
- Activité de l'enseignant : cours, liaison, affectation, appartenance, profil enseignant tous actifs ; activité de l'évaluation officiellement reliée et incluse, soumission **publiée avec date** ; aucun score absent ne devient zéro.
- Maximum 60 matières, 500 évaluations de classe, 250 élèves pour éviter les charges excessives.
- Toutes les opérations de management passent par la fonction, sans accès direct à la table privée.

## 4. Validations de recette
- PostgreSQL 17 en GitHub Actions avec rôles \`anon\` et \`authenticated\` réels (simulant \`auth.uid()\` depuis un JWT fictif).
- Deux établissements A et B ; admin B ne peut lire/écrire A et inversement, classe/période forgées rejetées.
- Admin révoqué, enseignant, parent, élève, session sans UID et appel direct au helper privé refusés.
- Notes 20 et 10, coefficients matières 2 et 1 : **16,67/20** ; soumission non publiée reste \`NULL\` ; double inscription bloque ; cours révoqué et lien révoqué excluent des évaluations.
- Approbation/désapprobation et nouvelle approbation du programme, période verrouillée, projection sans notes brutes.
- \`BEGIN/ROLLBACK\` ; aucun jeu de données fictif conservé. CI sans accès à Supabase principal.

## 5. Limites et prochains jalons
- Les tests CI reproduisent le schéma pertinent dans une base jetable et **ne prouvent pas encore l'intégration en production** ; aucune installation SQL réelle.
- Le catalogue n'a pas encore d'interface school_admin (prévue C.3-C.4), ni workflow de dispenses validées. L'état d'un transfert résolu exigera une procédure explicite.
- Exports PDF/Excel trimestriels, semestriels et annuels enregistrés dans l'issue #39 comme sous-lot futur. Aucun droit supplémentaire accordé aux enseignants pour les autres disciplines.
- Recette locale des tests et compilation ; revue sécurité C.3-C.3.4 ; **GO distinct d'installation SQL** après sauvegarde et restauration contrôlée ; **GO distinct de fusion sur main** ; Vercel Free seulement à la fin.

## 6. Points à auditer avant installation SQL
- Permissions/exposition du schéma privé \`schoolnet_private\` et recherche de grants globaux.
- Plans SQL et charge d'une classe volumineuse.
- Processus de validation et historique d'approbation des matières.
- Vérification du rôle \`school_admin\` en session normale réelle et de la lecture de profil au travers des politiques existantes.
- Rollback dépendant des objets ajoutés en C.3-C.3.1/.2 : ne pas appliquer une partie sans l'autre.

**Aucun code React, aucune note, aucun bulletin, aucune donnée de production, aucune fusion ni publication Vercel dans cette PR.**
