# SCHOOLNET — Lot 5.C-B.2 / Étape 2.D.1 — Backend de connexion en prévisualisation sécurisée

**Date :** 13 novembre 2026  
**Statut :** moteur développé, 11 tests unitaires réussis, migration backend appliquée et contrôlée dans la sandbox ; **service de connexion réelle désactivé**.

## 1. Périmètre et verrouillages

- **Sandbox unique** : `onqlsvphmrqhelislpry` — les fonctions et données fictives restent isolées.
- **Projet principal** : `anttmbhaphkhmkoqsofd`, **aucune modification**.
- **Branche GitHub** : `feature/schoolnet-student-sans-email`, **aucun merge vers main** ni publication Vercel.
- La première version Edge `schoolnet-student-login` est déployée en sandbox avec `verify_jwt=true` et **`STAGED_SANDBOX_DISABLED = true`**. Elle ne permet aucun login. La future connexion pré-authentification nécessitera une revue spécifique avant toute utilisation de `verify_jwt=false`.
- Les deux comptes fictifs B2B et les deux anciens comptes B3 sont conservés ; aucune réinitialisation ou suppression.

## 2. Migration backend sandbox

Fichier `docs/sandbox/b2d/student_login_gate_sandbox.sql`, migration nommée `schoolnet_student_backend_login_b2d_sandbox`, appliquée via Supabase uniquement à `onqlsvphmrqhelislpry`.

Tables privées :
- `schoolnet_student_private.login_attempt_windows` : compteurs atomiques par fenêtre de 15 minutes. Les clés de regroupement sont des HMAC (ou une valeur globale fixe), **jamais** un téléphone, code ou IP en clair.
- `schoolnet_student_private.login_audit_events` : résultat de connexion uniquement (`rate_limited`, `denied`, `authenticated`, `server_error`) et horodatage, sans identifiants.

Fonctions SQL `SECURITY INVOKER` dans le schéma `public`, `EXECUTE` retiré à `PUBLIC`, `anon` et `authenticated` :
- `schoolnet_student_login_gate` : requête atomique de quotas et recherche de correspondance `enabled` ; retourne un UUID Auth interne ou NULL, jamais un e-mail.
- `schoolnet_student_login_enabled` : recontrôle le statut de la correspondance **après** succès Supabase Auth.
- `schoolnet_student_login_audit` : journal d'audit limité aux catégories autorisées.

**Seuils sandbox configurés** : global 150, IP 25, téléphone 12, code 8 par fenêtre fixe de 15 minutes. L'ordre des compteurs est global → IP → téléphone → code, et l'incrément se fait par `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` atomique.

Les seuils ne sont **pas encore validés par un stress-test concurrent** ; les appels de charge ont été bloqués par les contrôles de sécurité de l'environnement d'exécution. Le scénario SQL simple sous `SET LOCAL ROLE service_role` a en revanche vérifié la recherche d'un UUID interne, la réponse pour un code absent, le contrôle de statut et l'écriture de l'audit, avec **ROLLBACK intégral**.

## 3. Code backend et preuves locales

- `supabase/functions/_shared/studentLoginCore.ts` : calcul HMAC par domaine, validation des entrées, verrouillage par quotas, recherche interne, vérification Auth du mot de passe, vérification du JWT Auth et recontrôle du statut.
- `supabase/functions/schoolnet-student-login/index.ts` : adaptateur Supabase Edge avec URL sandbox obligatoire, origine CORS stricte, limite de corps 2048 octets, absence d'affichage de secrets, clé HMAC à fournir via `SCHOOLNET_STUDENT_CODE_PEPPER`, fonctionnalité explicitement désactivée.
- `scripts/test-student-login-core.mjs` : **11 tests Node hors ligne réussis** (succès, code inconnu, mauvais mot de passe, seuil simulé, contrôle de marqueur serveur, identité Auth différente, session invalide, suspension, audit indisponible, erreur de base, formats HMAC et saisies).
- Vérification TypeScript stricte de l'Edge et du cœur : **réussie** avec des déclarations de dépendances locales de contrôle.

Commande de test local à la racine du dépôt (Node.js 22) :

```powershell
node --experimental-strip-types --test scripts/test-student-login-core.mjs
```

La fonction Edge refuse de fonctionner tant que le verrou `STAGED_SANDBOX_DISABLED` est actif, même si les autres variables sont correctement configurées. Aucun secret HMAC n'a été committé ni saisi dans le connecteur.

## 4. État réel vérifié après l'opération

| Contrôle | Résultat |
| --- | --- |
| Comptes Auth sandbox | 4, dont 2 nouveaux fictifs B2B |
| Identités `schoolnet_student_private.identities` | 0 |
| Compteurs de tentatives persistants | 0 |
| Événements d'audit persistants | 0 |
| Appel SQL `login_gate` permis à `anon` | NON |
| Appel SQL `login_gate` permis à `authenticated` | NON |
| Appel SQL `login_gate` permis à `service_role` | OUI |
| Base principale SCHOOLNET | 11 comptes, 1 Parent activé, 0 invitation Apprenant, aucun nouveau schéma privé |
| Déploiement Edge sandbox | Version 1, `verify_jwt=true`, verrou logiciel actif |

L'avis `rls_enabled_no_policy` dans les schémas privés est attendu (fermeture voulue). L'avertissement préexistant `auth_leaked_password_protection` reste ouvert : <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>.

## 5. Limites qui interdisent toute ouverture du service

1. Le secret serveur `SCHOOLNET_STUDENT_CODE_PEPPER` doit être généré et conservé **uniquement dans les secrets serveur de la sandbox**. Ne jamais le transmettre au chat, au navigateur, à GitHub ou à un journal.
2. La provenance de `cf-connecting-ip` doit être vérifiée dans le chemin réellement déployé ; l'en-tête `x-forwarded-for` provenant du client n'est **pas** un repli sûr. Prévoir un WAF et une limitation en amont pour les requêtes malformées.
3. Les deux comptes Auth B2B existent, mais **aucune correspondance active n'est créée** dans la table privée. Les mots de passe de ces comptes ne sont pas détenus par le backend ; une nouvelle recette locale sécurisée serait nécessaire si l'on veut vérifier une connexion réelle.
4. L'identité Auth technique peut en principe être utilisée directement sur l'API Supabase par un utilisateur qui la connaît. Les futures politiques RLS métier devront donc vérifier **le rôle et le statut activé côté serveur**, indépendamment de l'écran de connexion.
5. L'interface de production devra conserver l'e-mail technique hors de toute communication utilisateur ; le domaine `.invalid` reste **strictement expérimental**, avec choix d'un domaine contrôlé et d'une récupération sûre avant le lancement.
6. La connexion métier n'est pas une preuve suffisante de parenté. **Yao Thierno et Yao Tabra ne sont pas encore rattachés**, et la production demeure intacte.

## 6. Suite proposée — Étape 2.D.2

Sous nouvelle validation ciblée, réaliser une recette d'intégration sandbox incluant la vérification de l'en-tête IP, le stockage serveur du secret HMAC, l'enregistrement contrôlé des deux comptes fictifs en état `pending`, la preuve nécessaire au passage `enabled`, puis les tests complets d'appel de la fonction Edge. Ne pas activer `verify_jwt=false` ou lever le verrou avant confirmation de toutes les protections. Ajouter ensuite la stratégie de rotation des secrets, de nettoyage des compteurs et des tests concurrentiels.

**Aucune migration de production, aucun déploiement public du login et aucun rattachement réel ne sont autorisés par cette étape.**
