# SCHOOLNET V2 - S4-C.3-C.3.5.2 - Recette des moyennes officielles par JWT Supabase
Date: 26 novembre 2026. **PROPOSITION / BANC D'ESSAI JETABLE.**

## Objectif
Passer des preuves PostgreSQL de C.3-C.3.4 aux **vraies fonctions SQL officielles C.3-C.3.3**, executees via PostgREST avec des sessions GoTrue reelles et les gardes-fous d'auth.uid(). Aucune fonction SQL du lot n'est modifiee pour ce sous-lot; nous installons leurs fichiers de proposition non modifies uniquement sur l'instance temporaire CI.

## Infrastructure reutilisee
- Supabase CLI 2.122.1, PostgreSQL 17, GoTrue/Auth, PostgREST, Kong, ports 127.0.0.1:55421 et 55422.
- Repertoire: tests/s4c3c35-supabase-ci (meme config jetable que le sous-lot 3.5.1).
- Deux fichiers SQL **fixtures**, non migrations: official-averages-auth-schema.sql (schema scolaire minimal coherent, sans remplacer auth.uid) et official-averages-auth-seed.sql (enregistrements fictifs associes a dix vrais utilisateurs temporaires).
- Fichiers SQL du moteur verifies et installes **sans modification**: supabase/proposals/s4c3c3_official_curriculum_and_general_average_kernel.sql, puis supabase/proposals/s4c3c3_school_admin_official_general_averages_rpc.sql.
- Apres installation, NOTIFY pgrst afin de charger les nouvelles fonctions dans l'API REST. Tous les appels HTTP portent une vraie session Auth, pas un ID d'utilisateur ajoute arbitrairement par l'appelant.

## Scenarios du test HTTP
1. Creation et authentification par GoTrue de dix comptes fictifs: deux administrateurs, deux enseignants, un parent et cinq eleves, dont un transfert entre etablissements.
2. L'appel anonyme aux deux RPC officiels est interdit, ainsi que l'acces direct aux copies.
3. Enseignants/parents/eleves refuses comme administrateurs; un parametre d'identite fourni par le client ne peut donner des droits.
4. Interdiction IDOR entre etablissements A/B et combinaisons classe/periode incoherentes.
5. Sans catalogue approuve, aucune moyenne n'est exposee; un catalogue non configure ne peut etre approuve.
6. Etablissement A: deux matieres, Maths coefficient 2 / Francais coefficient 1. Etablissement B: Maths seule, coefficient 2.
7. Calcul via vrai SQL et HTTP: eleve A1 (20/20 en maths, 5/10 en francais) = 16,67/20; zero explicitement publie = 0/20; note non publiee ou manquante = moyenne NULL; transfert actif dans deux classes = incomplet.
8. Evaluation publiee mais explicitement exclue du calcul = pas d'influence sur le resultat (note zero non prise en compte).
9. Seuls les eleves de l'etablissement autorise apparaissent dans sa liste, aucune note brute, feedback ou classement dans les reponses.
10. Retrait de publication d'une copie bascule la moyenne vers NULL; republiation restaure le resultat, sans rediger ni publier de notes par le service.
11. Retrait de l'affectation d'un enseignant => ses evaluations cessent d'etre prises en compte; restauration de l'affectation restaure le calcul.
12. Verrouillage de periode : ecriture de catalogue refusee, consultation autorisee seulement aux administrateurs de l'etablissement.
13. Revocation d'appartenance administrateur B avec un JWT existant => refus immediat, sans affecter l'administrateur A.
14. Les tables de notes, profils et memberships ne sont pas lisibles directement par les utilisateurs clients, et le helper prive n'est pas exposable via PostgREST.

## Conditions de securite
- Aucun reseau vers un projet Supabase heberge : la suite HTTP refuse de s'executer si API_URL != http://127.0.0.1:55421, et psql force 127.0.0.1:55422.
- Les seules cles utilisees sont celles produites par supabase status -o env **sur le runner GitHub**, jamais celles du projet principal ni du sandbox heberge.
- Le schema auth est celui de la pile locale reelle : aucune fonction auth.uid() factice n'est installee.
- Tous les comptes utilisent des adresses aleatoires @example.test; aucun email n'est envoye ou publie.
- Les tables du schema public ont RLS actif, **aucun priviliege direct** pour anon/authenticated; les fonctions privilegiees du module verifient elles-memes l'appartenance active.
- Supabase CLI arrete et detruit les conteneurs et volumes a la fin du job meme en echec. GitHub Actions garde les logs techniques, pas les jetons, mots de passe ou resultats scolaires confidentiels.
- La branche GitHub ne declenche pas de Preview Vercel; elle reste en PR brouillon au-dessus de #44 -> #43 -> #42 -> #41 -> #40.
- Aucune installation SQL, suspension, reprise ni reinitialisation sur schoolnet_2.0 et schoolnet-auth-sandbox.

## Portee et prochaines etapes
Cette CI constitue une **preuve d'integration Auth/JWT/PostgREST avec les vrais SQL et un schema reproduisant les tables necessaires**, mais n'est pas une migration complete du projet principal. Les schemas et configurations exactes du reseau heberge, les Policies RLS non reproduites, les hooks Auth propres au sandbox existant, et les temps de reponse sur donnees volumineuses necessitent toujours la recette C.3-C.3.5.3 et une autorisation speciale avant tout test heberge.

Une fois tous les jobs CI verts et les tests locaux Windows finis, proposer l'inventaire non destructif du sandbox heberge, un plan de rollback et une revue de performance. **Ne pas installer en production sans GO explicite**, ne pas fusionner main, ne pas deployer Vercel.

Les exports de moyennes trimestrielles, semestrielles et annuelles par classe (matiere / toutes matieres) en PDF et Excel sont des besoins valides, conserves au workflow directeur #39, et ne sont pas l'objet de cette CI.
