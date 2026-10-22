# LotisPro — Roadmap de reprise (design)

**Date :** 2026-10-22
**Auteur :** kocay (avec Claude)
**Statut :** brouillon — en attente de validation

---

## 1. Intention

Le projet `lot_webapp` (LotisPro) n'a pas été touché depuis ~3 mois. Les tickets Asana du projet
`lot_webapp` ne reflètent plus l'état réel du code : certains sont faits mais non cochés, d'autres
à moitié faits, d'autres jamais commencés. Le client n'exprime pas de priorité.

Ce document :

1. établit l'état réel de chaque ticket après audit du code (§3) ;
2. définit ce qui reste réellement à développer, découpé en **epics** livrables indépendamment (§5) ;
3. fixe le mode de travail : niveau d'exigence senior, suivi GitHub Project + `AVANCEMENT.md` (§6).

Il sert d'entrée au plan de roadmap (superpowers:writing-plans) et aux specs détaillées par epic.

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Livrer tous les tickets Asana encore ouverts, plus les deux sujets de la « consolidation » sans
  ticket : **états des lieux** et **statuts activables par projet**.
- Remettre le code à un niveau maintenable : lint propre, tests réels, CI, découpage des fichiers
  géants quand on les touche.
- Avoir une source de vérité unique de l'avancement (GitHub Project), reflétée dans `AVANCEMENT.md`.

**Non-objectifs**
- Réécrire l'application ou changer de stack.
- Atteindre 80 % de couverture sur le code legacy non touché.
- Notifications temps réel (websockets) : un rafraîchissement après action suffit.

**Anti-objectifs** (échec même si « ça marche »)
- Un ticket marqué *Terminé* sans tests automatisés qui passent ni vérification dans l'app.
- Casser le workflow de statuts existant (déjà utilisé) en ajoutant les états des lieux / statuts par projet.
- Une migration Alembic qui perd ou corrompt des données clients/lots existantes.
- Un refactor « big bang » des gros fichiers sans lien avec un ticket.

## 3. Audit — état réel des tickets (2026-10-22)

| Ticket Asana | État réel | Preuve dans le code |
|---|---|---|
| 🗂️ Workflow des statuts d'un lot (9 statuts) | ✅ Fait | `lot_transitions.py` (16 routes), contrainte `valid_lot_status`, PR #7 mergée 2026-10-07 |
| 🔒 [STATUT] Bloqué | ✅ Fait | `blocked_reason` (migr. 0016), déblocage réservé aux managers (`8068163`) |
| En attente du code couleur | ✅ Fait | `frontend/src/utils/constants.js` (couleurs par statut) |
| Consolidation §6 — prix au m² dans les métadonnées | ✅ Fait | `price_per_sqm`, `price_per_sqm_acte` (migr. 0005, 0014) |
| En attente documents dev appartements | ❓ Externe | Dépend du client — non vérifiable dans le code |
| 🐛 #5 Métadonnées en plein écran | 🟡 50 % | Fix 1 (toasts) commité `5b4a4bb` ; Fix 2 (débordement panneau) **non fait** — hauteur figée `ProjectDetailPage.jsx:1121` |
| 🔄 #8 Processus de réservation | 🟡 ~60 % | 3 choix + garantie + type paiement OK ; acte PDF à la demande (`/certificate`) mais **pas auto** ; **pas de rappel** d'expiration d'option ; **aucun choix de canal** de notification |
| 📊 #3 Vue projet par type × statuts | 🟡 ~20 % | `dashboard_service` agrège par `type_lot` mais en 4 catégories (vendu/réservé/dispo/en cours), pas 9 statuts ; pas de grille cliquable |
| 📅 #4 Dashboard par période | ❌ 0 % | Seulement `period=month` ; pas de date début/fin ; pas d'export |
| 👤 #7 Fiche client | ❌ ~10 % | Seulement `name, phone, email, cin, address, client_type, notes` |
| Notifications SMS / WhatsApp / Mail | ❌ Email seul | Resend (`email_service.py`) ; aucun SMS/WhatsApp |
| États des lieux (consolidation 7-9) | ❌ 0 % | Aucun statut ni table |
| Statuts activables par projet | ❌ 0 % | Pipeline codé en dur dans `reservation_service.py` |

