# SCHOOLNET Lot 5.C — rattachement familial automatisé

## Statut
**À RELIRE : non appliqué à Supabase principal.** 
Fichier SQL dans `supabase/proposals/` pour éviter une migration implicite. 
Objectif : remplacer l'opération manuelle de liaison de Yao Thierno et Yao Tabra.

## Principe
L'apprenant passe à `enabled` seulement après connexion Auth et mot de passe personnel correctement vérifié par l'API. Le déclencheur SQL, exécuté **dans cette transaction**, vérifie :
- la demande et la relation Parent–Enfant validées ;
- l'invitation Parent `activated`, le bon `parent_id`, le rôle des deux profils ;
- la cohérence des e-mails côté Parent et de l'alias technique côté Apprenant ;
- les marqueurs **app_metadata** Auth et la confirmation des comptes ;
- l'absence d'une association familiale contradictoire.

Ensuite, il crée sans doublon `parent_links` et ajoute l'enfant dans `profiles.child_ids`. Si une condition échoue, l'activation est annulée ; il ne faut **jamais** contourner le contrôle ni relancer en boucle.

**Ce n'est pas une inscription scolaire :** `student_enrollments` et la finalisation administrative actuelle restent indépendantes. L'enfant apparaît dans « Mes enfants » même si sa classe n'existe pas encore.

## Tests
`node --test scripts/test-schoolnet-no-email-auto-family-link.mjs` : inspections statiques sans connexion. **Ces tests ne remplacent pas une recette transactionnelle PostgreSQL sur une sandbox.**

Vérifications obligatoires avant installation :
1. Tests des contraintes et triggers avec 2 parents et 2 enfants synthétiques dans un projet Supabase de test.
2. Double activation et idempotence ; collision de parents ; Parent non activé ; demande refusée.
3. Vérifier transaction rollback lors d'une erreur de liaison.
4. Vérifier `parent_links` et `child_ids` puis les écrans Parent et Apprenant.
5. Uniquement après validation, préparer une migration officielle avec Supabase CLI, faire revue des privilèges et appliquer à production.

## Preflight production en lecture seule
```sql
SELECT
  (SELECT count(*) FROM auth.users) AS auth_accounts,
  (SELECT count(*) FROM public.schoolnet_student_no_email_requests) AS no_email_identities,
  (SELECT count(*) FROM public.schoolnet_student_no_email_requests WHERE status='enabled') AS active_students,
  (SELECT count(*) FROM public.parent_links) AS family_links;
```

Le dossier Yao Tabra est déjà activé et lié manuellement : ce trigger n'effectuera aucune modification rétroactive de ce dossier.
