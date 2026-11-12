# SCHOOLNET — Lot 5.C-B.2 — Régularisation d'une transmission après fermeture
Date : 12 novembre 2026
Statut : correctif interface développé sur branche isolée ; **recette et fusion sur main en attente**.

## Anomalie reproduite
L'administrateur a préparé et transmis à un Parent son lien temporaire, sans cocher la case « J'ai réellement transmis le message au bon destinataire ». Après fermeture de la fenêtre de demande, le lien et l'objet `draft` React sont volontairement perdus. La case et le bouton `Déclarer la transmission` étaient enfermés dans `{panel.draft && (...)}` : le dossier demeure `prepared` en SQL et une inspection serveur permet de le constater, mais l'attestation n'était plus accessible.

**Il ne faut pas** recréer le compte, générer un nouveau lien pour régulariser, sauvegarder le lien sensible ni passer directement le registre à `activated`.

## Correctif ciblé
Dans `src/features/enrollments/components/AdminFamilyInvitationManager.tsx` :
- conserver l'affichage de la remise immédiate lorsqu'un `draft` est disponible ;
- si le `draft` a disparu mais qu'une inspection **réelle** du serveur confirme `invitation_status=prepared`, `delivery_status=ready_to_declare`, absence de `delivery_declared_at`, afficher **« Lien déjà préparé — déclaration possible après fermeture »** ;
- garder l'attestation explicite « J'ai réellement transmis le message au bon destinataire », le choix du canal, la justification 10–1000 caractères et la confirmation supplémentaire ;
- afficher **« Déclarer le lien déjà transmis »** lorsque le lien n'est plus en mémoire ;
- envoyer l'action API **existante** `declare_sent`, sans renvoyer/générer de lien : le serveur vérifie statut, utilisateur Auth, rôle, profil et destinataire avant transition ;
- rappeler que le registre inscrit **la date de déclaration**, pas nécessairement la date effective de remise, laquelle peut être précisée dans la justification.

Aucun changement du service Edge, des permissions, de la base, de Supabase Auth, du profil, de la RLS ni du workflow d'activation.

## Recette manuelle ciblée avant fusion
1. Ouvrir `https://schoolnet-snowy.vercel.app/app/admin/enrollment-requests` dans le compte Super Administrateur, avec un environnement **de prévisualisation** contenant ce correctif (la production reste inchangée avant fusion).
2. Ouvrir une demande dont l'invitation Parent est `prepared`, fermer et rouvrir la fenêtre, cliquer sur **Vérifier le compte et l'activation**.
3. Vérifier que **« Déclarer le lien déjà transmis »** apparaît sans révélation du lien originel, avec case, canal et justification obligatoires.
4. Laisser les cases décochées : le bouton doit rester désactivé. Saisir une justification de moins de 10 caractères : bouton désactivé. Tester sans transmettre réellement pour un autre dossier : **ne pas attester**.
5. Pour la remise **déjà effectuée et vérifiée**, cocher la vérification d'identité et la remise réelle, préciser le canal et une justification factuelle, puis confirmer.
6. Attendre `sent_declared` ; vérifier qu'aucun nouveau compte, lien ni e-mail n'est créé et que l'action échoue si répétée.
7. Demander au Parent de se déconnecter puis de se reconnecter **après** la déclaration ; une session antérieure à la déclaration ne doit pas suffire. Inspecter la preuve Auth côté serveur avant de confirmer `activated`.
8. Après validation visuelle et workflow CI (lint/build/Deno), fusionner cette PR sur `main` ; contrôle du déploiement automatique GitHub → Vercel ensuite.

## Contrôle SQL pré-correctif (lecture seule)
À la vérification du 12 novembre 2026 : 1 invitation Parent, `prepared`, `sent_declared_at=NULL`, profil Auth `parent` existant, `auth.users=11`, connexion Parent `password` et session réelle observées. Aucune mutation de ces données n'a été réalisée par la préparation du correctif.

## Dépendance connexe, non incluse ici
Le compte Apprenant sans adresse personnelle est traité séparément sur la branche `feature/schoolnet-student-sans-email`. Ne pas réutiliser le téléphone ou l'e-mail du Parent comme identifiant Auth unique d'un enfant. Ne pas mélanger les deux recettes.

**POINT DE REPRISE : CI de cette PR, puis contrôle visuel du bouton dans la prévisualisation ; aucune déclaration serveur à distance sans validation de l'administrateur.**
