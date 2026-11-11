# SCHOOLNET — Lot 5.C-B.2 : invitations Parent / Apprenant

**Édition du 11 novembre 2026 — Code préparé, fonction NON déployée et NON activée.**
**Branche :** feature/schoolnet-multi-etablissements, PR #6.
**Référence :** workflow directeur V2.2.

## 1. Ce que nous avons réellement préparé

La fonction indépendante **supabase/functions/schoolnet-family-invitation/index.ts** ne réutilise jamais les droits school_admin. Elle est réservée au Super Administrateur SCHOOLNET, et reçoit une référence de demande et un destinataire parent/student. Elle lit le nom et l'e-mail directement dans la demande en base, sans accepter une adresse arbitraire donnée par le navigateur.

La fonction accepte deux actions :
- **inspect :** consultation sans écriture. Contrôle l'identité Admin, le statut du dossier, son éventuelle finalisation, les comptes Auth existants et leur rôle. Réponse possible : new_invitation_possible, reuse_after_verification ou manual_review.
- **prepare :** fonction d'écriture SENSIBLE. Exige la vérification humaine explicite et une note de 10 à 1000 caractères. Elle est verrouillée par la variable serveur SCHOOLNET_FAMILY_INVITES_ENABLED, absente actuellement. Le verrou doit rester en place jusqu'à l'autorisation de la migration de registre et de la recette.

Si un compte utilise déjà l'e-mail, la fonction ne le recrée pas et n'en change pas le rôle. L'administrateur doit réutiliser le compte après confirmation de l'identité. L'e-mail du parent ne peut pas identifier un deuxième compte Auth appartenant à l'enfant.

## 2. Séquence d'invitation prévue

1. Vérifier le JWT et le rôle Admin réel dans profiles, puis la demande publique.
2. Vérifier que le dossier n'est ni refusé ni déjà finalisé.
3. Trouver le vrai nom et l'e-mail personnel du destinataire dans la demande.
4. Contrôler les doublons Auth et les rôles incompatibles.
5. Réserver l'action dans un registre SQL UNIQUE par (request_id, recipient).
6. Générer un lien temporaire Supabase invite **sans envoyer d'e-mail ni transmettre de mot de passe**.
7. Confirmer qu'il s'agit d'un nouveau compte Auth et d'un profil provisoire du trigger Auth, puis positionner le bon rôle parent ou student.
8. Inscrire le statut prepared avec l'auteur, l'identifiant Auth, le compteur et la date.
9. Retourner le lien **une seule fois** à l'administrateur qui préparera lui-même son e-mail.

Aucun lien ou mot de passe ne doit être conservé dans le registre, les logs, les captures ou les documents. L'écriture Auth et l'écriture SQL ne sont pas une transaction unique : en cas d'échec intermédiaire, ne pas supprimer aveuglément un compte Auth qui aurait pu être activé.

## 3. Registre nécessaire — proposition, PAS une migration appliquée

Table proposée : **public.schoolnet_family_invitation_records**

| Champ | Règle proposée |
| --- | --- |
| request_id | UUID, référence vers la demande publique |
| recipient | parent ou student |
| request_id + recipient | Clé primaire composite et réservation anti-double-clic |
| expected_role | parent ou student, doit correspondre à recipient |
| email | E-mail personnel normalisé et non modifiable |
| user_id | UUID Auth, initialement nullable |
| verification_note | Note de décision humaine, 10–1000 caractères |
| prepared_by | UUID du Super Administrateur |
| status | preparing, prepared, sent_declared, activated, requires_review |
| generation_count | Entier non négatif |
| last_prepared_at, first_prepared_at | Dates de préparation |
| sent_declared_at, sent_declared_by | Déclaration d'envoi, pas preuve de réception |
| created_at, updated_at | Traçabilité |

Contraintes de sécurité requises : RLS activé ; aucun accès direct anon/authenticated ; accès exclusivement depuis le service serveur protégé ; index empêchant deux préparations simultanées d'une même adresse dans deux demandes ; aucun stockage de lien d'activation. Le schéma proposé doit être audité et testé en BEGIN / ROLLBACK avant tout accord d'application.

**Le registre n'existe pas actuellement.** Sans registre et sans variable serveur explicitement activée, la fonction ne peut créer aucun compte. C'est une barrière voulue.

## 4. Code client associé

**src/features/enrollments/lib/adminFamilyInvitationApi.ts** contient :
- inspectFamilyInvitation : interrogation read-only après déploiement de l'Edge ;
- prepareFamilyInvitation : action sensible réservée à l'activation ultérieure, non reliée actuellement à l'interface ;
- formatFamilyInvitationEmail : mise en forme d'un message **avec destinataire, objet et texte**, après obtention effective d'un lien.

Objet prévu : **SCHOOLNET — Activation de votre accès Parent / Tuteur** ou **SCHOOLNET — Activation de votre accès Apprenant**. L'administrateur continue à envoyer l'e-mail via sa messagerie. Rien n'est expédié automatiquement.

## 5. Ce qui reste à développer avant l'ouverture

- Préparer et faire valider une migration dédiée : RLS, index de concurrence, statut et journal des invitations ;
- compléter le traitement des opérations interrompues en statut preparing ;
- implémenter le renouvellement contrôlé d'un lien expiré et la déclaration d'envoi réel ;
- raccorder le bouton de préparation dans une seule fiche administrative, après vérification de l'identité et du dossier ;
- tester le cas Parent existant, Parent nouveau, Apprenant avec e-mail propre, enfant sans e-mail, homonymes, rôles incompatibles et deux demandes concurrentes ;
- vérifier les redirections Auth et les domaines autorisés ; depuis localhost le front peut appeler le Supabase distant, sans constituer un environnement isolé ;
- tester le respect des droits parent-enfant et les non-régressions des invitations d'écoles, cours, classes et comptes.

**Attention :** le code actuel de la fonction contrôle des redirections HTTPS connues. Pour une vraie activation sur localhost, il faudrait valider séparément un mode de redirection locale ou préférer la Preview HTTPS, sans ouvrir un joker sur les domaines.

## 6. État de validation au 11/11/2026

- **Vérification à faire :** ESLint et build GitHub sur le dernier commit, puis revue du code Edge et des risques de concurrence.
- **Aucune nouvelle migration appliquée**, aucune nouvelle Edge Function déployée, aucun compte ni e-mail créé par ces changements.
- **Source préparée ≠ service opérationnel.** Aucune promesse de fonctionnement avant tests et autorisation.

**Prochaine étape unique :** audit de la proposition de registre et préparation du protocole de reprise/idempotence, puis demande d'autorisation explicite avant toute migration ou activation Supabase.
