# SCHOOLNET V2 — C.3-C.3.1 / C.3-C.3.2
**Révision : 26 novembre 2026** — **proposition de développement SQL isolée, PAS de déploiement Supabase**.

## 1. Décisions métier respectées
- La liste des matières attendues est un **catalogue explicite** propre à l'établissement, l'année, la classe et la période ; elle ne découle pas implicitement d'une affectation enseignant.
- L'administrateur d'établissement approuvera cette liste via une **RPC de gestion sécurisée à préparer en C.3-C.3.3**. Aucun bouton ou RPC public n'est fourni par cette tranche.
- Toute modification de la liste après approbation repasse le catalogue en **brouillon** ; période verrouillée : pas de changement. Le catalogue vide ne peut pas être approuvé.
- Le coefficient matière reste dans \`school_period_subject_coefficients\`, séparé du catalogue : une matière attendue sans coefficient produit \`not_configured\`.
- \`0/20\` publié est une vraie note ; absent, non publié, dispense en attente et transfert à vérifier produisent \`incomplete\` (moyenne générale NULL).
- Calcul PostgreSQL \`numeric\` : moyenne de chaque matière non arrondie, puis pondération par coefficient et arrondi final sur 20. Aucune moyenne générale sur la base V1 ou un bulletin historique.
- \`previewOnly=true\`, aucun export nominatif ni diffusion aux parents/élèves dans cette tranche.

## 2. Artefacts
- \`supabase/proposals/s4c3c3_official_curriculum_and_general_average_kernel.sql\` : tables privées de catalogue, contraintes de contexte, protection des approbations et fonction de calcul **purement interne**.
- \`tests/s4c3c-tenant-ci/fixtures/minimal-postgres-school-schema.sql\` : fausses écoles/classes/périodes.
- \`tests/s4c3c-tenant-ci/fixtures/curriculum-general-averages-a-b.sql\` : tests SQL atomiques \`BEGIN/ROLLBACK\`.
- \`scripts/test-schoolnet-s4c3c3-sql-contract.mjs\` et workflow GitHub Actions dédié.

## 3. Frontières de sécurité
Les deux nouvelles tables sont dans le schéma privé \`schoolnet_private\`, avec RLS activée, sans privilège d'accès direct des rôles \`anon\` et \`authenticated\`. La fonction de calcul ne lit ni profils ni copies. Elle n'accorde **aucune autorisation** ; la future RPC C.3-C.3.3 devra :
- vérifier le rôle \`school_admin\` et l'affiliation active de l'établissement avec \`auth.uid()\`,
- vérifier l'année/classe/période, l'inscription de chaque élève et le catalogue approuvé,
- reconstruire les évaluations publiées et incluses **uniquement côté serveur**, avec les notes et barèmes officiels ;
- traiter les doubles affectations et cours partagés sans doubles comptes,
- appeler le noyau de calcul et ne restituer que la projection minimale nominative autorisée.

**Ne pas appeler ce noyau à partir du navigateur, même si l'utilisateur passe un UUID d'école.**

## 4. Limites intentionnelles
- C.3-C.3.1 et .2 ne sont **pas encore** le service SQL complet branché à la base. La RPC de lecture/gestion d'un établissement et ses contrôles d'identité relèvent de **C.3-C.3.3**.
- Aucune validation d'une dispense définitive ou transfert terminé : ces situations restent bloquées.
- Aucune interface de moyenne générale ni export de tableau de classe aujourd'hui.
- La politique d'export **trimestriel, semestriel, annuel**, en PDF/Excel et par classe, a été enregistrée dans **l'issue #39** pour le futur sous-lot dédié ; calcul annuel et permissions d'accès toutes matières nécessitent validation distincte.
- Les tests A/B sur schéma fictif **ne remplacent pas** les tests de RLS et RPC sur une base Supabase complète à l'étape C.3-C.3.3.

## 5. Séquence de validation
CI A/B jetable → lecture de la PR brouillon → recette locale \`schoolnet-tests\` → GO pour C.3-C.3.3 → tests de droits serveur → GO SQL principal distinct → GO fusion \`main\` et Vercel Free distinct.

**Ne pas retoucher S4-C.3-B.6, la moyenne des cours libres V1, les notes publiées ou les bulletins historiques.**