**Dette technique constatée**
- Tests : 2 fichiers seulement (`test_auth.py`, `test_security.py`) alors que `CLAUDE.md` exige 80 %.
- Ruff : 280 erreurs dont **1 `F821` (nom non défini → crash runtime : `UploadFile` dans `project_service.py`)**, 3 variables inutilisées, 17 `raise` sans `from`.
- ESLint : 50 problèmes (28 erreurs, 22 warnings).
- Fichiers géants : `ProjectDetailPage.jsx` 3 078 l., `LotDetailModal.jsx` 2 725 l., `project_service.py` 1 991 l., `Dashboard.jsx` 1 964 l., `dashboard_service.py` 1 378 l., `reservation_service.py` 1 273 l.
- Aucune CI (`.github/` absent).
- Pas de planificateur de tâches : `check_expirations` est un vestige sans effet ; les alertes sont calculées à la lecture.
- `CLAUDE.md` obsolète (annonce migrations 0001→0010, on est à 0016).
- **Branches divergentes** : `main` ne contient que la migration `0001` ; tout le workflow de statuts
  (0004→0016) n'existe que sur `dev` (11 commits). `main` a 9 commits absents de `dev` (assistant IA
  `PromptLibrary`, correctifs SSL / PgBouncer pour la base de prod).
- Le pré-déploiement Railway exécute `alembic upgrade head || alembic stamp 0001` : un échec de
  migration est **masqué**.
- L'API tourne sous gunicorn `--workers 2` : tout job planifié en process s'exécuterait deux fois.
- Aucun historique des changements de statut des lots (la table d'audit existe mais les transitions
  n'y écrivent pas).

## 4. Contraintes

- Stack inchangée : FastAPI + SQLAlchemy async + Alembic (chaîne linéaire, tête actuelle `0016`) ;
  React 19 + Vite + Leaflet ; Supabase (Postgres + storage) ; déploiement Railway ; emails Resend ;
  PDF fpdf2.
- Architecture existante respectée : Endpoint → Service → Repository → Model ; schémas Pydantic.
- UI en français ; rôles manager > commercial > client.
- Branche d'intégration `dev`, production `main`.
- Les données de production existantes doivent migrer sans perte (chaque migration a un `downgrade`).

## 5. Epics à développer

Ordre choisi par Claude (le client n'a pas de priorité) : les fondations d'abord parce que rien ne
peut être vérifié sans tests ; la fiche client avant la réservation parce que l'acte et les
notifications consomment ses champs ; le moteur de statuts avant la vue projet parce que la grille
affiche les statuts activés.

### E0 — Fondations & nettoyage
- **Réconcilier `main` et `dev`** (premier travail) :
  - ramener dans `dev` tous les commits de `main` **sauf** ceux de l'assistant IA (ex. `cc995e5`
    `PromptLibrary`) ; les correctifs SSL / PgBouncer déjà présents sous une autre forme dans `dev`
    sont comparés et non dupliqués ;
  - l'assistant IA reste isolé dans la branche `feature/ai_assistant` (décision utilisateur) ;
  - retirer le `|| alembic stamp 0001` qui masque les échecs de migration.
- **Base de prod** : elle ne contient que des **données de test** et personne n'utilise l'app en
  ligne (décision utilisateur). Au premier déploiement `dev → main`, la base de prod peut être
  réinitialisée puis migrée jusqu'à la tête ; pas de reprise de données à garantir. Les migrations
  restent testées en `upgrade` et `downgrade`.
- **Tests backend** : `conftest.py` avec base SQLite async en mémoire, client HTTP authentifié par
  rôle, fabriques (projet, lot, client, réservation). Tests de caractérisation du workflow de statuts
  existant (chaque transition autorisée + refus des transitions interdites) **avant** tout changement.
- **Tests frontend** : Vitest + React Testing Library, 1 test de fumée par page clé.
- **CI GitHub Actions** sur PR vers `dev`/`main` : ruff, pytest, eslint, vitest, `npm run build`.
- **Lint** : corriger le `F821` en premier ; `ruff --fix` sûr ; corriger à la main `B904`, `F841`,
  `ERA001` ; ESLint à 0 erreur. Les `PLR0912/0915` (fonctions trop longues) sont traités quand le
  fichier est touché par un epic.
- **Docs** : mettre `CLAUDE.md` à jour.
- *Critère de fin* : CI verte, 0 erreur ruff/eslint, workflow de statuts couvert par des tests.

### E1 — 🐛 #5 Plein écran (fin)
- Exécuter la tâche 2 du plan existant `docs/superpowers/plans/2026-07-04-fullscreen-metadata-edit-fix.md`
  (carte flexible, sélecteur CSS corrigé, scroll de secours, `invalidateSize`) puis sa tâche 3.
- *Critère de fin* : critères d'acceptance du ticket Asana + spec du 2026-07-04 cochés, testé Chrome/Firefox/Edge.

### E2 — 👤 #7 Fiche client
- Champs, dans l'ordre : Nom*, Nom de jeune fille, Prénom*, CIN, Téléphone*, WhatsApp (pré-rempli
  depuis Téléphone), Email, Adresse Maroc, Adresse étranger, choix de l'adresse utilisée pour les
  actes (obligatoire si les deux adresses sont remplies).
