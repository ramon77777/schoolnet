# SCHOOLNET V2 — S4-D.3i · Dossier d'arbitrage des 7 règles métier des bulletins

**Établi le : 27 novembre 2026**  
**Statut : RÉFÉRENCE PRODUIT VALIDÉE — 7/7 orientations A adoptées ; aucune clause déployée en établissement**  
**Version : arbitrage produit confirmé par l'utilisateur le 27 novembre 2026 ; aucune approbation d'établissement ni activation serveur**  
**Base documentaire technique : S4-D.3f / S4-D.3g / S4-D.3h, PR #67 / #68 / #69**

## 1. Objet, portée et distinction des niveaux de validation

Ce dossier consigne les **sept décisions de référence explicitement validées par l'utilisateur le 27 novembre 2026** pour cadrer SCHOOLNET V2. Il ne constitue pas un règlement scolaire adopté par un établissement et n'autorise aucune opération réelle.

Il faut distinguer :
- **Arbitrage produit SCHOOLNET** : adopter ou amender des principes et capacités minimales de la plateforme.
- **Désignation par chaque établissement** : nommer les responsables et confirmer ses exigences de bulletin, sans déroger aux protections globales.
- **Activation technique** : créer ultérieurement les habilitations, le journal, les snapshots, les RPC et leurs recettes de sécurité. Cette étape nécessite un nouveau GO explicite, distinct de l'accord sur les principes.

SCHOOLNET possède actuellement les rôles applicatifs `admin`, `school_admin`, `teacher`, `student`, `parent`. **Aucun rôle nouveau, aucun droit d'approbation ou publication n'est introduit par ce document.** Un « directeur » ou « responsable de diffusion » désigne une **fonction métier**, pas un rôle applicatif déjà présent.

Le système de prévisualisation et de calcul V2 déjà développé reste strictement privé, non publiable. Une note publiée de `0,00 / 20` est valide ; une note manquante reste `NULL` et ne devient jamais zéro.

## 2. Arbitrages métier : les sept options A validées au niveau produit

Pour les décisions D1 à D7, **l'option A est adoptée comme référence de conception SCHOOLNET**. L'option B est conservée ci-dessous comme alternative non retenue pour la première version. Les désignations d'établissement, les preuves de mandat, les mentions réglementaires applicables et les exigences techniques doivent encore être précisées.

### D1 — Qui soumet le bulletin à examen ? `requester`

- **A — recommandation** : un utilisateur `school_admin` **explicitement habilité** à la soumission pour son établissement, l'année/la classe/la période concernées, soumet une **version figée** d'un bulletin pédagogiquement complet. Les enseignants restent responsables des résultats relevant de leurs affectations, mais ne soumettent pas de bulletin administratif dans le MVP.
- **B — alternative** : autoriser aussi un enseignant responsable, à condition de définir une habilitation supplémentaire limitée, sans accès global aux bulletins des autres classes.
- **Invariants** : vérifier affiliation active, périmètre, complétude et permission serveur ; rejeter les tentatives hors établissement et les demandes sur des données non approuvées.
- **Décision produit** : option A validée le 27 novembre 2026 ; habilitation de soumission non créée.

### D2 — Qui approuve, refuse ou renvoie en correction ? `approver`

