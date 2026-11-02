# Codex — Corrections suite à la revue des PR #58, #59, #60

Les 3 PR de la refonte UI ont été relues : CI verte, mais **un bug bloquant et plusieurs défauts** empêchent la validation. Corrige-les dans l'ordre de la pile, puis rends la main pour une nouvelle revue. **Ne commence pas le lot 4.**

Rappel de la pile : `feature/ui-fondations` (#58) ⊂ `feature/ui-primitives` (#59) ⊂ `feature/ui-dashboard-global` (#60), toutes vers `dev`. Worktree : `C:\Users\E7470\Documents\projet\real state\lot_webapp-ui`.

## Méthode

1. Corrige d'abord sur `feature/ui-fondations`, puis fusionne cette branche dans `feature/ui-primitives` (`git merge`, pas de rebase). Corrige #59, fusionne dans `feature/ui-dashboard-global`, puis corrige #60.
2. Pour chaque bug : **commence par un test qui échoue** (régression), puis corrige.
3. Avant chaque push : `npm run lint` = 0 erreur, `npm test` vert, `npm run build` OK. Pousse normalement. **Jamais de force-push ni d'amend.**
4. Ne modifie ni les API, ni les règles métier, ni les calculs financiers, ni les permissions. Les corrections ci-dessous se font toutes côté frontend.
5. À la fin, poste sur chaque PR un commentaire listant les corrections (numéro du point + commit). **Laisse les PR en brouillon** : la revue suivante les passera en « prêtes ».

## #58 — Fondations

- **58.1 — Couleurs de statut en double.** `available` et `chez_proprietaire` ont la même couleur (`#66d6a5` dans `STATUS_HEX_COLORS`, et la même valeur pour `--color-available` et `--color-proprietaire` dans `tokens.css`, dans les deux thèmes). Sur la carte Leaflet, un lot libre et un lot livré sont identiques. Donne à « Livré » une couleur distincte, cohérente avec le regroupement par phase. Ajoute un test qui vérifie que les 12 statuts ont des couleurs **toutes différentes** dans `STATUS_HEX_COLORS`, et que les tokens correspondants sont aussi distincts dans les deux thèmes.
- **58.2 — Mettre à jour `CLAUDE.md` (validé par l'utilisateur).** Le choix Tailwind v4 + shadcn/ui (Radix) + Recharts est assumé, car il améliore l'interface du SaaS. Dans `CLAUDE.md` :
  - remplace la convention « Styling: custom CSS in `styles.css`, no UI framework » par la nouvelle règle : tokens dans `src/styles/tokens.css`, Tailwind v4 branché sur ces tokens, primitives dans `src/components/ui/` (shadcn/Radix), `styles.css` historique en cours de migration et sans nouvelles couleurs codées en dur ;
  - mets à jour le tableau des couleurs de statut pour qu'il corresponde à `utils/constants.js` ;
  - mentionne les primitives disponibles et le principe « une seule source pour les formats de montant et de date ».

## #59 — Primitives

- **59.1 — Fausses zones cliquables sur la page Clients.** Le clic sur la carte client et sur les lignes du classement « Meilleurs clients » a été retiré, mais le curseur « main » et la flèche décorative sont restés. L'utilisateur clique et rien ne se passe (`ClientsPage.jsx` vers les lignes 293 et 404). Rends toute la carte cliquable de manière accessible (lien étiré, *stretched link*, sur le nom, qui couvre la carte, avec un focus visible), ou retire le curseur et la flèche. Fais de même pour le classement. Test : un clic sur la carte mène à la fiche client, et le lien est atteignable au clavier.
- **59.2 — Infobulles de montant dupliquées.** Le même bloc `<Tooltip content={formatAmount(x)}><span className="ui-amount-trigger" tabIndex={0} aria-label={formatAmount(x)}> {formatCompactPrice(x)}</span></Tooltip>` est copié environ 20 fois (ClientsPage, CommercialsPage, CumulativeKpis, OverviewPanels), avec un **espace parasite devant le montant**. Le bouton d'info avec infobulle est copié environ 15 fois. Crée `<Amount value>` et `<InfoTip text>` dans `src/components/ui/`, remplace toutes les copies et supprime l'espace. Test sur `Amount` : texte compact affiché, valeur exacte en infobulle et en `aria-label`, pas d'espace en tête.

## #60 — Dashboard global

- **60.1 — 🔴 BLOQUANT : la fiche lot ne s'ouvre pas pour les lots soldés ou plus avancés.** Dans `global/DashboardLot.jsx:20`, `detail` est cherché dans `/api/dashboard/lots` avec la condition `r.reservation_id === lot.current_reservation_id`. Or cet endpoint ne joint que les réservations `active` et `validated` (`dashboard_service.py:1166`), et l'étape « soldée » passe la réservation en `converted` sans changer `lots.current_reservation_id` (`reservation_service.py:1220`). Résultat : « Fiche du lot indisponible » sur toutes les lignes « Passage chez le notaire » et pour tous les lots soldée / EDL / notaire / propriétaire ouverts depuis le panneau de stock. **Correction** : construis le lot passé à `LotDetailModal` à partir de **la même source que l'onglet Lots du projet** (`fetchProjectLots` dans `project/LotsTab.jsx`, qui ouvre correctement ces lots), sans exiger de réservation active. Ne modifie pas le backend. Tests : ouverture d'un lot `reservation_soldee`, d'un lot `chez_notaire` et d'un lot `available`.
- **60.2 — La fiche se ferme en pleine action.** `refresh` (ligne 27) incrémente `attempt`, ce qui remet `current` à `null` et démonte `LotDetailModal`. Après une étape de réservation (`handleStepDone` → `onRefresh()` puis `setNotify(...)`), après un paiement ou après la modification d'un engagement, l'état local de la fiche est perdu (le panneau « Notifier le client » n'apparaît jamais). **Correction** : recharger les données **sans démonter** la fiche (garder le dernier lot affiché pendant le rechargement, puis mettre à jour ses props), comme le fait l'onglet Lots du projet. Test : après `onRefresh`, la fiche reste montée et son état local est conservé.
- **60.3 — Détail du stock vide pour un commercial.** `StockPanel.jsx:19` interroge `/api/dashboard/lots?user_id=…`, qui ne renvoie que les lots réservés ou vendus par ce commercial, alors que les compteurs (Total, Disponible, Bloqué, En création) viennent de `/stats` et couvrent tous les lots. Un commercial voit « Disponible 120 », clique, et obtient « Aucun résultat ». **Correction** : pour les statuts de stock (`creation`, `available`, `blocked`), ne pas filtrer par `user_id`. Pour les statuts du pipeline, garder le filtre **et** s'assurer que les compteurs affichés suivent la même règle que la liste. **Le nombre affiché sur une tuile doit toujours égaler le nombre de lignes de la liste ouverte.** Test : vue commercial, clic sur « Disponible » → lignes non vides et nombre de lignes égal au compteur.
- **60.4 — Échéances décalées d'un jour (fuseau horaire).** `utils/deadlines.js` utilise `Date.parse`, qui lit une date seule (`notary_date = '2026-11-05'`) comme minuit **UTC**. À partir de 01:00 heure du Maroc le jour même, la ligne affiche « Dépassé de 1 j ». **Correction** : interpréter une date sans heure comme une date locale du jour métier (fin de journée incluse), comme le fait déjà `formatDate`. Tests à 00:30 et 23:30 heure locale le jour de l'échéance, et le lendemain.
- **60.5 — Deux règles d'expiration dans le suivi des options.** Dans `dashboard/OptionsTrackingTab.jsx:65`, les compteurs et le badge viennent de `deadline()` (calcul navigateur) alors que le style « expiré » de la ligne vient de `o.is_expired` (serveur). Les deux peuvent se contredire. **Correction** : une seule source. Utilise `is_expired` et `days_remaining` du serveur pour l'état expiré ou actif, et `deadline()` uniquement pour le libellé et le tri, sans contredire le serveur. Test : une ligne `is_expired=true` est comptée « Expirée », porte le badge « dépassé » et a le style expiré.
- **60.6 — Menu compte qui se ferme avant le clic (Safari, Firefox macOS).** `AccountMenu.jsx:19` ferme le panneau au `blur` dès que `relatedTarget` est hors du panneau. Sur ces navigateurs, un clic sur un bouton ne lui donne pas le focus, donc `relatedTarget` vaut `null` : le panneau disparaît avant le clic sur « Se déconnecter » ou « Passer en mode clair ». Ces actions n'existent plus ailleurs. **Correction** : utiliser un vrai menu Radix (`@radix-ui/react-dropdown-menu`, cohérent avec la pile shadcn) ou ne plus fermer sur un `blur` dont `relatedTarget` est `null`. Garder la fermeture par Échap et par clic extérieur. Test : clic sur « Se déconnecter » après ouverture du menu → `onLogout` appelé, y compris quand `relatedTarget` vaut `null`.

## Vérification finale

- Lance l'application et vérifie à l'écran, en thème sombre et en thème clair :
  - ouverture de la fiche d'un lot « chez notaire » depuis le panneau « À traiter » ;
  - une étape de réservation depuis cette fiche, puis l'apparition du panneau « Notifier le client » ;
  - en compte commercial, clic sur la tuile « Disponible » ;
  - la carte d'un projet, avec « Disponible » et « Livré » de couleurs différentes ;
  - le menu compte : déconnexion et changement de thème.
- Ajoute les captures ou la raison de leur absence dans ton rapport.
- Rapport final : un tableau « point → commit → test ajouté → vérifié à l'écran (oui/non) », et les résultats réels de lint, tests et build pour chacune des 3 branches.
