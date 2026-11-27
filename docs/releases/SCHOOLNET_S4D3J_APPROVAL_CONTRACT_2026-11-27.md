# SCHOOLNET — S4-D.3j · Recette de conception technique (27-11-2026)

**Statut : proposition de contrat de sécurité, non exécutable en production.**

## Livrables
- `docs/architecture/SCHOOLNET_S4D3J_SECURE_APPROVAL_BACKEND_2026-11-27.md` : architecture cible, 6 tables privées proposées, permissions, RLS, étapes, concurrence, audit et accès familiaux.
- `tests/s4d3j/approval-contract-simulator.ts` : simulateur hypothétique **dans tests uniquement**, sans I/O, SQL, écriture ni intégration dans l'application.
- `scripts/test-schoolnet-s4d3j-workflow-contract.mjs` et `npm run qa:s4d3j` : tests purement locaux/CI des invariants de la conception ; **aucun test JWT/SQL réel n'est effectué**.
- CI GitHub sur une PR brouillon, interdiction de Vercel Preview pour la branche.

## Vérification Windows ciblée

Depuis le worktree déjà utilisé, **seulement après CI verte et si l'état Git est propre** :

~~~powershell
cd "D:\Bakary\10 autres\schoolnet-tests"
git status -sb
git fetch origin
git switch -c local/schoolnet-s4d3j --track origin/feature/schoolnet-s4d3j-secure-workflow-contract-20261127
git log -1 --oneline
npm run qa:s4d3j
npm run build
git restore -- tsconfig.app.tsbuildinfo
git status -sb
~~~

**Aucune recette écran** n'est requise ; la V2 existante reste inchangée. Ne pas relancer les validations S4-D.3a à S4-D.3h déjà acceptées. Le nouveau test ne prétend pas démontrer la sécurité réelle des futures RPC.

## Portes conservées
Pas de migration dans `supabase/migrations`, pas d'exécution SQL sur Supabase principal, pas d'installation de RLS, aucune permission, aucune écriture bulletin, aucun merge `main`, aucun Vercel et aucune publication réelle. Les propositions C3-C3 et S4-D.3b restent des dépendances à valider sur une base jetable avec Auth/JWT réels avant tout développement d'une RPC de décision.

## Suite proposée
Après validation de ce cadrage technique, demander une **autorisation distincte** pour créer un prototype SQL sur une base entièrement jetable, puis le tester (JWT A/B, RLS, transactions et échec fermé). L'autorisation d'un prototype jetable ne vaudra jamais accord d'installation sur Supabase principal.