- Canal d'acquisition* : SMAP / Bureau de vente / Réseaux sociaux / Recommandé par (Qui ?) /
  Samsar (Qui ? Quand ?), champs conditionnels.
- Préférences de notification du client (Email / SMS / WhatsApp, multi) — utilisées par E4.
- Validation : formats CIN, téléphone (international), email ; détection de doublons par CIN et
  email (alerte, pas blocage — *choix de Claude*) ; message d'erreur par champ ; toast de succès.
- **Migration des clients existants** (*choix de Claude*) : `name` actuel → `last_name` ; `first_name`
  laissé vide ; `name` conservé comme nom affiché calculé (« Prénom Nom ») pour ne pas casser les
  écrans et PDF existants ; `address` → `address_morocco`. Le canal reste nullable en base ; il est
  obligatoire dans le formulaire (création et édition).
- `client_type` existant (propriétaire/revendeur/investisseur/autre) est conservé.

### E3 — Moteur de statuts : statuts par projet + états des lieux
**Pipeline complet (12 statuts)**, dans l'ordre :
`creation → available → option → reservation_a_finaliser → reservation_engagee → reservation_soldee →
edl_programme → edl_realise → edl_finalise → chez_notaire → chez_proprietaire` ; `blocked` est latéral.

**Statuts activables par projet**
- Le manager choisit les statuts actifs dans les paramètres du projet (cases à cocher).
- **Obligatoires, non décochables** (décision utilisateur : tout lot passe par soldée et notaire) :
  `creation`, `available`, `reservation_engagee`, `reservation_soldee`, `chez_notaire`,
  `chez_proprietaire`, `blocked`.
- **Optionnels** : `option`, `reservation_a_finaliser`, et le bloc **états des lieux**
  (`edl_programme`, `edl_realise`, `edl_finalise` activés/désactivés ensemble — *choix de Claude*,
  ils n'ont pas de sens séparément).
- **Transitions strictes inchangées** (décision utilisateur) : on garde exactement les transitions
  actuelles, chacune avec ses données et effets (garantie, acompte + échéancier, notaire…). Un
  statut désactivé masque simplement les actions qui y mènent ; le backend refuse toute transition
  vers un statut désactivé. Les raccourcis existants couvrent déjà les cas :
  - `option` désactivé → `available → reservation_a_finaliser` / `available → reservation_engagee` (existants) ;
  - `reservation_a_finaliser` désactivé → `available → reservation_engagee` (existant) ;
  - **seul ajout** : `option → reservation_engagee`, nécessaire uniquement quand `option` est actif
    et `reservation_a_finaliser` désactivé (*choix de Claude*, mêmes données et effets que
    `finaliser_engage`) ;
  - EDL actif → `reservation_soldee → edl_programme → edl_realise → edl_finalise → chez_notaire` ;
    EDL désactivé → `reservation_soldee → chez_notaire` (existant).
- Les règles d'autorisation sont centralisées dans un module de domaine (table explicite des
  transitions + statuts actifs du projet), appelé par chaque méthode de transition existante ; le
  frontend lit les statuts actifs du projet et n'affiche que les actions possibles.
