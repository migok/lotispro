# Avancement — LotisPro

> Mis à jour dans le même commit que chaque tâche. En cas d'écart, le
> [GitHub Project « LotisPro — Roadmap »](https://github.com/users/migok/projects) fait foi.
>
> Roadmap : [docs/superpowers/plans/2026-10-22-roadmap-lotispro.md](superpowers/plans/2026-10-22-roadmap-lotispro.md)
> Design : [docs/superpowers/specs/2026-10-22-roadmap-lotispro-design.md](superpowers/specs/2026-10-22-roadmap-lotispro-design.md)

**Légende :** ⬜ À faire · 🟦 En cours · 🟨 En revue · ✅ Terminé · ⛔ Bloqué

_Dernière mise à jour : 2026-10-22_

## Vue d'ensemble

| Epic | Statut | Tâches faites | Issue | PR |
|---|---|---|---|---|
| E0 Fondations & nettoyage | ⬜ | 0 / 6 | | |
| E1 🐛 #5 Plein écran | ⬜ | 0 / 2 | | |
| E2 👤 #7 Fiche client | ⬜ | 0 / 4 | | |
| E3 Statuts par projet + états des lieux | ⬜ | 0 / 5 | | |
| E4 🔄 #8 Réservation | ⬜ | 0 / 4 | | |
| E5 📊 #3 Vue projet | ⬜ | 0 / 3 | | |
| E6 📅 #4 Dashboard par période | ⬜ | 0 / 3 | | |
| E7 SMS / WhatsApp | ⛔ fournisseur à choisir | 0 / 3 | | |

## Détail des tâches

| ID | Tâche | Statut | Issue | PR | Terminé le |
|---|---|---|---|---|---|
| E0-T1 | Réconcilier `main` → `dev` (hors IA) ; deploy strict | ⬜ | | | |
| E0-T2 | Isolation tests backend + fabriques | ⬜ | | | |
| E0-T3 | Tests de caractérisation des transitions | ⬜ | | | |
| E0-T4 | Backend ruff à 0 (dont `F821`) | ⬜ | | | |
| E0-T5 | ESLint à 0 + Vitest | ⬜ | | | |
| E0-T6 | CI GitHub Actions + `CLAUDE.md` | ⬜ | | | |
| E1-T1 | Carte flexible en plein écran | ⬜ | | | |
| E1-T2 | Recette multi-navigateurs | ⬜ | | | |
| E2-T1 | Migration 0017 + modèle client | ⬜ | | | |
| E2-T2 | Validation + doublons | ⬜ | | | |
| E2-T3 | Formulaire client | ⬜ | | | |
| E2-T4 | Fiche / listes / PDF | ⬜ | | | |
| E3-T1 | `lot_workflow` + `lot_status_history` | ⬜ | | | |
| E3-T2 | Statuts optionnels par projet | ⬜ | | | |
| E3-T3 | Transition option → engagée | ⬜ | | | |
| E3-T4 | États des lieux backend | ⬜ | | | |
| E3-T5 | Frontend statuts + EDL | ⬜ | | | |
| E4-T1 | Acte auto à l'engagement | ⬜ | | | |
| E4-T2 | Service de notifications | ⬜ | | | |
| E4-T3 | UI notifications + historique | ⬜ | | | |
| E4-T4 | Rappels d'expiration | ⬜ | | | |
| E5-T1 | Endpoint `lots-matrix` | ⬜ | | | |
| E5-T2 | Onglet Lots (grille + navigation) | ⬜ | | | |
| E5-T3 | Filtres persistés | ⬜ | | | |
| E6-T1 | Backend période + KPIs | ⬜ | | | |
| E6-T2 | Sélecteur de période + découpage Dashboard | ⬜ | | | |
| E6-T3 | Export Excel | ⬜ | | | |
| E7-T1 | Décision fournisseur | ⛔ | | | |
| E7-T2 | Canal SMS | ⬜ | | | |
| E7-T3 | Canal WhatsApp | ⬜ | | | |

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

_À compléter par E0-T1 (état de `feature/marketing_landing_page`)._

## Dette technique suivie

_À compléter par E0-T4 (fonctions `PLR0912` / `PLR0915` à découper quand un epic les touche)._

## Anomalies constatées

_Comportements suspects relevés pendant les tests de caractérisation, en attente de décision._

## Recette E1 (plein écran)

| Mode | Chrome | Firefox | Edge |
|---|---|---|---|
| Fenêtré standard | | | |
| Plein écran (F11 et bouton) | | | |
| Tablette 1024 px | | | |
| Écran large ≥ 1440 px | | | |
