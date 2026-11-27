# SCHOOLNET V2 — S4-D.3d · Accès au bulletin V2 depuis « Bulletins et exports »

**27 novembre 2026 — développement isolé sur la branche S4-D.3d.**

## Besoin réalisé
Le bulletin individuel S4-D.3c était visible uniquement dans la fiche élève de « Moyennes générales officielles ». Désormais, l'administrateur de son établissement dispose d'un parcours autonome dans « Bulletins et exports des moyennes » : établissement → année scolaire → classe → période → élève → aperçu du bulletin.

Le même composant S4-D.3b/S4-D.3c est réutilisé. Les moyennes par matière et générales continuent de provenir de la projection V2 contrôlée ; **aucun calcul, aucune note V1 ni aucune permission ne sont dupliqués**. Le rendu reste un aperçu HTML privé, non publiable.

## Écrans / parcours
- Nouveau panneau « Bulletins individuels V2 » dans l'interface **Admin établissement** de /app/school/official-documents.
- Les quatre listes scolaires sont alimentées par les API V2 existantes. L'élève appartient exclusivement à la cohorte renvoyée par la RPC scolaire autorisée.
- Aucun élève n'est présélectionné : choisir explicitement l'élève pour afficher les matières et le bulletin complet.
- L'établissement, l'année, la classe, la période, l'identité du compte et la révision participent à une clé de portée. Les anciennes projections et l'ancien élève sont immédiatement masqués lorsque cette clé change.
- Un lien « Bulletins V2 » depuis « Moyennes générales officielles » conduit au nouveau panneau. Le drapeau de recette fictive est conservé lors des allers-retours locaux.
- Ancien mode /app/school/official-documents?schoolnet_s4d_demo=1 **préservé** pour la maquette S4-D.3a ; il ne déclenche pas le nouvel espace et ne consulte pas de données réelles.
- Nouveau mode de recette : /app/school/official-documents?schoolnet_c3c4_demo=1. Il reprend exactement les fixtures C3-C4 du parcours Moyennes ; aucune RPC de l'instance principale n'est interrogée dans ce mode.

## États et sécurité
- Prévisualisation S4-D.3b uniquement : programme approuvé et moyennes d'élèves retournées par une réponse cohérente.
- Zéro publié 0,00 ≠ absence ; matière incomplète → moyenne générale « — » ; dossiers non configurés bloqués.
- Un changement de classe, école ou période invalide immédiatement le contexte et la sélection précédente ; réponses HTTP périmées ignorées.
- L'interface ne constitue jamais un droit. Les RPC existantes vérifient côté serveur les droits actifs de l'admin local, l'appartenance de l'élève, les matières et le programme.
- Si la RPC S4-D.3b n'est pas installée : **« Activation SQL du bulletin V2 en attente »**, sans bascule vers des notes fictives.
- Aucun enregistrement, approbation, PDF, export, impression, publication, émission officielle, écriture SQL, migration ni traitement de données financières.

## CI / recette Windows
CI : npm run qa:s4d3d + non-régressions qa:s4d3c, qa:s4d3b, qa:s4d3a, qa:s4d2c2, qa:s4c3c4, qa:s4c5, lint et build.

Dans D:\Bakary\10 autres\schoolnet-tests depuis une branche propre :

~~~powershell
git status -sb
git fetch origin
git switch -c local/schoolnet-s4d3d --track origin/feature/schoolnet-s4d3d-bulletins-hub-20261127
git log -1 --oneline
npm run qa:s4d3d
npm run build
git restore -- tsconfig.app.tsbuildinfo
git status -sb
npm run dev
~~~

Ouvrir http://localhost:5173/app/school/official-documents?schoolnet_c3c4_demo=1 sous compte réel school_admin en environnement DEV. Choisir école fictive A, année 2026–2027, classe fictive 6e B, T1 puis :
1. Élève fictif 01 : moyenne 16,67 / 20 ; trois matières complètes et bulletin non publié.
2. Élève fictif 02 : moyenne 0,00 / 20 valide.
3. Élève fictif 03 : 2/3 matières ; aucune moyenne générale.
4. Changer de période/classe : sélection élève annulée, ancien bulletin disparu, écran « programme non approuvé / à configurer » si nécessaire.
5. Via le lien « Consulter les moyennes », vérifier que le mode fictif reste explicitement activé.

Ne pas relancer les anciennes recettes déjà acceptées en dehors de cette vérification ciblée de navigation et de rendu.

## État de livraison
Branche dédiée empilée sur PR #64 (S4-D.3c), puis #63 (S4-D.3b). GitHub Actions doit attester la QA/lint/build, ensuite recette Windows utilisateur et GO métier. **Aucun GO SQL, aucune fusion main et aucun déploiement Vercel** ; Vercel Preview désactivé sur la branche. La future activation de la RPC et l'émission réelle de bulletins relèveront d'une approbation distincte.
