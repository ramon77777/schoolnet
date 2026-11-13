# SCHOOLNET 5.C-B.2 — Recette pilote fictive sur Supabase principal (PREPARATION)

**Date : 13 novembre 2026.** **Cible** : Supabase `schoolnet_2.0`, ID `anttmbhaphkhmkoqsofd`. **Statut** : PLAN ET VERROU PREPARES. **AUCUN COMPTE DE TEST CREE.**

## Autorisation et limites
Le propriétaire a autorisé la **préparation** d'un test fictif sur SCHOOLNET principal, sans modifier les comptes/dossiers réels. Une autorisation **distincte** reste requise pour créer la demande, l'utilisateur Parent et l'utilisateur Apprenant fictifs. Ne jamais employer la demande Yao Tabra, le compte Yao Thierno ou une demande client déjà existante pour cette recette.

## Etat initial vérifié en lecture seule
- 11 comptes Auth et 11 profils ; 6 demandes publiques.
- 1 invitation Parent activée, 1 lien familial ; 0 identité scolaire sans e-mail ; 0 alias `@schoolnet.invalid` en production.
- Aucune demande dont le nom commence par `RECETTE SCHOOLNET PILOTE`.
- Les politiques RLS sont activées pour les tables scolaires examinées. **Point de recette obligatoire** : une session Auth d'apprenant `pending` ne doit pas pouvoir accéder aux données des autres élèves ni à des ressources scolaires protégées par appel REST direct. La table `classes` conserve une politique de lecture pour tout utilisateur authentifié, à revoir selon le périmètre de visibilité voulu.

## Verrou serveur de production — ne pas contourner
La fonction `schoolnet-student-no-email-admin` doit utiliser `schoolnetStudentPilotWriteAllowed`. `inspect` reste lisible uniquement par un Admin authentifié. Pour `prepare` et `declare_sent`, **deux conditions sont nécessaires** :
- `SCHOOLNET_STUDENT_ACCOUNTS_ENABLED=true` ;
- `SCHOOLNET_STUDENT_PILOT_REQUEST_ID=<UUID exact de la nouvelle demande de recette>`.

Si l'UUID pilote manque, est incorrect ou désigne un autre dossier, le backend refuse **toute écriture**. La réponse d'inspection retourne `admin_enabled=false` pour les autres dossiers, empêchant l'interface de proposer la création. Ne surtout pas mettre l'UUID d'une demande réelle comme valeur pilote.

**Important :** la nouvelle version de fonction et les deux variables serveur sont à déployer/configurer seulement après validation de ce protocole ; le flag général doit rester absent ou `false` jusque-là. La branche GitHub ne représente pas un déploiement.

## Jeu de données fictives à créer après autorisation
| Objet | Contenu de test | Effet |
| --- | --- | --- |
| Demande publique | `RECETTE SCHOOLNET PILOTE - ELEVE 01`, inscription Apprenant sans e-mail, statut `new` ; niveau `4e` (sans classe automatique) | **+1** demande et possible notification Admin |
| Responsable | `RECETTE SCHOOLNET PILOTE - PARENT 01` ; adresse e-mail **inédite, réelle et contrôlée par le propriétaire**, téléphone de test **contrôlé par le propriétaire** | **+1** compte Auth Parent et **+1** profil après invitation et activation |
| Invitation Parent | Fonction familiale existante : `prepare` → lien délivré manuellement → `declare_sent` → connexion avec mot de passe → `confirm_activation` | **+1** enregistrement d'invitation ; statut `activated` prouvé |
| Identité Apprenant | Alias `sn-<UUIDdemande sans tirets>@schoolnet.invalid` et code `SN-XXXX-XXXX-XXXX` générés par le serveur | **+1** compte Auth Élève, **+1** profil, **+1** ligne de registre |
| Lien familial | Aucun rattachement pendant les étapes `reserved`, `prepared`, `sent_declared` | **0** lien familial supplémentaire avant activation |

Ne pas employer une fausse boîte parent `.invalid` : le parcours Parent exige un e-mail valide capable de servir aux vérifications Auth. **Ne communiquer ici ni e-mail contrôlé, ni téléphone réel, ni code SCHOOLNET, ni URL d'invitation, ni mot de passe.** Ces éléments sont saisis/consultés seulement dans l'application ou le coffre de secrets.

