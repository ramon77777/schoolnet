# SCHOOLNET — Lot 5.C-B.2 : intégration interface Admin et connexion scolaire

**Objet :** rapprocher de `main` les écrans préparés sur `feature/schoolnet-student-sans-email` sans activer la connexion réelle des clients.

## Intégration
- `Administration → Demandes publiques` affiche le panneau « Compte Apprenant sans e-mail personnel » pour une demande Apprenant sans adresse e-mail.
- Sur le site principal, le bouton « Vérifier le dossier sans e-mail » effectue une **inspection en lecture seule**, obligatoirement sous JWT Admin. Le serveur refuse la création et la confirmation de remise tant que `SCHOOLNET_STUDENT_ACCOUNTS_ENABLED` n'est pas `true`. Les boutons d'écriture restent cachés tant que l'inspection ne confirme pas cette autorisation.
- Le formulaire « Identifiant SCHOOLNET » est intégré, mais **masqué en production** tant que `VITE_SCHOOLNET_STUDENT_LOGIN_RELEASE_ENABLED` n'est pas explicitement `true`. En local, il reste une prévisualisation sans Auth.
- La connexion réelle requiert toujours Turnstile, une IP proxy fiable et une configuration serveur distincte : **ne pas activer le login avant la recette Auth/RLS sous JWT apprenant pending**.
- Le parcours e-mail, l'invitation Parent et le contrôle de session d'invitation publié précédemment ne sont pas remplacés.

## Préparation du backend principal
La fonction Edge `schoolnet-student-no-email-admin` a été installée en **version 4** avec la possibilité `inspect` en lecture seule, après authentification et contrôle du rôle Admin. Les mutations restent interdite sans drapeau serveur. La base et les comptes existants sont inchangés.

## Recette
```powershell
node --experimental-strip-types --test scripts/test-student-login-preview.mjs scripts/test-student-no-email-ui-rollout.mjs
npm run build
```
Sur la production publiée après validation, l'administration doit pouvoir **inspecter** une demande Apprenant sans e-mail éligible. Si le compte Parent de la même demande n'est pas activé, afficher un refus sans créer de compte. Tant que le flag serveur est absent, ne proposer aucune création.

## Ouverture du service
Une fois la recette de lecture seule validée, la création des comptes nécessite une approbation fonctionnelle explicite et l'activation du seul drapeau secret côté Supabase `SCHOOLNET_STUDENT_ACCOUNTS_ENABLED=true`, puis une recette de préparation/invitation sur un **dossier fictif vérifié**. La connexion publique requiert des contrôles supplémentaires (réseau, CAPTCHA, RLS). Aucun compte de client ne doit être créé avant ces vérifications.

**Important :** `main` n'a pas encore reçu cette interface à la création de la PR ; aucun code secret dans le dépôt.
