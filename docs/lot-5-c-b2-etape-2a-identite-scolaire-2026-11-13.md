# SCHOOLNET 2.0 — Lot 5.C-B.2 — Etape 2.A : identite scolaire sans e-mail personnel

Date : 13 novembre 2026
Etat : logique de generation d'identifiant implemente et testee localement ; **ni login Supabase ni migration SQL metier encore actives**.
Branche : `feature/schoolnet-student-sans-email`.

## Acquis preserves
- Le compte Parent Yao Thierno est deja `activated` ; aucun nouvel envoi d'invitation Parent ni changement de son compte.
- Aucun compte Auth Apprenant ni rattachement familial n'a encore ete cree pour Yao Tabra.
- `main` et le projet Supabase principal `anttmbhaphkhmkoqsofd` ne sont pas modifies par cette etape.
- La sandbox `onqlsvphmrqhelislpry` possede deux comptes Auth de test, mais pas les tables metier Schoolnet. Ne pas y appliquer les migrations de production telles quelles.

## Constat technique verifie
- Supabase Auth accepte `email` + mot de passe ou `phone` + mot de passe, et impose l'unicite de l'identifiant Auth. Un meme `auth.users.phone` ne peut pas identifier plusieurs enfants.
- Le parent ne doit **jamais** partager son compte Auth, son mot de passe ni son `auth.users.email` avec un apprenant.
- `generateLink({type:'invite',email})` peut creer un compte Auth et retourner un lien ; `generateLink({type:'recovery',email})` cree un lien pour un compte existant. La remise du lien peut etre manuelle, mais une preuve Auth reelle est requise pour valider l'activation.
- En octobre 2026, les fonctions Edge ont des regles de verification JWT distinctes ; un endpoint public de login doit avoir un controle d'abus fiable, pas une simple fonction non authentifiee exposee.

## Decision technique proposee (pour validation en sandbox)
1. **Coordonnee familiale** : le telephone normalise au format E.164 (exemple fictif `+2250712345678`), conserve comme information SCHOOLNET, **pas** dans `auth.users.phone` des enfants.
2. **Identifiant individuel** : `SN-XXXX-XXXX-XXXX`, 12 caracteres dans un alphabet uniforme de 32 symboles sans I, O, 0 ou 1 (60 bits aleatoires), genere exclusivement avec WebCrypto cote serveur. Unicite garantie ulterieurement par index UNIQUE + nouvel essai en cas de collision. Ne pas en deduire le nom, l'ecole, l'annee ni un compteur.
3. **Recherche protegee** : empreinte HMAC-SHA-256 de l'identifiant canonique, cle `SCHOOLNET_STUDENT_CODE_PEPPER` de 32 octets minimum en secret serveur. La cle ne doit jamais etre committee, exposee au navigateur, ni journalisee. Stabilite de la cle a gerer lors de sa rotation.
4. **Compte Auth propre a chaque enfant** : identite Auth technique distincte et non communiquee comme adresse de contact. Un alias en domaine reserve `schoolnet.invalid` est propose **uniquement pour les essais de la sandbox**. L'acceptation de cet alias par Auth/GoTrue, les liens `invite`/`recovery` et la politique de domaine a utiliser dans la vraie application restent **a prouver**. Ne pas basculer en production tant qu'un domaine controle et une strategie de recuperation ne sont pas valides.
5. **Connexion envisagee** : formulaire telephone familial + code SCHOOLNET + mot de passe. Un service prive sous controle du serveur localise le compte technique apres verification des criteres, puis fait verifier le mot de passe par Supabase Auth. Il retourne uniquement la session correspondant a l'enfant ; le client valide le role student et adopte la session par `setSession`.
6. **Protection obligatoire avant exposition** : limitation atomique des tentatives par IP et par code/telephone, reponse d'erreur generique et temps de reponse non discriminant, restrictions CORS, jamais de mot de passe ou de lien secret dans les logs, aucun `service_role` dans le navigateur, revoke possible, verification RLS et `app_metadata` serveur. Les limites natives de Supabase Auth ne suffisent pas a elles seules a proteger un service de resolution d'identifiant.
7. **Activation** : lien personnel remis manuellement a l'e-mail du Parent **comme canal de correspondance** ; aucune tentative d'envoi automatique ni reutilisation de l'e-mail du parent comme email Auth de l'enfant. Ne pas declarer l'envoi avant remise reelle. Le parent et l'enfant doivent utiliser des sessions distinctes (conseiller la navigation privee pour l'activation de l'enfant).
8. **Lien familial** : apres activation Auth prouvee de l'enfant, resolution parent/eleve revue par un administrateur, contrainte d'unicite et rattachement en base selon les controles existants ; apparition dans `Mes enfants` seulement apres verification.

## Livrables et verification de l'etape 2.A
- `supabase/functions/_shared/schoolnetStudentIdentity.ts` : code SCHOOLNET, normalisation, HMAC et generateur d'alias limite a la sandbox ; **aucun appel Auth, SQL ou reseau**.
- `scripts/test-schoolnet-student-identity.mjs` : tests Node autonomes et sans connexion aux services.
- Executer : `node --experimental-strip-types --test scripts/test-schoolnet-student-identity.mjs` (Node 22).
- Six tests reussis localement : alphabet non ambigu, 10 000 codes generes sans collision observee, normalisation du code, normalisation des telephones, HMAC stable/secrete et deux identites independantes avec le meme telephone.
- **Limite explicite** : l'absence de collision dans un echantillon ne garantit pas l'unicite future ; l'index SQL reste obligatoire.

## Suite, dans cet ordre
- **2.B — POC Auth sandbox** : verifier que GoTrue accepte l'alias technique, que deux comptes fictifs ont des sessions distinctes et que les liens invite/recovery aboutissent sans remise automatique. Verifier l'etat des comptes avant toute nouvelle creation ou relance ; ne jamais nettoyer par suppression automatique.
- **2.C — Schema additif protege** : creer une table d'identites dans un schema prive, index et contraintes (user Auth unique, code HMAC unique, contact E.164, statut), et tests des privileges ; n'appliquer d'abord qu'en environnement isole.
- **2.D — Backend et garde anti-brute-force** : reserve et activation de comptes enfants, endpoint d'authentification, rate limit atomique, preuve de session, revoke, audits et retours generiques.
- **2.E — Interface** : choix du mode `Apprenant sans e-mail`, ajustement invitation admin et ecran de mot de passe, affichage du code individuel et modalites de remise au Parent.
- **2.F — Recette 2 enfants, 1 telephone et parent confirme**, securite, tests CI, PR brouillon, validation explicite avant `main` et Vercel.

## References techniques
- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://supabase.com/docs/reference/javascript/auth-admin-generatelink
- https://supabase.com/docs/reference/javascript/auth-setsession
- https://supabase.com/docs/guides/functions/auth-headers
- https://supabase.com/docs/guides/auth/rate-limits
