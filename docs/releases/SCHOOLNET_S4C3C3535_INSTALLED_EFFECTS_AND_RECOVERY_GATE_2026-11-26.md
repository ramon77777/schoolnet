# SCHOOLNET V2 — S4-C.3-C.3.5.3.5
## Contrôle de présence des effets SQL historiques et portes de restauration

**Date :** 26 novembre 2026  
**Statut :** préparation auditée sur branche isolée ; **AUCUNE MISE EN PRODUCTION AUTORISÉE**.  
**Dépendance :** S4-C.3-C.3.5.3.4, PR brouillon #56, commit Windows validé `2a35c85`.

### 1. Résultat Windows validé et état de la provenance

Sur `D:\Bakary\10 autres\schoolnet-tests`, l'utilisateur a confirmé :

- branche `local/schoolnet-c3534`, HEAD `2a35c85`, référence distante attendue ;
- `npm run qa:s4c3c3534` : **12/12 tests réussis** ;
- `npm run build` : TypeScript + Vite, **934 modules**, compilation réussie ;
- `git restore -- tsconfig.app.tsbuildinfo` et dernier `git status -sb` **propres**.

Les 10 migrations présentes dans le registre Supabase mais absentes du dossier Git ont maintenant un texte SQL archivé ou associé à leur fichier candidat, **vérifié par SHA-256**. Deux textes particuliers du 13/11 et du 25/11 sont archivés sous `tests/s4c3c3534/recovered-ledger/*.sql.txt`, en dehors des migrations actives. Le registre distant n'a subi aucune modification.

### 2. Inventaire des objets actuellement visibles dans PostgreSQL 17

D'après une **inspection en lecture seule des catalogues PostgreSQL**, 65 objets distincts extraits des dix textes historiques ont été recherchés. Résultat : **65 / 65 noms retrouvés**.