- **A — recommandation** : un **responsable de l'établissement mandaté**, titulaire d'un compte propre (rôle technique existant `school_admin` + habilitation d'approbation **distincte**), prononce une décision motivée. **L'identifiant du décideur doit être différent de celui du demandeur.**
- **B — alternative** : imposer un second niveau d'examen après la décision initiale, pour certains cycles ou établissements.
- **Invariants** : pas d'auto-approbation, pas d'autorisation implicite via le rôle `admin` de plateforme, décision attachée à une version inchangée ; si aucun deuxième acteur n'est désigné, le bulletin **reste non publiable** tant qu'une procédure de délégation fiable n'est pas adoptée.
- **Décision produit** : option A validée le 27 novembre 2026 ; habilitations et personne mandatée non désignées.

### D3 — Qui autorise et exécute la publication / le retrait ? `publisher`

- **A — recommandation** : un `school_admin` expressément titulaire d'une permission de diffusion peut **autoriser puis déclencher la publication** en deux actions explicites et tracées. **La même personne que l'approbateur peut être habilitée à diffuser**, mais jamais par déduction automatique de son droit d'approbation. Le demandeur initial ne peut pas contourner l'étape de décision.
- **B — alternative** : exiger **trois personnes distinctes** pour demande, approbation et publication, quel que soit l'établissement.
- **Invariants** : `approval_granted` ≠ `publication_authorized` ≠ `publication_executed` ; aucune mise en ligne sur simple clic « approuver ». La révocation d'une publication exige une permission distincte et un motif.
- **Arbitrage produit D3** : séparation des permissions obligatoire ; leur cumul par l'approbateur est possible seulement si chaque habilitation est distinctement accordée. Trois personnes distinctes ne sont pas imposées au MVP.
- **Décision produit** : option A validée le 27 novembre 2026 ; diffusion réelle non activée.

### D4 — Comment attribuer, limiter et retirer les habilitations ? `delegations`

- **A — recommandation** : désignation nominative par la **direction reconnue de l'établissement**, avec preuve de mandat ; l'administration technique SCHOOLNET peut exécuter une **initialisation vérifiée** sans obtenir elle-même un pouvoir pédagogique. Les habilitations sont limitées à l'établissement, à une action, à une portée scolaire, à une période de validité, et peuvent être révoquées immédiatement. Toute délégation ou révocation génère une trace serveur.
- **B — alternative** : délégation uniquement par un gestionnaire d'établissement déjà habilité à gérer les mandats, après mise en place sécurisée de ce droit. Il faut alors définir séparément qui crée le tout premier gestionnaire.
- **Invariants** : aucune auto-délégation, aucune délégation à un compte non affilié, aucune permission inter-établissements, pas d'élévation par modification des métadonnées du navigateur.
- **Décision produit** : option A validée le 27 novembre 2026 ; preuve de mandat initiale et protocole de délégation à finaliser.

### D5 — Quelles mentions sont requises avant publication ? `supplementary_data`

- **A — recommandation** : socle fonctionnel **proposé** : élève, établissement, année, classe, période, matières attendues, coefficients approuvés, résultats disponibles, complétude et moyenne générale calculable. Pour **rang, absences, appréciations, signatures**, appliquer une **politique explicite par établissement et cycle** après vérification des obligations applicables ; aucune valeur absente ne peut être inventée. Si un champ est déclaré obligatoire mais non alimenté par une source autorisée, **bloquer la publication**.
- **B — alternative** : adopter un modèle unique de bulletin avec des mentions imposées à tous les établissements, uniquement après preuve des exigences et de la couverture de tous les cycles.
- **Invariants** : ne pas décréter ici une obligation nationale non vérifiée ; l'absence de configuration valide de politique de mentions bloque l'émission réelle, même si la moyenne est calculable.
- **Décision produit** : option A validée le 27 novembre 2026 ; mentions obligatoires à vérifier selon les exigences applicables.

### D6 — Que faire après une correction ou un retrait ? `withdrawal`

- **A — recommandation** : les décisions concernent un **instantané immuable**. Toute correction de notes, coefficients, matière ou périmètre créé une **nouvelle version** et exige un nouvel examen. Une version publiée doit pouvoir être **retirée avec motif**, être désignée comme remplacée si un nouveau bulletin est émis, et rester traçable ; les accès au bulletin retiré sont révoqués dans SCHOOLNET.
- **B — alternative** : conserver la version publiée visible avec une mention de rectification et un lien vers la nouvelle version ; cette option impose d'arbitrer précisément la confidentialité et les effets du retrait.
- **Invariants** : ne jamais modifier silencieusement un document publié ni effacer son historique. Une copie PDF déjà téléchargée ne peut pas être physiquement effacée du matériel du destinataire : prévoir la mention d'obsolescence et le suivi de version.
- **Décision produit** : option A validée le 27 novembre 2026 ; retrait et réexamen réels non implémentés.

### D7 — Qui peut consulter un bulletin officiel ? `family_access`

- **A — recommandation** : **après publication effective seulement**, l'élève authentifié consulte uniquement son propre bulletin ; un parent/tuteur authentifié consulte uniquement les bulletins publiés des enfants dont le **lien actif** est vérifié côté serveur. Un retrait bloque le nouvel accès par SCHOOLNET et les consultations doivent être journalisées de manière proportionnée.
- **B — alternative** : autoriser une diffusion différée, par année ou classe, avec une fenêtre de publication fixée par l'établissement ; les contrôles de filiation restent identiques.
- **Invariants** : aucune diffusion anticipée, aucun accès d'un parent aux enfants non liés, aucune fuite entre établissements ou familles ; prévoir les cas de changement de tutelle.
- **Décision produit** : option A validée le 27 novembre 2026 ; accès famille réel non ouvert.

## 3. Règles de plateforme non négociables à conserver

Ces garde-fous sont **retenus comme exigences minimales de conception produit**, mais ne sont ni un contrat serveur déployé ni une permission actuellement activée.

1. Vérifications serveur de l'identité, de l'établissement et des affiliations actives sur **chaque** transition.
2. Aucun demandeur ne peut décider lui-même de sa soumission.
3. Les décisions portent sur des versions immuables et deviennent inapplicables à une version modifiée.
4. Un statut « précontrôle pédagogique complet » ne constitue jamais une approbation.
5. Aucun document public ni accès familial avant `publication_executed` explicitement tracé.
6. Journal de décisions append-only : auteur, rôle, portée, version, motif, temps serveur et identifiant d'événement.
7. Transactions atomiques, contrôle de concurrence, anti-doublon et test de cloisonnement entre établissements.

## 4. Registre de décision — adoption produit du 27 novembre 2026

**Décision de l'utilisateur : « Oui, je valide »**, en réponse à la question : « Est-ce que tu valides les sept recommandations A comme politique de référence à développer pour SCHOOLNET, ou souhaites-tu modifier certaines décisions ? »

| Décision | Option retenue | Statut |
|---|---|---|
| D1 — Demandeur | **A** : administrateur d'établissement explicitement habilité | Produit validé |
| D2 — Approbateur | **A** : responsable mandaté, distinct du demandeur | Produit validé |
| D3 — Publication | **A** : droit de diffusion séparé ; cumul possible avec approbation seulement après habilitation distincte | Produit validé |
| D4 — Délégations | **A** : désignation nominative sur mandat, limitée, traçable et révocable | Produit validé |
| D5 — Mentions | **A** : socle scolaire et exigences par établissement/cycle, sous réserve des règles applicables | Produit validé |
| D6 — Corrections | **A** : nouvelle version, réexamen obligatoire, retrait traçable | Produit validé |
| D7 — Familles | **A** : consultation après publication effective et contrôle de filiation | Produit validé |

**Total : 7/7 décisions de conception produit adoptées ; aucune clause déployée au sein d'un établissement.**

Cette adoption ne signifie **ni un mandat signé par chaque établissement**, ni une autorisation de migration SQL sur Supabase principal, ni l'attribution d'habilitations, ni une décision sur un bulletin individuel, ni une permission de fusionner `main` ou de déployer Vercel. Les paramètres d'établissement, les obligations officielles applicables et les détails opérationnels restent à valider séparément.

## 5. Portes avant le futur développement effectif

- [x] Décisions D1 à D7 arbitrées et inscrites **comme référence produit adoptée** dans ce registre ; aucune activation en établissement.
- [ ] Vérification des règles officielles applicables aux bulletins de chaque cycle visé et validation par les établissements pilotes.
- [ ] Définition d'un gestionnaire initial des délégations et du régime d'exception pour un établissement ne disposant que d'un seul compte administratif.
- [ ] Contrat serveur validé pour les transitions, y compris refus/reprise de correction, approbation, autorisation, exécution, retrait et versions obsolètes.
- [ ] Conception des habilitations et des politiques RLS, journaux immuables, tests anti-IDOR, anti-replay et de concurrence sur environnement jetable.
- [ ] Autorisation séparée pour toute migration Supabase principal, fusion dans `main`, publication réelle ou déploiement Vercel.

## 6. État de livraison S4-D.3i

**Sous-lot de décision métier, sans nouveau composant UI ni changement de calcul de notes.** Référence produit validée et enregistrée dans la PR brouillon empilée sur S4-D.3h ; Preview Vercel désactivé. Aucune nécessité de reprendre les recettes Windows des sous-lots précédents.

**État final : 7/7 décisions de conception adoptées au niveau produit ; zéro habilitation réelle, zéro activation de politique par établissement, aucune migration ni publication.**
