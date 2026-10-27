# E3 — Moteur de statuts : statuts par projet + états des lieux

**Design parent :** [roadmap design](../2026-10-22-roadmap-lotispro-design.md) §5 E3
**Ticket Asana :** « consolidation des tâches à faire » (1214132503212210) §2 ; 🗂️ Workflow (1214067196164955)
**Dépend de :** E0 (tests de caractérisation) — **Débloque :** E4 (déclencheur d'engagement unique), E5 (statuts actifs), E6 (historique)

## Pipeline (12 statuts)

| Ordre | Statut | Libellé | Obligatoire | Couleur |
|---|---|---|---|---|
| 1 | `creation` | Création | oui | jaune (existant) |
| 2 | `available` | Disponible | oui | vert clair (existant) |
| 3 | `option` | Option | **non** | vert foncé (existant) |
| 4 | `reservation_a_finaliser` | Réservation à finaliser | **non** | rose clair (existant) |
| 5 | `reservation_engagee` | Réservation engagée | oui | rose foncé (existant) |
| 6 | `reservation_soldee` | Réservation soldée | oui | bleu clair (existant) |
| 7 | `edl_programme` | État des lieux programmé | **non** (bloc EDL) | `#38bdf8` |
| 8 | `edl_realise` | État des lieux réalisé | **non** (bloc EDL) | `#0ea5e9` |
| 9 | `edl_finalise` | État des lieux finalisé | **non** (bloc EDL) | `#0284c7` |
| 10 | `chez_notaire` | Chez le notaire | oui | bleu foncé (existant) |
| 11 | `chez_proprietaire` | Chez le propriétaire | oui | gris foncé (existant) |
| — | `blocked` | Bloqué | oui | gris clair (existant) |

## Règles

- `projects.enabled_optional_statuses` : liste JSON parmi `option`, `reservation_a_finaliser`, `edl`.
  Défaut des projets existants et nouveaux : `["option", "reservation_a_finaliser"]` (EDL désactivé → comportement actuel inchangé).
- **Transitions strictes inchangées.** Seul ajout : `option → reservation_engagee`
  (`POST /lots/{id}/transitions/option-engage`, mêmes données et effets que `engage`), autorisée **uniquement** si
  `reservation_a_finaliser` est désactivé pour le projet.
- Le backend refuse (`BusinessRuleError` → HTTP 400, convention existante) toute transition **vers** un statut désactivé.
- `reservation_soldee → chez_notaire` est refusé si le bloc EDL est actif ; on passe alors par `edl_programme`.
- Désactiver une option refusé (400) si des lots sont dans un statut concerné ; le message liste leurs numéros.
- Module de domaine `app/domain/lot_workflow.py` : ordre des statuts, ensemble des transitions
  `(from, to, condition)`, `is_status_enabled(project, status)`, `assert_transition_allowed(project, from, to)`.
  **Chaque** méthode de transition de `reservation_service` / `lot_service` l'appelle.
- `lot_status_history` (lot_id, from_status, to_status, user_id, changed_at, reservation_id) écrite par **chaque** transition, dans la même transaction.

## États des lieux

- Table `etats_des_lieux` : `reservation_id`, `lot_id`, `scheduled_at` (date+heure), `intervenant` (texte), `schedule_note`, `done_at`, `done_note`, `finalized_at`.
- Table `edl_actions` : `etat_des_lieux_id`, `description`, `responsable` (texte), `status` (`ouverte` | `faite`), `done_at`.
- Transitions :
  - `soldee → edl_programme` : `POST /transitions/edl-schedule` {scheduled_at, intervenant, note}
  - `edl_programme` : `PUT /transitions/edl-schedule` (reprogrammer)
  - `edl_programme → edl_realise` : `POST /transitions/edl-done` {done_at, note, actions[]}
  - actions : `POST/PUT/DELETE /lots/{id}/edl/actions[/{action_id}]`
  - `edl_realise → edl_finalise` : `POST /transitions/edl-finalize` — refusé (400) s'il reste une action `ouverte`
  - `edl_finalise → chez_notaire` : route `notaire` existante (garde élargie à `edl_finalise` quand EDL actif)

## Périmètre

- **E3-T1** `lot_workflow.py` + `lot_status_history` (migration 0020) + branchement dans toutes les transitions existantes ; les tests de caractérisation E0-T3 restent verts.
- **E3-T2** `enabled_optional_statuses` (migration 0021) + API paramètres projet + gardes + refus de désactivation.
- **E3-T3** Transition `option-engage`.
- **E3-T4** États des lieux backend (migration 0022 : tables + contrainte `valid_lot_status` élargie).
- **E3-T5** Frontend : cases dans Paramètres projet ; `LotDetailModal` n'affiche que les actions permises ; écrans EDL (programmer, réaliser + actions, finaliser) ; libellés/couleurs dans `utils/constants.js`.

## Critères d'acceptance
- [ ] Projet existant après migration : comportement identique (tests de caractérisation verts).
- [ ] Option désactivée → bouton « Démarrer une option » absent et route refusée.
- [ ] À finaliser désactivé + option active → un lot en option peut être engagé directement.
- [ ] EDL actif → soldée → EDL programmé → réalisé (avec actions) → finalisé → notaire ; finalisation refusée tant qu'une action est ouverte.
- [ ] Désactivation refusée si des lots sont dans le statut, avec liste des lots.
- [ ] Chaque transition crée une ligne `lot_status_history`.
