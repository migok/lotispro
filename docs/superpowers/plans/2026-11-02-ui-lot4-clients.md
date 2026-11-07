# Lot 4 — Portefeuille et fiche client

Autorisé par l’utilisateur le 2026-11-02. Branche `feature/ui-clients`, créée depuis `origin/dev` après les merges #58–#60. Audit UX/UI : problème 10. Les choix des lots précédents restent applicables (tokens LotisPro, Tailwind v4, primitives shadcn/Radix, français).

## Périmètre

- [ ] Remplacer les cartes et le classement redondant par un tableau dense, triable et paginé : nom/type, pipeline, téléphone, réservations, achats, acomptes et total des achats ; lien natif vers la fiche.
- [ ] Recherche existante nom/téléphone/CIN, filtres type et pipeline combinables, réinitialisation, pagination remise au début après filtrage.
- [ ] Pipeline empilé cliquable et légende filtrante. Les comptes reflètent la recherche et le type avant le filtre pipeline ; chaque compte correspond aux lignes ouvertes, toutes pages confondues.
- [ ] Aperçu latéral accessible depuis une ligne, contacts cliquables, montants exacts et lien vers la fiche ; Échap et retour du focus.
- [ ] Chargement et échec explicites, bouton Réessayer, aucun faux zéro en cas d’erreur ; états vide et aucun résultat distincts.
- [ ] Création via Dialog et formulaire existant, mêmes API et validations. Filtres dans l’URL, conservés au retour depuis une fiche.
- [ ] Fiche client : actions et indicateurs partagés, informations accessibles avant l’historique, édition accessible depuis toutes les sections, historique commercial complet consultable. Ne pas afficher un statut « actif » absent des données.
- [ ] Tests en échec avant la logique, puis contrôles ciblés, lint, suite complète et build avant commit ; PR en brouillon vers dev.
- [ ] Recette 375/768/1440 px, clair/sombre, ou explication précise de tout blocage ; mise à jour de l’avancement et rapport.

## Contrats et limites

Lecture du portefeuille : `/api/dashboard/clients-pipeline`. Détail et édition : endpoints clients existants ; création : `/api/clients`. Aucun nouveau champ, endpoint ou paramètre serveur. L’API actuelle renvoie tout le portefeuille : le tri, la pagination et le filtrage sont locaux. Cela limite les lignes rendues mais pas le volume téléchargé.

Les indicateurs du portefeuille reprennent les sommes existantes de `active_reservations`, `total_deposit` et `total_purchases` sur l’ensemble chargé. Aucun changement des calculs financiers, des permissions, des règles de profil, des documents, des paiements ou des notifications. Le lot 5 n’est pas commencé.

## Fixture de référence

Quatre clients : 1 acheteur (propriétaire, 2 achats, 1 réservation, 50 000 MAD d’acomptes, 500 000 MAD d’achats), 1 réservation active (investisseur, 0 achat, 2 réservations, 20 000 MAD d’acomptes), 1 prospect (propriétaire, sans activité), 1 lot libéré (autre, sans activité). Attendus hors filtre : 4 clients, 3 réservations, 70 000 MAD d’acomptes, 500 000 MAD d’achats ; pipeline 1/1/1/1. Type propriétaire : 2 clients, acheteur 1 et prospect 1. Cliquer Acheteurs après ce filtre donne exactement le premier client. Un jeu de 16 clients vérifie les pages (15 puis 1), leur tri et leur remise au début après filtrage. Erreur HTTP et réponse invalide ne représentent jamais un portefeuille vide.

## Global Constraints

- Worktree `lot_webapp-ui`, branch `feature/ui-clients` (from `origin/dev` @ 3f9bf58). Never touch `../lot_webapp`, `../lot_webapp-e5`, `../lot_webapp-e6`.
- Specification = the two test files already written (untracked): `frontend/src/components/__tests__/ClientsPage.test.jsx` (Task 1) and `frontend/src/components/__tests__/ClientDetailLayout.test.jsx` (Task 2). They are currently red. Make them pass **without weakening, deleting or rewriting their assertions**. If an assertion looks wrong, stop and report it (NEEDS_CONTEXT) instead of editing it. Commit the test file together with the implementation.
- Frontend only. No new endpoint, field or query parameter; no change to API calls' URLs, financial sums, permissions, documents, payments or notifications. Reuse the existing `ClientForm` (creation and edition) and the existing client endpoints.
- Reuse the primitives in `src/components/ui/` (DataTable, Sheet, Dialog, Amount, InfoTip, EmptyState, LoadingSkeleton, Button, StatTile, Tooltip) and the tokens in `src/styles/tokens.css`. No hard-coded colours in JSX; no new dependency. Extend a primitive only if needed and keep its existing tests green.
- UI text in French, sentence case. Amounts through `formatAmount` / `<Amount>`; dates through `formatDate`.
- Existing tests that cover the old card layout (e.g. `uiMigration.test.jsx`, `ClientDetailPage.test.jsx`) may be updated only where they assert the removed layout (cards, leaderboard); keep every behavioural assertion that still applies.
- Before each commit: `npm run lint` = 0 error, `npm test` green (full suite), `npm run build` OK. Commits in English, conventional, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never amend, never force-push, never push.

