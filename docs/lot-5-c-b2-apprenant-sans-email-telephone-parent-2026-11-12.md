> **ACTIVATION PARENT CONFIRMÉE 12/11/2026.** La demande publique de Yao Tabra (4e, sans e-mail personnel) a produit un compte Parent Yao Thierno créé et désormais **`activated`**. Vérification SQL sur `schoolnet_2.0` (`anttmbhaphkhmkoqsofd`) : 1 registre Parent `status=activated`, `generation_count=1`, `sent_declared_at=2026-11-12 16:31:38.109+00`, `schoolnet_family_password_session_proof(user_id,sent_declared_at)=true`, **1 observation `password` liée à une session Auth postérieure à la transmission**. 11 comptes Auth / 1 invitation activée / 6 événements du registre / 5 observations du hook / 36 migrations. La confirmation est visible dans l'UI Super Administrateur. **Aucun compte Apprenant ni rattachement familial n'a encore été créé** ; sur le tableau de bord Parent, `Aucun enfant lié` est donc normal. Ne PAS recreer le Parent ou renvoyer son lien. La prochaine priorité reste le **parcours apprenant sans e-mail**, avec téléphone familial + identifiant individuel, mot de passe propre et lien à remettre à l'adresse e-mail du Parent. La branche est séparée de `main` ; ne pas déployer un mode de connexion non validé.

---

# SCHOOLNET — Lot 5.C-B.2 — Apprenant sans adresse e-mail personnelle
Date : 12 novembre 2026
État : **CONCEPTION ET PRÉPARATION SUR UNE BRANCHE ISOLÉE — NON IMPLÉMENTÉ, NON DÉPLOYÉ**

## Décision fonctionnelle à conserver
- Un apprenant mineur n'est **pas obligé** de disposer d'une adresse e-mail personnelle pour s'inscrire ou bénéficier d'un compte SCHOOLNET.
- Le parent/tuteur conserve **son propre compte** distinct.
- Le téléphone du parent sert de repère familial pour la connexion de l'apprenant, **combiné avec un identifiant individuel SCHOOLNET** : téléphone seul ne suffit pas à identifier plusieurs enfants d'une même famille.
- L'apprenant possède un **mot de passe personnel**, distinct de celui du parent.
- Le lien d'activation personnel de l'apprenant doit être **remis à l'e-mail du parent**, avec consentement et vérification du destinataire. À ce stade, le système ne fait qu'une **génération de lien puis une transmission manuelle par l'administrateur** : ne pas annoncer d'envoi automatique.
- Chaque enfant conserve son propre identifiant et son profil `student`. Le parent peut avoir plusieurs enfants associés au même numéro familial sans fusion des comptes.

## Contrainte technique Supabase vérifiée le 12/11/2026
Dans le projet principal `anttmbhaphkhmkoqsofd`, l'index PostgreSQL `auth.users.users_phone_key` est **unique sur `phone`**. Il est donc impossible de créer de multiples comptes Auth avec **le même numéro de téléphone** comme identifiant `auth.users.phone`.

Éviter également de réutiliser l'adresse e-mail du parent comme `auth.users.email` de l'apprenant : `auth.users.users_email_partial_key` garantit l'unicité des e-mails pour les utilisateurs ordinaires.

La connexion souhaitée côté utilisateur doit donc être traitée par SCHOOLNET comme une **identification composite** : (numéro familial + code scolaire individuel) + mot de passe ; Supabase Auth utilise en interne une identité technique **unique par apprenant**, jamais l'e-mail réel du parent ni un numéro partagé.

## Étapes d'implémentation avant tout déploiement
1. Choisir et documenter le format de l'identifiant individuel apprenant (code opaque non séquentiel, généré côté serveur et garanti unique). Normaliser le téléphone au format international.
2. Construire la correspondance côté serveur avec une identité Auth interne unique qui ne dépend **ni d'une boîte e-mail inventée au nom du parent, ni d'un SMS sur un numéro partagé** ; vérifier en sandbox la création, la sécurité de la récupération et la validité du lien technique avant de créer de vrais comptes.
3. Étendre de façon additive le registre des invitations et ses contraintes : mode d'accès sans e-mail, contact e-mail du parent, identifiant scolaire, maintien de toutes les garanties RLS/anti-doublons/preuves Auth.
4. Développer la préparation contrôlée de l'invitation apprenant sans e-mail, son message de remise à l'e-mail du parent, le lien de première connexion et les états `prepared` → `sent_declared` → `activated`.
5. Adapter le formulaire de connexion en proposant un mode **Apprenant sans e-mail**, exigeant téléphone parent + code personnel + mot de passe. Ajouter protection contre l'énumération, l'abus et les tentatives automatiques ; le mot de passe ne doit pas être journalisé.
6. Adapter l'interface administrateur et l'inspection d'une demande sans `student_email` : ne plus afficher une action impossible à effectuer ; expliciter au parent la remise d'un lien destiné à son enfant.
7. Tester en sandbox : un parent avec deux enfants partageant le même numéro, comptes et sessions indépendants, lien remis au parent, changement de mot de passe, login de chaque enfant, révocation et preuves Auth, pas de partage de compte.
8. Valider lint/build/CI et une recette fonctionnelle sur un compte pilote habilité, puis **nouvelle PR vers `main`** (PR #6 déjà fusionnée) et contrôle du déploiement automatique Vercel.

## Situation réelle à préserver
- Le 12/11/2026, une nouvelle demande publique d'inscription `student_enrollment`, niveau 4e, comporte **l'e-mail du responsable et son téléphone, mais pas d'e-mail apprenant**.
- Le compte **Parent** associé a déjà été créé : `auth.users` + `public.profiles.role=parent` et `schoolnet_family_invitation_records.status=prepared`, génération 1.
- La transmission au Parent **n'est pas déclarée** dans le registre. Il ne faut pas déclarer le lien remis sans remise réelle.
- Des événements d'authentification `otp` et `password` ont été observés pour ce compte, mais la preuve reste **`token_pre_issue_unverified`** et le statut n'est pas `activated`.
- Au moment de cette vérification, la base principale comporte **11 utilisateurs Auth** et **1 invitation Parent**.
- Ne créer aucun compte Apprenant en contournant le champ `student_email` avec l'e-mail du parent. Ne pas exposer d'identité Auth technique à l'utilisateur final.

## Garde-fous de livraison
La branche `feature/schoolnet-student-sans-email` est indépendante de `main` et ne déploie aucune modification en production tant qu'une migration SQL éventuelle, le code backend, les tests et la recette fonctionnelle ne sont pas validés. Les liens d'invitation et les secrets Auth ne doivent pas figurer dans les captures, logs, commits ou conversations.

**Point de reprise :** parcours Parent en `prepared`; réaliser la remise manuelle réelle et l'inspection de preuve. Concevoir puis implémenter et tester l'accès apprenant sans e-mail, ensuite fusionner via une PR distincte.
