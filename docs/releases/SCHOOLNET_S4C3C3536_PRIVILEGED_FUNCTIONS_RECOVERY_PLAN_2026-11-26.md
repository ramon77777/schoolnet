# SCHOOLNET V2 — S4-C.3-C.3.5.3.6
## Vérification ciblée des fonctions privilégiées et protocole de restauration indépendant

**Observation : 26 novembre 2026.** Périmètre : **audit en lecture seule et plan de recette**. Aucune installation, aucun export réel, aucun compte scolaire chargé sur un système de test. **AUCUNE AUTORISATION DE RESTAURATION OU D'INSTALLATION.**

### 1. Recette précédente confirmée sur Windows

Le sous-lot **C.3.5.3.5** est validé : `local/schoolnet-c3535`, commit **`0e0b674`**, **10 tests réussis/10**, 934 modules compilés, statut Git propre après restauration de `tsconfig.app.tsbuildinfo`. L'inventaire de référence `tests/s4c3c3535/installed-effect-inventory.json` conserve la présence de **65 / 65 objets historiques** (50 fonctions, 9 tables, 5 triggers, 1 policy) sans prétendre certifier leurs corps ou permissions. Les dix textes SQL historiques sont comparés à leur empreinte SHA-256 dans C.3.5.3.4. Ces étapes demeurent valides : inutile de les recommencer.

### 2. Revue des fonctions critiques sur Supabase principal — lecture seule

L'audit ciblé a interrogé exclusivement `pg_catalog` et `pg_get_functiondef`, **sans copier le code complet des fonctions dans GitHub**, et sans lire aucun profil, étudiant, note, JWT ou objet Storage.

| Fonction inspectée | Constat vérifié | Risque à instruire |
| --- | --- | --- |
| `public.get_my_role()` | `SECURITY DEFINER`, propriétaire `postgres`, `search_path=public`, EXECUTE autorisé à `anon` et `authenticated`. Le corps observé sélectionne uniquement `p.role` dans `public.profiles` **où `p.id = auth.uid()`** ; ne lit pas `user_metadata`. | Permettre un audit de sa politique d'accès, de ses dépendances et de son chemin de résolution. **Aucune fuite de rôle d'autrui démontrée**. |
| `public.notify_assessment_correction_published()` | Fonction `trigger`, `SECURITY DEFINER`, `search_path=public, pg_temp`, EXECUTE `anon` indiqué. | Examiner son déclencheur, son code et ses privilèges. Une fonction de type `trigger` n'est pas une RPC ordinaire ; l'EXECUTE seul n'établit aucune exploitation. |
| `public.trigger_refresh_progress_from_assessment_submission()` | Fonction `trigger`, `SECURITY DEFINER`, `search_path=public`, EXECUTE `anon` indiqué. | Examiner les objets réellement modifiés et le contexte d'invocation ; aucune correction immédiate autorisée. |
| `public.schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid)` | Interface `SECURITY INVOKER`, `search_path=pg_catalog`, EXECUTE `authenticated` seulement. | L'autorisation doit être revérifiée dans le helper appelé ; les tests JWT A/B jetables hérités restent indispensables. |
| `schoolnet_private.teacher_official_grade(uuid,uuid,text,numeric,text)` | Helper privé `SECURITY DEFINER`, `search_path=pg_catalog`, EXECUTE `authenticated` seulement ; source mentionnant `auth.uid()` et les affiliations scolaires. | Revalider sur Supabase jetable le cas de révocation d'une affectation et l'isolation inter-établissements. |

**Précision sur le `search_path` :** les rôles `anon`, `authenticated` et `service_role` observés ne possèdent **pas** `CREATE` sur le schéma `public`. `anon` et `authenticated` n'ont pas non plus `CREATE` sur `schoolnet_private`. C'est un élément de défense contre certaines substitutions d'objets, pas une preuve que toute fonction privilégiée est sûre. Le `search_path=public` hérité reste une surface à contrôler par une revue de code et de dépendances.

### 3. Contrôle du conseiller de sécurité Supabase

Le conseiller Supabase **get_advisors(security)** retourne cinq familles d'observations, présentées **comme alertes de linter et non comme cinq failles avérées** :

| Alerte | Nombre d'observations |
| --- | ---: |
| RLS activée, aucune policy | 18 (information) |
| Fonctions à `search_path` mutable | 14 (avertissement) |
| `SECURITY DEFINER` potentiellement exécutable anonymement | 45 (avertissement) |
| `SECURITY DEFINER` potentiellement exécutable par des comptes connectés | 114 (avertissement) |
| Protection contre les mots de passe compromis désactivée | 1 (avertissement) |

Ces nombres **peuvent se recouper** et concernent le projet entier, y compris des objets techniques. Il ne faut pas les additionner comme des vulnérabilités. L'alerte Auth sur les mots de passe compromis mérite une décision produit/sécurité séparée ; pas de changement automatique de configuration. Les actions conseillées doivent être étudiées sur chaque objet avant modification.

