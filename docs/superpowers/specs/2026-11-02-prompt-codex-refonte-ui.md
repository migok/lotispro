# Mission Codex — Refonte UX/UI de LotisPro (suite de l'audit)

Tu es Principal Product Designer, Senior UX Engineer et expert React, spécialisé SaaS B2B et dashboards métier. L'audit de l'existant est fait (phase 1). Ta mission : **prioriser, concevoir, implémenter et vérifier** la refonte, lot par lot, directement dans le code, sans casser le métier.

## 1. Ce que tu dois lire avant tout (dans cet ordre)

| Quoi | Chemin |
|---|---|
| **Audit UX/UI** : 24 problèmes classés, structure cible du dashboard, découpage en lots | `C:\Users\E7470\Documents\projet\real state\docs\superpowers\specs\2026-10-30-audit-ux-ui.md` |
| Règles du projet (stack, commandes, workflow de statuts, définition de « Terminé ») | `C:\Users\E7470\Documents\projet\real state\lot_webapp\CLAUDE.md` |
| Avancement et roadmap | `lot_webapp\docs\AVANCEMENT.md`, `lot_webapp\docs\superpowers\plans\2026-10-22-roadmap-lotispro.md` |
| Plan E6 (en cours, touche le dashboard projet) | `C:\Users\E7470\Documents\projet\real state\lot_webapp-e6\docs\superpowers\plans\2026-10-30-e6-dashboard-periode.md` |
| Schéma des données du dashboard (seules données autorisées pour les KPI) | `lot_webapp\backend\app\domain\schemas\dashboard.py` |

## 2. Skills à utiliser

Lis chaque `SKILL.md` en entier avant la tâche concernée et suis ses instructions, ainsi que ses fichiers `references/` quand il y renvoie.

