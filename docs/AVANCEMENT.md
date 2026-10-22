# Avancement — LotisPro

> Mis à jour dans le même commit que chaque tâche. En cas d'écart, le
> [GitHub Project « LotisPro — Roadmap »](https://github.com/users/migok/projects/4) fait foi.
>
> Roadmap : [docs/superpowers/plans/2026-10-22-roadmap-lotispro.md](superpowers/plans/2026-10-22-roadmap-lotispro.md)
> Design : [docs/superpowers/specs/2026-10-22-roadmap-lotispro-design.md](superpowers/specs/2026-10-22-roadmap-lotispro-design.md)

**Légende :** ⬜ À faire · 🟦 En cours · 🟨 En revue · ✅ Terminé · ⛔ Bloqué

_Dernière mise à jour : 2026-10-22_

## Vue d'ensemble

| Epic | Statut | Tâches faites | Issue | PR |
|---|---|---|---|---|
| E0 Fondations & nettoyage | ⬜ | 0 / 6 | [#8](https://github.com/migok/lotispro/issues/8) | |
| E1 🐛 #5 Plein écran | ⬜ | 0 / 2 | [#15](https://github.com/migok/lotispro/issues/15) | |
| E2 👤 #7 Fiche client | ⬜ | 0 / 4 | [#18](https://github.com/migok/lotispro/issues/18) | |
| E3 Statuts par projet + états des lieux | ⬜ | 0 / 5 | [#23](https://github.com/migok/lotispro/issues/23) | |
| E4 🔄 #8 Réservation | ⬜ | 0 / 4 | [#29](https://github.com/migok/lotispro/issues/29) | |
| E5 📊 #3 Vue projet | ⬜ | 0 / 3 | [#34](https://github.com/migok/lotispro/issues/34) | |
| E6 📅 #4 Dashboard par période | ⬜ | 0 / 3 | [#38](https://github.com/migok/lotispro/issues/38) | |
| E7 SMS / WhatsApp | ⛔ fournisseur à choisir | 0 / 3 | [#42](https://github.com/migok/lotispro/issues/42) | |

## Détail des tâches

| ID | Tâche | Statut | Issue | PR | Terminé le |
|---|---|---|---|---|---|
| E0-T1 | Réconcilier `main` → `dev` (hors IA) ; deploy strict | ⬜ | [#9](https://github.com/migok/lotispro/issues/9) | | |
| E0-T2 | Isolation tests backend + fabriques | ✅ | [#10](https://github.com/migok/lotispro/issues/10) | | 2026-10-22 |
| E0-T3 | Tests de caractérisation des transitions | ✅ | [#11](https://github.com/migok/lotispro/issues/11) | | 2026-10-22 |
| E0-T4 | Backend ruff à 0 (dont `F821`) | ⬜ | [#12](https://github.com/migok/lotispro/issues/12) | | |
| E0-T5 | ESLint à 0 + Vitest | ⬜ | [#13](https://github.com/migok/lotispro/issues/13) | | |
| E0-T6 | CI GitHub Actions + `CLAUDE.md` | ⬜ | [#14](https://github.com/migok/lotispro/issues/14) | | |
| E1-T1 | Carte flexible en plein écran | ⬜ | [#16](https://github.com/migok/lotispro/issues/16) | | |
| E1-T2 | Recette multi-navigateurs | ⬜ | [#17](https://github.com/migok/lotispro/issues/17) | | |
| E2-T1 | Migration 0017 + modèle client | ⬜ | [#19](https://github.com/migok/lotispro/issues/19) | | |
| E2-T2 | Validation + doublons | ⬜ | [#20](https://github.com/migok/lotispro/issues/20) | | |
| E2-T3 | Formulaire client | ⬜ | [#21](https://github.com/migok/lotispro/issues/21) | | |
| E2-T4 | Fiche / listes / PDF | ⬜ | [#22](https://github.com/migok/lotispro/issues/22) | | |
| E3-T1 | `lot_workflow` + `lot_status_history` | ⬜ | [#24](https://github.com/migok/lotispro/issues/24) | | |
| E3-T2 | Statuts optionnels par projet | ⬜ | [#25](https://github.com/migok/lotispro/issues/25) | | |
| E3-T3 | Transition option → engagée | ⬜ | [#26](https://github.com/migok/lotispro/issues/26) | | |
| E3-T4 | États des lieux backend | ⬜ | [#27](https://github.com/migok/lotispro/issues/27) | | |
| E3-T5 | Frontend statuts + EDL | ⬜ | [#28](https://github.com/migok/lotispro/issues/28) | | |
| E4-T1 | Acte auto à l'engagement | ⬜ | [#30](https://github.com/migok/lotispro/issues/30) | | |
| E4-T2 | Service de notifications | ⬜ | [#31](https://github.com/migok/lotispro/issues/31) | | |
| E4-T3 | UI notifications + historique | ⬜ | [#32](https://github.com/migok/lotispro/issues/32) | | |
| E4-T4 | Rappels d'expiration | ⬜ | [#33](https://github.com/migok/lotispro/issues/33) | | |
| E5-T1 | Endpoint `lots-matrix` | ⬜ | [#35](https://github.com/migok/lotispro/issues/35) | | |
| E5-T2 | Onglet Lots (grille + navigation) | ⬜ | [#36](https://github.com/migok/lotispro/issues/36) | | |
| E5-T3 | Filtres persistés | ⬜ | [#37](https://github.com/migok/lotispro/issues/37) | | |
| E6-T1 | Backend période + KPIs | ⬜ | [#39](https://github.com/migok/lotispro/issues/39) | | |
| E6-T2 | Sélecteur de période + découpage Dashboard | ⬜ | [#40](https://github.com/migok/lotispro/issues/40) | | |
| E6-T3 | Export Excel | ⬜ | [#41](https://github.com/migok/lotispro/issues/41) | | |
| E7-T1 | Décision fournisseur | ⛔ | [#43](https://github.com/migok/lotispro/issues/43) | | |
| E7-T2 | Canal SMS | ⬜ | [#44](https://github.com/migok/lotispro/issues/44) | | |
| E7-T3 | Canal WhatsApp | ⬜ | [#45](https://github.com/migok/lotispro/issues/45) | | |

## Déjà terminé avant la roadmap (audit du 2026-10-22)

| Élément | Preuve |
|---|---|
| Workflow des 9 statuts + transitions | PR #7 (`4777330`), 2026-10-07 |
| Statut Bloqué (motif, déblocage manager) | `8068163` |
| Code couleur des statuts | `frontend/src/utils/constants.js` |
| Prix au m² dans les métadonnées | migrations 0005, 0014 |
| Toasts visibles en plein écran (moitié du BUG #5) | `5b4a4bb` |
| `closed_at` à l'arrivée chez le propriétaire | `8068163`, migration 0015 |

## Branches

- `main` a été réconcilié dans `dev` (merge `--no-ff`) ; `git log HEAD..origin/main` est vide. Les fichiers de l'assistant IA (`PromptLibrary.jsx`, `prompts.js`) vivent uniquement sur `feature/ai_assistant`.
- `feature/marketing_landing_page` : un seul commit non mergé dans `dev` (`git log --oneline dev..origin/feature/marketing_landing_page` après réconciliation) :
  - `b237c02 feat: update Contact and Landing pages with new messaging and styling for demo booking` (touche `ContactPage.jsx`, `LandingPage.jsx`, `landing.css`, ajoute `frontend/public/launch-strategy.md`).
- Pas de merge effectué (décision reportée).

## Dette technique suivie

_À compléter par E0-T4 (fonctions `PLR0912` / `PLR0915` à découper quand un epic les touche)._

## Anomalies constatées

_Comportements suspects relevés pendant les tests de caractérisation, en attente de décision._

Relevés lors de E0-T3 (`test_lot_transitions.py`) ; le code applicatif n'a pas été modifié, les tests décrivent le comportement actuel.

- **Aucun contrôle d'accès projet sur les transitions** : `lot_transitions.py` n'utilise que `CurrentUser` ; un commercial non affecté au projet peut activer, bloquer, prolonger ou faire avancer n'importe quel lot (seuls `proprietaire` et `unblock` exigent `manager`).
- **`extend-option` sans contrôle de propriétaire** : n'importe quel utilisateur connecté peut prolonger l'option d'un autre commercial (contrairement à `cancel-option`, `to-reservation`, `refund`, `engage`, `solde`). De plus `additional_days` est un paramètre de requête, pas un corps JSON, contrairement aux autres transitions.
- **`block` / `unblock` perdent l'état du lot** : bloquer un lot en `option` (ou autre statut avec réservation) puis le débloquer le remet en `available` tout en conservant `current_reservation_id` vers une réservation encore `active` (couvert par `test_unblock_returns_to_available_and_keeps_reservation_link`). Le statut précédent n'est pas mémorisé.
- **Tout utilisateur connecté peut bloquer n'importe quel lot** (y compris `reservation_engagee`, `reservation_soldee`, `chez_notaire`), sans restriction de rôle ni de propriétaire.
- **`closed_at` absent de `ReservationResponse`** : `_reservation_to_response` (`reservation_service.py`) ne renseigne pas `closed_at` alors que le champ existe dans le schéma ; il est donc toujours `null` dans les réponses de réservation, alors qu'il est bien écrit en base par `proprietaire` et reste exposé par le détail du lot (`lot_repository.py` -> `LotWithDetails`).
- **`unblock` écrit `blocked_reason = ""`** (chaîne vide) au lieu de `NULL`, et `block` sans motif stocke aussi `""`.
- **`engage` en mode `guarantee_action=refund`** fait quand même avancer le lot en `reservation_engagee` (documenté dans le schéma, mais à confirmer côté métier).
- **`solde` accepte un `price` libre** : le prix de la vente n'est pas rapproché de `sale_price` / `price` du lot ni du total de l'échéancier.

## Recette E1 (plein écran)

| Mode | Chrome | Firefox | Edge |
|---|---|---|---|
| Fenêtré standard | | | |
| Plein écran (F11 et bouton) | | | |
| Tablette 1024 px | | | |
| Écran large ≥ 1440 px | | | |
