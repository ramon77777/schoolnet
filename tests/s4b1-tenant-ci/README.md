# SCHOOLNET S4-B.1 — banc de test de rattachement A/B

Ce banc ne copie **aucune** donnée scolaire réelle. L'instance Supabase
est créée localement sur le runner GitHub Actions et supprimée à la fin.

Le schéma V1 historique n'étant pas entièrement reproductible depuis
les migrations du dépôt, `fixtures/legacy-minimal.sql` est la baseline
**minimale S4-A** copiée sans modification ; `course-core.sql` est le
contrat V1 minimal des cours ; le code serveur S3-C provient de la
proposition SQL existante.

La proposition S4-B.1 ajoute **une table privée** et **huit RPC**,
mais ne modifie ni `public.courses` ni ses politiques RLS ni les
`course_enrollments`. Les scénarios vérifient, avec des personnes/écoles
fictives :

- enseignant A peut voir seulement ses affectations et cours rattachés ;
- cours d'autrui/de B, cours archivé, classe étrangère, matière incohérente,
  cours avec inscriptions V1/progression ou coenseignant étranger : refus ;
- rattachement explicite, idempotence, retrait et réactivation ;
- administrateurs A et B ne peuvent voir que leur établissement ;
- élève, anonyme et lecture directe table privée : refus ;
- révocation d'une affectation fait disparaître le cours du catalogue ;
- aucune inscription, progression ou cours V1 n'est modifié ;
- tentative d'écriture depuis Preview refusée.

Le test se termine par `ROLLBACK` et le runner supprime tous les volumes.
Aucun `.env`, aucune clé ni commande `supabase link`, `db push`,
`apply_migration` à distance ; toutes les connexions ciblent
`127.0.0.1:54322`.

**Important :** ce raccordement ne donne pas accès aux ressources
ou évaluations officielles aux élèves. Ce sera une étape distincte
avec ses propres vérifications d'isolation.

La branche de développement crée automatiquement une Preview Vercel
de lecture seule tant que la migration n'est pas autorisée et activée
sur Supabase principal.
