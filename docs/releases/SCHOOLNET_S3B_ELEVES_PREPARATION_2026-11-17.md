# SCHOOLNET 2.0 — S3-B | Gestion des eleves par etablissement

**Date : 17 novembre 2026**  
**Etat : code et proposition SQL prepares sur GitHub ; S3-B NON installee dans Supabase ; aucun deploiement Vercel.**

## Objectif
Permettre a chaque administrateur local actif de consulter uniquement les eleves
rattaches a son etablissement et de gerer une **affiliation scolaire**. Ce lien
d'etablissement est distinct des inscriptions dans les classes, des resultats,
bulletins, profils familiaux et cours.

## Etat constate avant S3-B
- Supabase principal `schoolnet_2.0` : **5 profils student**, **0 membership student**.
- **4** comptes eleves eligibles au rattachement par adresse e-mail personnelle
  confirmee dans le perimetre actuel.
- **1** profil student fait deja partie du parcours `schoolnet_student_no_email_requests`.
  Son adresse technique ne doit **jamais** etre utilisee pour une recherche
  ou un rattachement par e-mail. Ce flux sera integre par une procedure
  specifique et verifiee, sans court-circuiter la validation familiale.
- 2 ecoles actives, 1 affiliation `school_admin` active, 2 inscriptions
  scolaires historiques et 2 affectations historiques aux classes.
- S2-A / S2-B / S3-A sont installees ; S3-B n'a aucune fonction permanente.
- Table `schoolnet_school_memberships` deja presente :
  cle unique `(school_id,user_id)`, role `student`, etats `active/revoked`,
  controle de correspondance au role profile.
- RLS et absence de droits INSERT / UPDATE directs pour `authenticated`
  maintenues.

## Fonctionnalites developpees sur la branche GitHub
- `/app/school/students`, pour le role `school_admin` uniquement.
- Selecteur des seuls etablissements actifs autorises.
- Repertoire local, recherche par nom ou e-mail visible, filtre
  Tous / Actifs / Revoques et indicateurs actifs/revoques.
- Rattachement d'un compte student preexistant par e-mail **personnel**
  confirme. Aucune creation de compte Auth.
- Revocation locale et reactivation controlee du meme rattachement
  (confirmation utilisateur et messages de resultat).
- Rendu premium coherent avec S2-B / S3-A ; responsive.
- Lectures autorisees seulement lorsque la RPC S3-B existe ;
  message explicite `S3-B — Activation du module en attente` sinon.
- Sur localhost et Previews Vercel : **lecture seule**, mutations refusees
  dans le navigateur et par le serveur lorsqu'il sera installe.
- Aucune option d'affectation en classe et aucune manipulation de notes,
  bulletins, cours, parents, child_ids ou dossiers existants.

### Fichiers frontend
- `src/features/schools/pages/LocalSchoolStudents.tsx`
- `src/features/schools/lib/schoolStudentsApi.ts`
- `src/features/schools/lib/schoolStudentWritePolicy.ts`
- `src/routes/router.tsx`
- `src/layouts/DashboardLayout.tsx`
- `src/features/schools/pages/LocalSchoolDashboard.tsx`

## Proposition SQL (NE PAS INSTALLER sans nouvel accord)
**Fichier :** `supabase/proposals/s3b_school_students_roster_and_memberships.sql`

Fonctions publiques `SECURITY INVOKER` :
- `schoolnet_school_student_roster(p_school_id uuid)`
- `schoolnet_school_student_attach(p_school_id uuid,p_email text)`
- `schoolnet_school_student_set_active(p_school_id uuid,p_membership_id uuid,p_active boolean)`

Les fonctions `SECURITY DEFINER` correspondantes restent dans
`schoolnet_private`. Chaque appel exige `auth.uid()`, le role
`school_admin` et une affiliation active pour l'ecole cible. Aucun
endpoint d'annuaire global ne permet de trouver des eleves d'une autre ecole.