Références : [Sécuriser l'API](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Linter — schéma de recherche](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [Fonctions exécutables sans connexion](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [Fonctions exécutables après connexion](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

### 4. Plan de restauration — quatre étapes, aucune exécutée

**Phase A — Préparation documentaire sans manipulation de la sauvegarde**

1. Identifier et confirmer l'archive privée la plus récente et sa somme SHA-256. Les anciennes vérifications de l'archive du 24 novembre (checksum, `pg_restore -l`, lecture complète) **ne valent pas** restauration.
2. Inventorier les composants indispensables : PostgreSQL (schémas, extensions, rôles, fonctions, RLS, journaux de migration), Auth (configuration et comptes selon périmètre permis), Storage (buckets, politiques **et octets des objets**), secrets hors archive (à **recréer**, jamais publier) et intégrations éventuelles.
3. Fixer la version des outils de sauvegarde, les exigences PostgreSQL et le périmètre autorisé. La Supabase CLI ayant évolué en v3, vérifier les commandes sur la version exacte avant exécution ; ne jamais coller une commande de restauration vers la production.
4. Documenter les deux migrations présentes uniquement dans GitHub : protections de corrections du 9 novembre partiellement observables, bascule annuelle du 10 novembre **non installée**. Ne pas les installer dans une restauration à des fins de réconciliation.

**Phase B — Répétition 100 % fictive sur environnement jetable**

1. Créer une base PostgreSQL/Supabase **indépendante et jetable**, sans lien réseau ou secret avec la production ; comptes, écoles A/B, enseignants et étudiants strictement fictifs.
2. Reconstruire la structure de test à partir des scripts autorisés et vérifier les migrations par leurs empreintes et leurs préconditions. Aucune copie d'utilisateurs ou de notes de production.
3. Vérifier les signatures, l'activation RLS, l'inaccessibilité des helpers privés depuis PostgREST, les permissions `anon/authenticated`, les révocations, le refus école A→B, les moyennes à zéro et manquantes.
4. Simuler une **restauration et un retour arrière** avec données synthétiques ; produire un procès-verbal contenant uniquement des compteurs et résultats non sensibles. L'environnement doit être détruit après la recette.

**Phase C — Restauration privée complète (uniquement après GO distinct)**

1. **Obtenir l'accord explicite** pour utiliser une archive réelle et une cible dédiée. Vérifier l'accès restreint, l'absence d'envoi SMS/e-mails et l'isolement des webhooks et services sortants pour prévenir des actions involontaires.
2. Restaurer PostgreSQL sur une **nouvelle cible indépendante** conforme à la version/aux extensions supportées. Contrôler structures, rôles, RLS, signatures, contraintes et inventaire d'objets sans exporter les informations nominatives vers GitHub.
3. Vérifier le fonctionnement d'**Auth** sans réutiliser des clés de production dans des applications de recette ; remplacer les secrets et examiner les hooks/fournisseurs d'identité. Ne pas publier les identifiants ou mots de passe.
4. Restaurer séparément les **octets de Storage** depuis une source privée adaptée ; un dump de métadonnées PostgreSQL ne restitue **pas** les fichiers. Contrôler buckets, accès, échantillons autorisés et cohérence d'objets.
5. Documenter la réussite et le rollback d'une cible de test, puis supprimer ses données sensibles selon les règles d'accès. Si un composant Auth ou Storage manque, **la restauration complète reste non prouvée**.

**Phase D — Décision et activation séparées**

- **GO pour écrire sur Supabase principal : NON.** Exiger validation du résultat des phases B et C, analyse des SQL C.3-C.3 sur une copie représentative, liste vérifiée des préconditions, sauvegarde récente et plan de retour arrière.
- **GO pour fusionner `main` et déployer Vercel : NON.** Ce seront des validations explicites et distinctes.
- **Exports de notes scolaires réelles : NON.** Maintenir `SCHOOLNET_REAL_EXPORTS_RELEASED = false`.

Les phases A/B sont ici **préparées sur papier seulement** : aucune base jetable supplémentaire créée dans ce sous-lot. Les phases C/D sont uniquement des critères pour une future autorisation.

Documentation officielle sur les sauvegardes : [Database Backups](https://supabase.com/docs/guides/platform/backups) et [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Supabase précise notamment que les sauvegardes de base de données **ne contiennent pas les objets binaires Storage**, seulement leurs métadonnées.

### 5. Traçabilité et protections

- `tests/s4c3c3536/privileged-review-observation.json` : constat consolidé sur cinq fonctions, droits des rôles, alertes du linter, portes de validation.
- `scripts/test-schoolnet-s4c3c3536-privileged-review.mjs` : tests sans réseau, comparant les preuves enregistrées, les 65 objets précédents, le statut des sauvegardes et la fermeture des déploiements.
- `.github/workflows/schoolnet-s4c3c3536-privileged-review-ci.yml` : QA et régressions TypeScript sans connexion ni jeton de Supabase principal.
- Cette note : plan de restauration à soumettre pour validation **avant utilisation d'une archive réelle**.

**Aucune politique RLS, fonction, migration, clé, compte, donnée d'école, sauvegarde ou configuration Auth n'a été modifiée.** Aucun fichier n'est écrit dans `supabase/migrations`, aucune commande `db push`/`migration repair`, aucun déploiement Vercel, aucune fusion `main`.