| Skill | Quand | Chemin |
|---|---|---|
| **dashboard-design** | Tout écran de KPI, graphique, alertes, filtres de période, états vides et de chargement, QA par captures | `C:\Users\E7470\.codex\skills\dashboard-design\SKILL.md` (+ `references\tokens.md`, `components.md`, `layout.md`, `qa.md`, `snippets.md`) |
| redesign-existing-projects | Méthode de refonte d'un existant, ordre des corrections | `C:\Users\E7470\.claude\skills\redesign-existing-projects\SKILL.md` |
| ui-ux-pro-max | Direction artistique, palettes, typographie, accessibilité | `C:\Users\E7470\.claude\skills\ui-ux-pro-max\SKILL.md` |
| high-end-visual-design | Finition « premium » (surfaces, espacements, ombres) | `C:\Users\E7470\.claude\skills\high-end-visual-design\SKILL.md` |
| design-system | Architecture des tokens (primitive → sémantique → composant) | `C:\Users\E7470\.claude\plugins\cache\ui-ux-pro-max-skill\ui-ux-pro-max\2.5.0\.claude\skills\design-system\SKILL.md` |
| ui-styling | Intégration shadcn/ui + Tailwind | `C:\Users\E7470\.claude\skills\ui-styling\SKILL.md` |
| responsive-design | Grilles et points de rupture | `C:\Users\E7470\.codex\skills\responsive-design\SKILL.md` |
| test-driven-development | Toute logique (formateurs, primitives, calculs d'affichage) | `C:\Users\E7470\.claude\plugins\cache\claude-plugins-official\superpowers\7.0.0\skills\test-driven-development\SKILL.md` |
| verification-before-completion | Avant de déclarer un lot terminé | `C:\Users\E7470\.claude\plugins\cache\claude-plugins-official\superpowers\7.0.0\skills\verification-before-completion\SKILL.md` |

Références visuelles (principes, pas de copie) : shadcn/ui, Tremor, Recharts, Linear, Stripe Dashboard, Vercel.

## 3. Décisions : à confirmer avec l'utilisateur AVANT d'écrire du code

Pose ces 4 questions en une seule fois. Sans réponse contraire, applique la valeur recommandée.

1. **Bibliothèque** : shadcn/ui + Tailwind v4 + Recharts (**recommandé**), ou Ant Design. Ne jamais mélanger les deux.
2. **Ordre avec E6** : E6 d'abord pour tout ce qui touche le dashboard projet (**recommandé**). Les lots 1 à 4 peuvent avancer en parallèle.
3. **Fiche lot** : panneau latéral large (Sheet, **recommandé**) ou page dédiée.
4. **Thème clair** : le conserver et le corriger (**recommandé**), ou passer au thème sombre uniquement.

## 4. Objectif global

Faire de LotisPro un SaaS B2B premium, sobre et cohérent, utilisable au quotidien. Garder l'identité sombre et dorée, mais réserver l'or à la marque, aux actions principales et aux chiffres clés. Corriger les 24 problèmes de l'audit en commençant par les plus graves (🔴 puis 🟠).

Découpage (détail dans l'audit, section « Découpage proposé ») :

| Lot | Contenu | Problèmes de l'audit |
|---|---|---|
| 1. Fondations | Tokens, contraste, typographie, Tailwind et shadcn branchés sur les tokens, formateurs uniques, focus visible, réduction des animations | 2, 3, 4, 9, 12, 13, 19, 22 |
| 2. Primitives | Button, StatusBadge, StatTile, Card, DataTable, EmptyState, Skeleton, Dialog, Sheet, Tooltip accessible, ConfirmDialog | 5, 11, 17, 18 |
| 3. Shell + dashboard global | Sidebar, header, nouveau dashboard global, panneau « À traiter », erreurs par bloc | 1, 7, 8, 14, 15, 16, 20, 21 |
| 4. Clients | Portefeuille en tableau, filtres, pipeline cliquable, fiche client | 10 |
| 5. Projet et lots | Onglet unique « Pilotage », liste des lots, fiche lot en Sheet. **Seulement après le merge d'E6.** | 6, 17 |

**Périmètre de cette session : lot 1, puis lot 2.** Arrête-toi après le lot 2 pour la revue de l'utilisateur. Ne commence pas le lot 3 sans son accord.

### Lot 1 — critères d'acceptation

- Tous les tokens de texte (`--text-primary`, `--text-secondary`, `--text-muted`, or utilisé comme texte) atteignent un contraste **≥ 4,5:1** sur chaque surface, en thème sombre comme en thème clair. Un test automatisé calcule ces ratios.
- L'or de marque est séparé des couleurs de statut (option, réservé) et d'avertissement : chaque couleur a son propre token, et l'or n'est plus réutilisé pour ces usages.
- Palette des 9 statuts regroupée par phase (commercial, financier, EDL, notaire, livré), toujours accompagnée d'un libellé.
- Échelle typographique à 7 niveaux maximum. Plancher de **12 px** pour les libellés et de **14 px** pour le texte courant. Chiffres en DM Sans avec chiffres tabulaires. Cormorant Garamond réservée aux titres de page.
- Échelles d'espacement, de rayons, de `z-index` et de surfaces. Ombres teintées et discrètes. 3 points de rupture (640 / 1024 / 1280 px).
- **Un seul formateur de montant** (`Intl`, fr-MA, compact pour les tuiles avec la valeur exacte en infobulle) et **un seul formateur de date**, couverts par des tests. 999 999 ne doit plus s'afficher « 1000K MAD ». Les anciens formateurs (`formatCompactPrice`, `fmtCurrency` local de `GlobalDashboard.jsx`) délèguent au nouveau ou disparaissent.
- `:focus-visible` global et `@media (prefers-reduced-motion: reduce)`.
- Tailwind v4 (`@tailwindcss/vite`) et shadcn (`components.json` avec `"tsx": false`, alias `@` dans `vite.config.js` et `jsconfig.json`), variables shadcn mappées sur les tokens LotisPro. **Aucune régression visuelle sur les pages existantes.** Si la réinitialisation globale de Tailwind (preflight) casse des écrans, importe d'abord sans elle (`@import "tailwindcss/theme.css" layer(theme); @import "tailwindcss/utilities.css" layer(utilities);`) et note-le.
- Tokens centralisés dans un seul fichier (par exemple `src/styles/tokens.css`), importé avant `styles.css`.

### Lot 2 — critères d'acceptation

- Primitives dans `src/components/ui/`, chacune avec un test (rendu, variantes, accessibilité clavier).
- `StatusBadge` lit les statuts depuis `utils/constants.js` (`STATUS_LABELS`, `STATUS_COLORS`) : aucune couleur en dur.
- `ConfirmDialog` remplace les deux `confirm()` natifs (`Dashboard.jsx:208`, `AssignCommercialsModal.jsx:56`). Pour `Dashboard.jsx`, si E6 n'est pas mergé, limite-toi à ce remplacement.
- Skeleton générique utilisé à la place des « Chargement… » textuels hors du dashboard projet.
- Cartes et lignes cliquables migrées vers de vrais liens ou boutons accessibles au clavier, au moins sur le dashboard global et la page Clients.

## 5. Règles non négociables

- **Espace de travail** : crée un worktree dédié depuis `origin/dev`, par exemple `git worktree add ../lot_webapp-ui -b feature/ui-refonte-fondations origin/dev`. Ne modifie jamais `lot_webapp`, `lot_webapp-e5` ni `lot_webapp-e6`. Une branche par lot.
- **Conflit avec E6** : E6 modifie `Dashboard.jsx`, `styles.css` (styles de skeleton et du sélecteur de période, en fin de fichier) et crée `components/dashboard/`. Avant le merge d'E6, ne restructure ni `Dashboard.jsx` ni les onglets d'analyse de `ProjectDetailPage.jsx`. Dans `styles.css`, touche uniquement aux tokens et aux règles globales.
- **Métier intouchable** : ne modifie pas les API, les règles métier, les calculs financiers, les permissions ni les modèles de données sans validation explicite. N'invente aucune donnée ni aucun KPI : n'utilise que les champs réellement renvoyés par l'API.
- Interface en **français** (majuscule au premier mot uniquement). Commits en anglais au format conventionnel, terminés par la ligne `Co-Authored-By` habituelle du projet. Jamais d'`amend` ni de `force-push`.
- TDD pour toute logique. `npm run lint` = 0 erreur, `npm test` vert, `npm run build` OK avant chaque commit.
- Dépendances : uniquement celles qu'impose la décision 1 (Tailwind, shadcn et ses dépendances, Recharts, une bibliothèque d'icônes si besoin). Justifie chaque ajout.
- Mets à jour `docs/AVANCEMENT.md` avec une ligne « Refonte UI » et l'état de chaque lot.
- Ouvre une PR vers `dev` par lot. **C'est l'utilisateur qui merge.**

## 6. Validation visuelle

- Lance le backend (sans `--reload` sous Windows, voir `CLAUDE.md`) et le frontend, puis inspecte les pages avec un navigateur à **trois largeurs** (375, 768 et 1440 px) en thème sombre et en thème clair.
- Fais des captures avant/après des pages : dashboard global, liste des projets, page projet (onglets Carte et Lots), clients, fiche client, commerciaux, login.
- Applique la QA de `dashboard-design` (`references/qa.md`) sur les écrans de KPI.
- L'app demande une connexion : demande un compte de test à l'utilisateur. Si une validation est impossible, dis exactement pourquoi. Ne la déclare jamais réussie.

## 7. Livrables à la fin de chaque lot

1. Les problèmes de l'audit traités, avec leur numéro.
2. Les composants et fichiers créés ou refactorisés.
3. Les dépendances ajoutées et leur justification.
4. Les résultats de lint, tests et build (sortie réelle).
5. Les captures avant/après, ou la raison de leur absence.
6. Ce qui reste à faire et les risques.
7. Le lien de la PR.