| Catégorie issue des déclarations SQL | Présents sur Supabase principal |
| --- | ---: |
| Fonctions, dont RPC exposées et helpers privés | 50 / 50 |
| Tables (y compris les tables privées de configuration et d'audit) | 9 / 9 |
| Triggers | 5 / 5, tous activés (statut `O`) |
| Policies | 1 / 1 |
| **Total** | **65 / 65** |

Toutes les **neuf tables** détectées ont `relrowsecurity = true`. Le snapshot `tests/s4c3c3535/installed-effect-inventory.json` conserve les **signatures observées** des fonctions, leur mode `SECURITY DEFINER/INVOKER`, leur `search_path`, les permissions d'appel `anon/authenticated`, les liaisons des triggers, le caractère activé des RLS et les relations des policies. **Aucune donnée métier, note, fiche ou compte d'élève n'a été lu.**

**Important : cet inventaire n'est pas une certification de conformité intégrale.** Les objets ont été trouvés par nom de schéma et d'objet. Il faut encore comparer précisément les signatures à celles des textes historiques, distinguer les fonctions remplacées depuis leur création, relire les clauses RLS et leurs permissions, et tester les décisions d'accès sous de vrais JWT dans une **base jetable**. Une politique présente peut toujours être incorrecte : sa seule présence n'atteste pas de son efficacité.

### 3. Observations de sécurité à analyser séparément

- `public.get_my_role()` existe sur la base héritée en `SECURITY DEFINER`, `search_path=public` et avec `EXECUTE` autorisé à `anon`. Le contexte d'appel et les dépendances doivent être évalués. Ne pas interpréter automatiquement cette configuration comme une preuve d'exploitation.
- Deux anciennes fonctions de retour `trigger` — `public.notify_assessment_correction_published` et `public.trigger_refresh_progress_from_assessment_submission` — affichent `SECURITY DEFINER` et des droits `EXECUTE` hérités pour `anon`. Ce sont des fonctions de trigger : leur invocabilité effective et leurs privilèges doivent être examinés **en contexte** avant tout durcissement.
- Les règles **RLS**, les droits `GRANT/REVOKE`, les fonctions de liaison enseignant/élève et les hooks Auth ne doivent pas être réécrits en production sur la seule base d'un résultat **65/65**.

Aucune correction de sécurité, policy, fonction, trigger ou droit n'a été effectuée ici.

### 4. Chaîne de restauration — blocage maintenu

L'utilisateur avait auparavant vérifié une archive PostgreSQL locale dans `D:\SCHOOLNET_BACKUPS_PRIVES` : empreinte SHA-256 conforme, `pg_restore -l` reconnu et lecture intégrale réussie. Ce constat est **utile mais insuffisant** :

1. **Base de données :** aucune restauration contrôlée et documentée dans une base de test indépendante n'a été réalisée dans ce projet. Vérifier le périmètre des schémas, extensions, fonctions, policies, grants, données et rôles après une restauration autorisée.
2. **Auth :** identifier les éléments nécessaires (comptes, références, hooks, paramètres externes, emails de connexion, clés gérées hors dump) et leurs méthodes de sauvegarde/recréation. Ne pas publier les informations sensibles.
3. **Storage :** l'inventaire SQL des objets n'est pas la sauvegarde des **octets des fichiers stockés**. Vérifier les buckets, contenus, restrictions, métadonnées et politiques d'accès séparément.
4. **Cible isolée :** disposer d'une cible non productive, accès restreint, compatibilité PostgreSQL/Supabase, sans liaison à la production ; ne pas restaurer sur le projet principal.
5. **Critères de réception :** structure et compte d'objets cohérents, contrôles RLS et refus inter-établissements A/B, vérification des périodes et coefficients, échantillons purement fictifs, restauration et retour arrière reproductibles, preuve du temps et du responsable de la vérification sans exposer de dossiers d'élèves.

**Aucune commande de restauration n'est déclenchée** dans ce sous-lot. Le registre `tests/s4c3c3533/recovery-readiness.json` reste `BLOCKED` pour Auth, Storage et reprise. Un GO utilisateur spécifique sera nécessaire avant toute manipulation de sauvegarde privée.

### 5. Pourquoi C.3-C.3 et les exports restent fermés

Les **65 objets** inspectés appartiennent aux **dix migrations déjà enregistrées à distance** : ils ne sont pas les nouveaux objets des moyennes générales C.3-C.3. Les tables `schoolnet_private.school_official_curricula` et `schoolnet_private.school_official_curriculum_subjects`, ainsi que les RPC générales et d'export V2, sont encore absentes de Supabase principal. Cette absence est volontaire à ce stade.

Le sous-lot de bascule annuelle `20261110090000`, présent uniquement dans GitHub, demeure hors périmètre : ses tables et RPC ne sont pas installées. Le fichier Git-only du 09/11 comporte des effets de sécurité actuellement observables sans attribution historique formelle.

### 6. Livrables GitHub et méthode de recette

- `tests/s4c3c3535/installed-effect-inventory.json` : 65 objets, origine par version, propriétés observées, limitations et portes bloquées.
- `scripts/test-schoolnet-s4c3c3535-effect-inventory.mjs` : tests Node contre des **preuves Git figées**, sans accès réseau à l'instance.
- `.github/workflows/schoolnet-s4c3c3535-effect-inventory-ci.yml` : QA, régressions, lint, build ; **aucun secret Supabase ni connexion à une base hébergée**.
- Cette note : état de la vérification et critères d'une future restauration réellement certifiée.

**Workflow :** branche de travail GitHub → GitHub Actions → mise à jour locale `schoolnet-tests` → tests Windows → validation. Le premier GO supplémentaire à obtenir concerne une restauration isolée et la validation des règles de sécurité, **pas une migration automatique**.

### 7. Portes de décision

| Porte | Situation |
| --- | --- |
| Dix textes SQL enregistrés | Récupérés, SHA-256 validés |
| 65 objets historiques nommés | Présents |
| Concordance complète des définitions/GRANT/RLS | **Non certifiée** |
| Archive locale lisible | Confirmée auparavant, pas restaurée |
| Restauration DB + Auth + Storage | **Non prouvée** |
| Installation réelle C.3-C.3 | **NON** |
| Exports PDF/Excel de notes réelles | **NON** |
| Fusion `main` et déploiement Vercel | **NON** |

**Conclusion :** le risque d'une migration historique *introuvable* a nettement reculé, mais ce constat ne remplace ni une vérification de sécurité ni une restauration testée. Prochaine étape : autorisation ciblée de préparer une restauration sur cible indépendante et comparaison sémantique des fonctions critiques, avant toute opération sur Supabase principal.