- Désactiver un statut sur lequel des lots se trouvent actuellement est **refusé** avec un message
  listant les lots concernés (*choix de Claude*).
- Valeur par défaut des projets existants : tous les statuts actuels activés, **états des lieux
  désactivés** → aucun changement de comportement après migration.

**Historique des statuts** (*choix de Claude*, requis par E6)
- Nouvelle table `lot_status_history` (lot, ancien statut, nouveau statut, utilisateur, date),
  écrite par **chaque** transition via le module de domaine. L'historique commence au déploiement d'E3.

**États des lieux**
- `edl_programme` : date, heure, intervenant (texte libre), note.
- `edl_realise` : date de réalisation, note, liste d'**actions** (description, responsable, statut
  ouverte/faite) — *interprétation de Claude* de « réalisés avec actions » = réserves à lever.
- `edl_finalise` : possible seulement quand toutes les actions sont faites.
- Nouvelles tables `etats_des_lieux` et `edl_actions` liées à la réservation ; historique visible
  dans `LotDetailModal`.
- Couleurs des 3 nouveaux statuts : teintes intermédiaires entre bleu clair (soldée) et bleu foncé
  (notaire) — *choix de Claude*.

### E4 — 🔄 #8 Réservation : compléments
- **Acte auto** : au passage en `reservation_engagee`, l'acte PDF (service `certificate_service`
  existant) est généré et **enregistré comme document du lot** (service `document_service` existant),
  consultable depuis la fiche lot et la fiche client. L'adresse utilisée est celle choisie en E2.
- **Rappels d'expiration** : job quotidien (*choix de Claude* : APScheduler dans le process API,
  protégé par un verrou Postgres `pg_try_advisory_lock` pour ne s'exécuter qu'une fois malgré les
  2 workers gunicorn, et idempotent via la table `notifications`) qui notifie le commercial (et le client selon ses préférences) X jours
  avant expiration d'une option ou de la date limite « à finaliser ». X configurable (défaut 2 j).
- **Notifications client** : après chaque étape (option, à finaliser, engagée + lien acte), écran de
  choix des canaux pré-coché depuis la fiche client ; envoi immédiat ; contenu : n° de lot, montant,
  date limite, coordonnées du commercial. Historique dans une table `notifications`, visible sur la
  fiche lot et la fiche client.
- **Canaux** : interface `NotificationChannel` ; **Email** livré (Resend). **SMS et WhatsApp** :
  implémentation conditionnée au choix d'un fournisseur (voir §7) ; d'ici là les cases sont visibles
  mais désactivées avec « bientôt disponible ».
- *Hors périmètre* : envoi planifié manuel (« envoyer plus tard ») — le rappel automatique couvre le besoin.

### E5 — 📊 #3 Vue projet : grille type × statut
- Nouvel onglet « Lots » dans `ProjectDetailPage` : grille lignes = `type_lot` (dynamiques),
  colonnes = statuts **actifs du projet** (E3), cellules colorées avec compteur, totaux ligne/colonne.
- Clic sur cellule → liste filtrée ; clic sur lot → `LotDetailModal` existant ; retour sans perte
  de filtre.
- Filtres : statut (multi), type, recherche par numéro ; bouton Réinitialiser ; badge nombre de
  filtres ; conservés pendant la session (`sessionStorage`).
- Endpoint backend dédié qui compte par (type_lot, statut) — ne pas étendre `CategoryStats`.
- « Temps réel » = rafraîchi après chaque transition faite dans l'app (*choix de Claude*).
- L'onglet est extrait dans son propre fichier (début du découpage de `ProjectDetailPage.jsx`).

