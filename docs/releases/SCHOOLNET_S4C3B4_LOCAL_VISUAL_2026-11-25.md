# SCHOOLNET S4-C.3-B.4 — Scénario visuel local fictif

## Utilisation
Sur le PC de recette, laisser Vite démarré dans schoolnet-tests et ouvrir avec le compte Enseignant connecté :
`http://127.0.0.1:5173/app/teacher/official-averages?schoolnet_c3b4_demo=1`

Le bandeau violet confirme un MODE LOCAL FICTIF. Parcourir les deux écoles de démonstration, T1/T2, les filtres d'état et les pages de 20 élèves. Vérifier que les notes fictives 12,50/20 et 0/20 sont distinctes des états non calculables.

## Limites de sécurité
Mode limité au hostname localhost / 127.0.0.1, à Vite DEV et au query flag explicite. Aucun accès aux notes officielles et aucune écriture en base depuis les fixtures. Hors de ce mode, les deux RPC sécurisées sont utilisées normalement et le message Activation SQL en attente demeure tant que leur installation n'a pas été autorisée.

Cette recette visuelle n'est pas un test de connexion navigateur ↔ PostgreSQL. Les permissions et pondérations SQL sont vérifiées dans la CI PostgreSQL jetable. Pas de merge main, pas d'installation SQL principal, pas de publication des résultats.