## Tasks

### Task 1: Client portfolio page (`ClientsPage.jsx`)

**Files:** modify `frontend/src/components/ClientsPage.jsx` (+ its CSS, prefer a new `frontend/src/styles/clients.css` imported where the other lot CSS files are imported); add `frontend/src/components/__tests__/ClientsPage.test.jsx` (already written). Small helpers may go in `frontend/src/components/clients/` (e.g. `portfolioFilters.js` with pure filter / count functions and their unit tests).

**Behaviour (all asserted by `ClientsPage.test.jsx`):**
- Data: `apiGet('/api/dashboard/clients-pipeline')` for every role. A non-array response is an error. Error → `role="alert"` « Impossible de charger les clients » + « Réessayer » (refetch); no KPI and no empty state while in error.
- KPI strip over the **whole loaded portfolio** (never filtered): « Réservations actives », « Acomptes versés », « Total des achats » exposed as buttons named `<label> : <exact value>` (use `Amount` with `label`; for the count, an equivalent accessible control).
- Filters: searchbox « Rechercher un client » (name, phone, CIN — case-insensitive), select « Type de client », pipeline buttons named `<Pipeline label> : <n> client(s)` with `aria-pressed` and toggle on second click. Pipeline counts = clients matching search + type (before the pipeline filter). Labels: Acheteurs (`buyer`), Réservations actives (`active_reservation`), Prospects (`prospect`), Lots libérés (`past_reservation`). « Réinitialiser les filtres » clears everything.
- Filters live in the URL query (`q`, `type`, `pipeline`) and are read from it on load.
- One table named « Portefeuille clients » (DataTable caption), 15 rows per page, « Page suivante », text « Page X sur Y », pagination back to page 1 whenever filters change. Sortable headers (buttons) including « Réservations » and « Achats ». Columns: name/type, pipeline, phone (`tel:` link), reservations, purchases, deposits, total purchases. Name = native `Link` to `/app/clients/:id` carrying `state={{ portfolioSearch: location.search }}`. No interactive element nested in another.
- Row action button « Aperçu de <name> » opens a Sheet named by the client name: CIN, phone, `mailto:` email, exact amounts (`<Amount compact={false}>`), link « Ouvrir la fiche client ». Escape closes and returns focus to the trigger.
- Remove the « Meilleurs clients » leaderboard and the card list.
- Empty portfolio → heading « Aucun client enregistré » + « Ajouter le premier client » opening Dialog « Créer un client » with the existing `ClientForm`. Filters with no result → heading « Aucun client pour ces critères » + « Réinitialiser les filtres ». The header « Nouveau client » action opens the same dialog.

### Task 2: Client profile layout (`ClientDetailPage.jsx`)

**Files:** modify `frontend/src/components/ClientDetailPage.jsx` (+ CSS); add `frontend/src/components/__tests__/ClientDetailLayout.test.jsx` (already written). Keep `ClientDetailPage.test.jsx` green.

**Behaviour (all asserted by `ClientDetailLayout.test.jsx`):**
- Section heading « Identité » comes before « Historique commercial » in the DOM. Remove the invented « Client actif » badge. Contact action link « Appeler » (`tel:`).
- Back link « Retour aux clients » → `/app/clients` + `location.state.portfolioSearch` (query string preserved); both existing « Retour » links become this one native link.
- Section tabs/buttons show counts, e.g. « Achats (7) ». A « Modifier » button is reachable from every section; it opens Dialog « Modifier le client » with the existing `ClientForm` pre-filled; Escape closes without saving and returns focus to « Modifier ».
- History summary keeps 5 items plus « Voir tout l’historique » (typographic apostrophe) opening Dialog « Historique commercial de <name> » listing every item as `listitem`.
- Totals unchanged: « Total des achats : <exact> » via `Amount` with label; select « Projet » filters history and totals (« Achats (4) », « Total des achats : 400 000 MAD » in the fixture).
