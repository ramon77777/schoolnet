# SCHOOLNET S4-B.2 — Tests multi-etablissements sur base jetable

Ce projet Supabase est **local au runner GitHub Actions**. Il n'est jamais
connecte au projet principal et toutes les identites, cours et ecoles sont
inventes. Aucune migration n'est appliquee sur le Supabase heberge.

La fixture charge les contrats V1 minimaux, S3-C, S4-A, S4-B.1,
ainsi que les nouvelles fonctions S4-B.2. Les RPC et les politiques des
cours libres V1 restent inchangees. Les scenarios effectues :
- Eleve de A : voit uniquement son cours, ses chapitres et ses
  ressources `public_to_course` avec URL HTTPS valide.
- Eleve de B : ne lit ni catalogue ni detail de A.
- Eleve non affecte : liste vide et detail refuse.
- Parent, professeur, responsable d'ecole et anonyme : refus.
- Revocation affectation eleve, appartenance, affectation enseignant,
  lien de cours, suspension ecole, matiere inactive : acces retire.
- Contenu prive enseignant et URL `javascript:` exclus.
- Un cours libre V1 inscrit ne devient pas un cours officiel.
- Aucune inscription ni progression V1 n'est modifiee.
- Le test retourne a l'etat initial par `ROLLBACK`.
- La recette du rollback ne supprime que les 5 fonctions S4-B.2
  et confirme que S4-B.1 et les tables V1 survivent.

**Limitation connue :** le bucket historique `course-resources`
est public en production. Le nouveau controle SQL protege la lecture
des catalogues et la communication des URL via l'interface, mais
ne peut pas rendre prive un fichier deja accessible par son URL
publique. Un changement de modele de stockage ferait l'objet d'une
migration separee avec compatibilite V1 garantie.

Aucun `supabase link`, `db push`, secret GitHub ni SQL heberge.


## Ports isoles pour les CI paralleles

Le banc S4-B.2 utilise `127.0.0.1:54332` (shadow `54333`),
plutot que le port Supabase par defaut `54322`, afin d'eviter une
collision avec le banc S4-B.1 lorsque plusieurs workflows GitHub
s'executent simultanement. Aucun port heberge n'est modifie.
