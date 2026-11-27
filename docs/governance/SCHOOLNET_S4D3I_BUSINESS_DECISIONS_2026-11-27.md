# SCHOOLNET V2 — S4-D.3i · Dossier d'arbitrage des 7 règles métier des bulletins

**Établi le : 27 novembre 2026**  
**Statut : SOUMIS À DÉCISION — 0/7 clause adoptée**  
**Version : proposition A pour discussion, aucune approbation utilisateur ni établissement enregistrée**  
**Base documentaire technique : S4-D.3f / S4-D.3g / S4-D.3h, PR #67 / #68 / #69**

## 1. Objet, portée et distinction des niveaux de validation

Ce dossier vise à obtenir **sept décisions métier explicites** avant de concevoir le serveur d'approbation ou la publication de bulletins. Il ne constitue pas en lui-même un règlement scolaire adopté et n'autorise aucune action réelle.

Il faut distinguer :
- **Arbitrage produit SCHOOLNET** : adopter ou amender des principes et capacités minimales de la plateforme.
- **Désignation par chaque établissement** : nommer les responsables et confirmer ses exigences de bulletin, sans déroger aux protections globales.
- **Activation technique** : créer ultérieurement les habilitations, le journal, les snapshots, les RPC et leurs recettes de sécurité. Cette étape nécessite un nouveau GO explicite, distinct de l'accord sur les principes.

SCHOOLNET possède actuellement les rôles applicatifs `admin`, `school_admin`, `teacher`, `student`, `parent`. **Aucun rôle nouveau, aucun droit d'approbation ou publication n'est introduit par ce document.** Un « directeur » ou « responsable de diffusion » désigne une **fonction métier**, pas un rôle applicatif déjà présent.

Le système de prévisualisation et de calcul V2 déjà développé reste strictement privé, non publiable. Une note publiée de `0,00 / 20` est valide ; une note manquante reste `NULL` et ne devient jamais zéro.

## 2. Arbitrages métier : recommandations formelles à confirmer

Chaque décision comporte une **recommandation A (proposée)**, une **alternative B** et une **condition commune non négociable de sécurité**. Le choix reste à faire par le propriétaire métier ; rien n'est présumé accepté.

### D1 — Qui soumet le bulletin à examen ? `requester`

- **A — recommandation** : un utilisateur `school_admin` **explicitement habilité** à la soumission pour son établissement, l'année/la classe/la période concernées, soumet une **version figée** d'un bulletin pédagogiquement complet. Les enseignants restent responsables des résultats relevant de leurs affectations, mais ne soumettent pas de bulletin administratif dans le MVP.
- **B — alternative** : autoriser aussi un enseignant responsable, à condition de définir une habilitation supplémentaire limitée, sans accès global aux bulletins des autres classes.
- **Invariants** : vérifier affiliation active, périmètre, complétude et permission serveur ; rejeter les tentatives hors établissement et les demandes sur des données non approuvées.
- **Statut** : à arbitrer.

### D2 — Qui approuve, refuse ou renvoie en correction ? `approver`