## Procédure de recette (une seule demande, jamais relancer en boucle)
1. **Avant toute création** : autorisation explicite des **2 comptes fictifs + 1 demande fictive** ; contrôle en lecture seule via `scripts/preflight-student-no-email-pilot-production.sql`. Conserver les effectifs et confirmer l'absence de doublons.
2. Créer la demande fictive via le formulaire public normal avec l'adresse Parent contrôlée et le téléphone contrôlé. Le dossier doit rester non rejeté et sans e-mail Apprenant. Noter **uniquement l'UUID de cette demande**.
3. Activer le Parent fictif via la fonction familiale **existante**, depuis SCHOOLNET officiel en mode Admin. Remettre le lien personnel au testeur via un canal privé. Le testeur définit son mot de passe puis **se connecte** réellement. L'Admin constate la preuve serveur et confirme `activated`.
4. Déployer la fonction Apprenant avec garde pilote testé, puis régler `SCHOOLNET_STUDENT_PILOT_REQUEST_ID` sur le nouveau dossier. Activer `SCHOOLNET_STUDENT_ACCOUNTS_ENABLED=true` seulement pendant la fenêtre de test.
5. `inspect` doit retourner `admin_enabled=true` uniquement pour le dossier pilote et `false` pour une demande réelle. `prepare` retourne une fois le code scolaire et le lien. **Ne jamais relancer `prepare` après erreur ou timeout sans audit de la réservation et de l'Auth.**
6. Vérifier l'acceptation de l'alias `@schoolnet.invalid` par `auth.admin.generateLink({type:'invite'})`. **Attention :** Supabase documente l'erreur `email_address_invalid` pour des domaines de test. Le comportement du générateur de liens sans envoi **n'a pas été confirmé en production**. Si refus, arrêter l'essai, inspecter le statut `requires_review`, ne pas contourner ou changer le domaine dans l'urgence.
7. Délivrer manuellement le code + lien au testeur, déclarer la remise uniquement après transmission réelle. Tester le lien Auth réel en session privée et définir le mot de passe individuel. Ne pas confondre cette preuve avec l'ouverture des espaces scolaires.
8. **Tester le JWT `pending` directement contre Supabase REST** : profils d'autrui, cours, évaluations, ressources, classes selon la politique souhaitée, parent_links, registre privé. Rejeter tout accès non prévu avant de poursuivre.
9. La première connexion scolaire via `schoolnet-student-login-release` reste **fermée**. Son ouverture exige Turnstile fonctionnel, adresse IP issue d'un proxy de confiance, limitations de tentatives, contrôle Auth/activation, puis observation de la transition `sent_declared → enabled`. Ne pas utiliser le login public tant que ces points ne sont pas validés.
10. Vérifier l'absence de rattachement familial avant `enabled`, puis tester explicitement la finalisation sur le **seul dossier pilote**. Repasser les drapeaux serveur à `false` dès la fin de la recette ; garder le pilote identifié. Tout nettoyage ou suppression des comptes et du dossier de test nécessite un plan distinct, compte tenu des clés étrangères `ON DELETE RESTRICT`.

## Critères d'arrêt immédiat
- Tentative d'écriture ciblant une demande réelle ; compte ou rôle Parent incorrect.
- Erreur Auth / domaine technique `email_address_invalid` ; réservation créée avec étape incertaine.
- Lien d'invitation perdu, exposé ou rejoué, ou session `pending` capable de lire des données scolaires non autorisées.
- CAPTCHA absent, véritable adresse IP impossible à établir, tentative de désactiver le JWT du login pour « faire passer » le test.

## Recette du garde-fou (sans Supabase)
```powershell
node --experimental-strip-types --test scripts/test-schoolnet-student-pilot-guard.mjs
```
8 scénarios de validation du comportement fermé par défaut ont été exécutés en environnement Node : **8 réussis / 0 échec**. Ce succès ne prouve pas l'invitation Auth de production.

**Remarque opérationnelle :** conserver les données fictives dans un état clairement marqué tant qu'un plan de nettoyage compatible avec les contraintes de clés étrangères n'a pas été validé ; ne promettre aucune suppression automatique.