La recherche d'un eleve se fait par e-mail **exact**, compare au compte
Auth confirme et non suspendu. L'exclusion par
`schoolnet_student_no_email_requests.student_auth_user_id` bloque
explicitement les comptes du parcours sans e-mail. Le repertoire
masque egalement tout `technical_email` lorsqu'un compte sans e-mail
est rattache par une procedure future.

Le controle `request.headers.origin` (domaine officiel exact) est
un **garde-fou complementaire anti-preview**, jamais une preuve
d'identite, car Origin peut etre forge hors navigateur.

Journal d'audit: `school_student_linked`,
`school_student_revoked`, `school_student_reactivated`.
Anciennes actions conservees. `anon` ne peut executer les RPC.
Les RLS existantes ne sont pas assouplies.

## Recette SQL reversible deja realisee
**Fichier :** `supabase/verification/20261117_s3b_school_student_membership_rollback.sql`

Le script a ete execute, avec la proposition SQL, dans une transaction
`BEGIN ... ROLLBACK` sur le principal. **Resultat PASS** :
`S3B_EMAIL_STUDENT_CROSS_SCHOOL_ROSTER_REVOKE_AUDIT_NOEMAIL_ROLLBACK_PASS`.

Controles exerces : ecole A, ecole B refusee, meme eleve dans deux ecoles
apres autorisation de B, isolation des statuts, rejets role student /
email teacher / email inconnu / email technique sans-email / doublons,
Preview, Origin absente et fausse, revocation puis reactivation,
audit, admin local revoque dans A mais toujours autorise dans B.

**Apres ROLLBACK :** 0 membership student, 1 membership au total,
5 evenements d'audit, 5 profils student, 2 classes historiques,
2 inscriptions et 2 membres de classes historiques, aucune RPC S3-B
et aucune entree de migration S3-B.

## Tests hors ligne et CI
- `scripts/test-schoolnet-s3b-preview-guard.mjs` : 11 tests de regression,
  filtres, navigation, permission, SQL et parcours sans e-mail.
- Commande `npm run qa:s3b`, ajoutee dans `package.json`.
- Workflow GitHub Actions de la branche : QA S2-B/S3-A/S3-B,
  ESLint et TypeScript/Vite, sans installation SQL ni publication manuelle.
- **Ces 11 tests n'ont pas encore ete executes sur le poste Windows.**
  La validation locale est la prochaine etape utilisateur.

## Regles de reprise / de publication
- PR #14 reste **en brouillon**, branche
  `feature/schoolnet-s2a-classes-tenant-qa`.
- Ne pas fusionner la PR, ni promouvoir Vercel Production.
- Ne pas installer S3-B ni executer `supabase db push` sans accord
  distinct. Ne pas supprimer `supabase/proposals/staged/` ni les
  scripts locaux non suivis.
- Un rattachement n'est pas une inscription dans une classe :
  ces affectations seront developpees en S3-C.
- Pour les mineurs sans e-mail : garder le parcours d'activation
  familial existant ; une liaison encadree doit etre concue a part.
- Une Preview Vercel automatique peut etre generee par les commits
  de la branche ; elle n'autorise aucune mutation.

### Prochaine recette locale (Windows VS Code)
```powershell
git pull --ff-only origin feature/schoolnet-s2a-classes-tenant-qa
npm run qa:s3b
npm run lint
npm run build
npm run dev
```

Depuis un compte `school_admin`, ouvrir :
`http://localhost:5173/app/school/students`.

Attendu : menu Eleves, ecole autorisee, bandeau bleu « lecture seule »,
bandeau jaune « Activation du module en attente », formulaire inactif,
repertoire inactif, filtres visibles sans données d'autres ecoles.
Ne pas saisir d'adresse reelle pour une mutation sur localhost.

Suite : validation des captures ; audit de prerequis/backup adapte
avant une installation S3-B soumise a autorisation separee.