- **A — recommandation** : un **responsable de l'établissement mandaté**, titulaire d'un compte propre (rôle technique existant `school_admin` + habilitation d'approbation **distincte**), prononce une décision motivée. **L'identifiant du décideur doit être différent de celui du demandeur.**
- **B — alternative** : imposer un second niveau d'examen après la décision initiale, pour certains cycles ou établissements.
- **Invariants** : pas d'auto-approbation, pas d'autorisation implicite via le rôle `admin` de plateforme, décision attachée à une version inchangée ; si aucun deuxième acteur n'est désigné, le bulletin **reste non publiable** tant qu'une procédure de délégation fiable n'est pas adoptée.
- **Statut** : à arbitrer.

### D3 — Qui autorise et exécute la publication / le retrait ? `publisher`

- **A — recommandation** : un `school_admin` expressément titulaire d'une permission de diffusion peut **autoriser puis déclencher la publication** en deux actions explicites et tracées. **La même personne que l'approbateur peut être habilitée à diffuser**, mais jamais par déduction automatique de son droit d'approbation. Le demandeur initial ne peut pas contourner l'étape de décision.
- **B — alternative** : exiger **trois personnes distinctes** pour demande, approbation et publication, quel que soit l'établissement.
- **Invariants** : `approval_granted` ≠ `publication_authorized` ≠ `publication_executed` ; aucune mise en ligne sur simple clic « approuver ». La révocation d'une publication exige une permission distincte et un motif.
- **Point de décision prioritaire** : séparation **des permissions** (toujours) vs séparation **des personnes** entre approbation et diffusion (A ou B).
- **Statut** : à arbitrer.

### D4 — Comment attribuer, limiter et retirer les habilitations ? `delegations`

- **A — recommandation** : désignation nominative par la **direction reconnue de l'établissement**, avec preuve de mandat ; l'administration technique SCHOOLNET peut exécuter une **initialisation vérifiée** sans obtenir elle-même un pouvoir pédagogique. Les habilitations sont limitées à l'établissement, à une action, à une portée scolaire, à une période de validité, et peuvent être révoquées immédiatement. Toute délégation ou révocation génère une trace serveur.
- **B — alternative** : délégation uniquement par un gestionnaire d'établissement déjà habilité à gérer les mandats, après mise en place sécurisée de ce droit. Il faut alors définir séparément qui crée le tout premier gestionnaire.
- **Invariants** : aucune auto-délégation, aucune délégation à un compte non affilié, aucune permission inter-établissements, pas d'élévation par modification des métadonnées du navigateur.
- **Statut** : à arbitrer ; protocole de preuve d'autorité initiale encore à préciser.

### D5 — Quelles mentions sont requises avant publication ? `supplementary_data`

- **A — recommandation** : socle fonctionnel **proposé** : élève, établissement, année, classe, période, matières attendues, coefficients approuvés, résultats disponibles, complétude et moyenne générale calculable. Pour **rang, absences, appréciations, signatures**, appliquer une **politique explicite par établissement et cycle** après vérification des obligations applicables ; aucune valeur absente ne peut être inventée. Si un champ est déclaré obligatoire mais non alimenté par une source autorisée, **bloquer la publication**.
- **B — alternative** : adopter un modèle unique de bulletin avec des mentions imposées à tous les établissements, uniquement après preuve des exigences et de la couverture de tous les cycles.
- **Invariants** : ne pas décréter ici une obligation nationale non vérifiée ; l'absence de configuration valide de politique de mentions bloque l'émission réelle, même si la moyenne est calculable.
- **Statut** : à arbitrer ; vérification institutionnelle avant activation.

### D6 — Que faire après une correction ou un retrait ? `withdrawal`

- **A — recommandation** : les décisions concernent un **instantané immuable**. Toute correction de notes, coefficients, matière ou périmètre créé une **nouvelle version** et exige un nouvel examen. Une version publiée doit pouvoir être **retirée avec motif**, être désignée comme remplacée si un nouveau bulletin est émis, et rester traçable ; les accès au bulletin retiré sont révoqués dans SCHOOLNET.
- **B — alternative** : conserver la version publiée visible avec une mention de rectification et un lien vers la nouvelle version ; cette option impose d'arbitrer précisément la confidentialité et les effets du retrait.
- **Invariants** : ne jamais modifier silencieusement un document publié ni effacer son historique. Une copie PDF déjà téléchargée ne peut pas être physiquement effacée du matériel du destinataire : prévoir la mention d'obsolescence et le suivi de version.
- **Statut** : à arbitrer.

### D7 — Qui peut consulter un bulletin officiel ? `family_access`

- **A — recommandation** : **après publication effective seulement**, l'élève authentifié consulte uniquement son propre bulletin ; un parent/tuteur authentifié consulte uniquement les bulletins publiés des enfants dont le **lien actif** est vérifié côté serveur. Un retrait bloque le nouvel accès par SCHOOLNET et les consultations doivent être journalisées de manière proportionnée.
- **B — alternative** : autoriser une diffusion différée, par année ou classe, avec une fenêtre de publication fixée par l'établissement ; les contrôles de filiation restent identiques.
- **Invariants** : aucune diffusion anticipée, aucun accès d'un parent aux enfants non liés, aucune fuite entre établissements ou familles ; prévoir les cas de changement de tutelle.
- **Statut** : à arbitrer.

## 3. Règles de plateforme non négociables à conserver

Ces garde-fous sont **recommandés comme conditions minimales de conception**, mais ne sont ni un contrat de service installé ni une permission actuellement activée.

1. Vérifications serveur de l'identité, de l'établissement et des affiliations actives sur **chaque** transition.
2. Aucun demandeur ne peut décider lui-même de sa soumission.
3. Les décisions portent sur des versions immuables et deviennent inapplicables à une version modifiée.
4. Un statut « précontrôle pédagogique complet » ne constitue jamais une approbation.
5. Aucun document public ni accès familial avant `publication_executed` explicitement tracé.
6. Journal de décisions append-only : auteur, rôle, portée, version, motif, temps serveur et identifiant d'événement.
7. Transactions atomiques, contrôle de concurrence, anti-doublon et test de cloisonnement entre établissements.

## 4. Décisions à rendre et protocole d'adoption

**Choix proposé pour une première version du produit :** `D1=A, D2=A, D3=A, D4=A, D5=A, D6=A, D7=A`.

Cette ligne est **une proposition**, jamais un accord tacite. Pour décider, le propriétaire du projet peut répondre :
- **« Je valide les 7 propositions A comme politique produit de référence »** ; ou
- **« Je valide D1=A, D2=A, D3=B … »** en précisant les alternatives ou aménagements.

L'adoption produit, une fois explicitement confirmée, constituera une **décision de conception** et non un ordre d'activer immédiatement le système sur des établissements réels. Elle ne vaut pas autorisation de modifier Supabase principal ou de déployer des bulletins publiés. La désignation des responsables et l'approbation des mentions par chaque établissement resteront nécessaires.

## 5. Portes avant le futur développement effectif

- [ ] Décisions D1 à D7 explicitement arbitrées et inscrites comme adoptées dans une nouvelle version du registre de gouvernance.
- [ ] Vérification des règles officielles applicables aux bulletins de chaque cycle visé et validation par les établissements pilotes.
- [ ] Définition d'un gestionnaire initial des délégations et du régime d'exception pour un établissement ne disposant que d'un seul compte administratif.
- [ ] Contrat serveur validé pour les transitions, y compris refus/reprise de correction, approbation, autorisation, exécution, retrait et versions obsolètes.
- [ ] Conception des habilitations et des politiques RLS, journaux immuables, tests anti-IDOR, anti-replay et de concurrence sur environnement jetable.
- [ ] Autorisation séparée pour toute migration Supabase principal, fusion dans `main`, publication réelle ou déploiement Vercel.

## 6. État de livraison S4-D.3i

**Sous-lot de décision métier, sans nouveau composant UI ni changement de calcul de notes.** Documentation proposée dans une PR brouillon empilée sur la PR S4-D.3h ; Preview Vercel explicitement désactivé. Pas de nécessité de refaire les recettes fonctionnelles Windows des S4-D.3a à S4-D.3h : le contrôle attendu est une **validation des choix métier**, pas une nouvelle capture de navigateur.

**État final du document : 7 décisions ouvertes / 0 approuvée / aucun droit ni publication activés.**