### E6 — 📅 #4 Tableau de bord par période
- Sélecteur date début / date fin + raccourcis (Aujourd'hui, Semaine, Mois, Trimestre, Année),
  période affichée en permanence, conservée pendant la session.
- Backend : paramètres `date_from` / `date_to` sur les endpoints du dashboard projet.
- **Deux familles de KPIs** (*choix de Claude*) : KPIs de **flux** filtrés par période (lots vendus,
  CA, réservations créées, taux de conversion) avec variation vs période précédente de même durée ;
  KPIs d'**état** (lots disponibles, en option) = photo à la date de fin.
- **Définitions** (*choix de Claude*, cohérentes avec le dashboard actuel) : une « vente » est datée
  à l'engagement (`reservation_engagee`) ; le CA = prix de vente des lots engagés dans la période. Les
  KPIs de flux se calculent à partir des dates déjà stockées (réservation, engagement, `closed_at`),
  donc valables aussi pour le passé. Les KPIs d'état à une date passée utilisent
  `lot_status_history` (E3) ; avant le déploiement d'E3, seule la photo actuelle est disponible et
  l'écran l'indique.
- Graphiques recalculés ; skeleton pendant le chargement.
- Export Excel (`openpyxl`, nouvelle dépendance) des données affichées, nom
  `dashboard_<projet>_<date_from>_<date_to>.xlsx`.
- `Dashboard.jsx` découpé en sous-composants à cette occasion.

### E7 — Notifications SMS / WhatsApp
- Implémentation des canaux SMS et WhatsApp derrière l'interface E4, une fois le fournisseur choisi.

## 6. Mode de travail

**Niveau senior — définition de « Terminé » pour chaque tâche**
1. Test écrit avant le code (superpowers:test-driven-development), il échoue puis passe.
2. ruff + eslint propres sur les fichiers touchés ; CI verte.
3. Revue de code avant merge (code-review / pr-review-toolkit) ; les remarques sont traitées ou
   justifiées.
4. Vérification dans l'application lancée (superpowers:verification-before-completion) contre les
   critères d'acceptance du ticket.
5. Migration testée en `upgrade` **et** `downgrade` sur une copie des données.

**Branches** : une branche par epic `feature/eN-<slug>` depuis `dev`, une PR par epic (ou par tâche
si l'epic est gros), merge dans `dev` ; `dev → main` à la fin de chaque epic validé.

**Suivi**
- **GitHub Project** « LotisPro — Roadmap » (owner `migok`, lié au repo `migok/lotispro`) :
  - 1 issue par epic (label `epic`), 1 sous-issue par tâche du plan ;
  - labels : `epic`, `bug`, `feature`, `chore`, `tech-debt`, `E0`…`E7` ;
  - colonnes Status : *À faire / En cours / En revue / Terminé* ;
  - chaque issue référence le ticket Asana d'origine (lien).
- **`docs/AVANCEMENT.md`** dans le repo : tableau epic → tâche → statut → issue → PR → date. Mis à
  jour dans le même commit que la tâche ; le GitHub Project fait foi en cas d'écart.
- **Asana** : les tickets confirmés terminés par l'audit (§3) peuvent être cochés ; les autres
  pointent vers leur issue GitHub. (Sur validation de l'utilisateur.)

**Livrables de cette phase de cadrage**
1. Ce design.
2. Le plan de roadmap (`docs/superpowers/plans/2026-10-22-roadmap-lotispro.md`) : epics → tâches.
3. Une spec par epic (`docs/superpowers/specs/epics/EN-<slug>.md`) avec critères d'acceptance
   testables ; le plan d'implémentation détaillé de chaque epic est écrit au démarrage de l'epic.
4. `docs/AVANCEMENT.md` initialisé.
5. Le GitHub Project et ses issues.

## 7. Laissé au builder / questions ouvertes

**Laissé au builder** : noms exacts des colonnes et tables, découpage interne des composants,
bibliothèque de date-picker, format exact des fabriques de tests.

**Décisions de l'utilisateur (2026-10-22)**
- Pas de priorité client → ordre fixé par Claude (§5).
- États des lieux et statuts par projet inclus dans la roadmap.
- Nettoyage du code inclus ; niveau d'exigence senior, tout est revu et vérifié.
- Suivi dans un GitHub Project avec découpage par ticket + `AVANCEMENT.md`.
- Prod = données de test uniquement.
- Assistant IA conservé dans sa branche, hors `dev`.
- Tout lot passe par soldée et chez notaire ; transitions strictes inchangées.

**Reste ouvert (n'empêche pas de démarrer)** : choix du fournisseur SMS / WhatsApp (bloque E7 seulement).
