# SCHOOLNET — Alias technique interne `schoolnet.invalid` approuvé

**Décision du 13 novembre 2026 :** utiliser uniquement `schoolnet.invalid` pour les identités internes des apprenants sans e-mail personnel. Aucun achat de domaine.

## Comportement
- Alias Auth unique et déterministe : `sn-<uuiddemande>@schoolnet.invalid`. Il ne sert **pas de boîte mail**, n'est jamais présenté à l'élève et ne remplace pas l'adresse réelle du parent.
- Auth par code scolaire unique, téléphone familial et mot de passe personnel distinct du parent.
- Un seul domaine accepté par la logique serveur. Les domaines étrangers, sous-domaines `.invalid` arbitraires et domaines trompeurs sont refusés.
- La variable `SCHOOLNET_STUDENT_ALIAS_DOMAIN` n'est **plus nécessaire**. Aucun domaine technique ne doit être saisi dans Supabase.
- L'invitation Auth `generateLink({type:'invite'})` est générée sans envoi automatique. Le lien est remis manuellement au **parent vérifié** ; l'activation requiert des preuves supplémentaires.
- Le formulaire standard de récupération par e-mail ne fonctionne **pas** pour un alias `.invalid`. Une procédure Admin de régénération contrôlée des liens de récupération doit être validée avant utilisation client.

## Validation restant à effectuer
La sandbox contient déjà deux alias `@schoolnet.invalid` créés au cours des essais antérieurs, ce qui appuie l'acceptation de ce format d'adresse par Supabase Auth. **Cela ne valide pas encore le parcours `generateLink('invite')` en production.** Prévoir un compte fictif et vérification du lien de création de mot de passe avant la première inscription client.

## Verrous conservés
Fonctions Edge sur SCHOOLNET principal : `verify_jwt=true` ; aucune activation Admin sans `SCHOOLNET_STUDENT_ACCOUNTS_ENABLED=true`, ni login public sans secret HMAC, Turnstile et chemin IP fiable. Aucune création d'élève ni modification de données utilisateurs dans ce commit. `main` et le déploiement Vercel restent inchangés.

La variable `SCHOOLNET_STUDENT_CODE_PEPPER` demeure nécessaire : c'est un secret HMAC privé durable d'au moins 32 octets, jamais stocké dans GitHub ou dans une variable `VITE_*`. Sa configuration sera réalisée séparément.
