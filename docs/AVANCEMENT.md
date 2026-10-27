# Avancement — LotisPro

> Mis à jour dans le même commit que chaque tâche. En cas d'écart, le
> [GitHub Project « LotisPro — Roadmap »](https://github.com/users/migok/projects/4) fait foi.
>
> Roadmap : [docs/superpowers/plans/2026-10-22-roadmap-lotispro.md](superpowers/plans/2026-10-22-roadmap-lotispro.md)
> Design : [docs/superpowers/specs/2026-10-22-roadmap-lotispro-design.md](superpowers/specs/2026-10-22-roadmap-lotispro-design.md)

**Légende :** ⬜ À faire · 🟦 En cours · 🟨 En revue · ✅ Terminé · ⛔ Bloqué

_Dernière mise à jour : 2026-10-27 (E4-T0 en revue ; E4-T5 ajoutée)_

## Vue d'ensemble

| Epic | Statut | Tâches faites | Issue | PR |
|---|---|---|---|---|
| E0 Fondations & nettoyage | ✅ | 6 / 6 | [#8](https://github.com/migok/lotispro/issues/8) | [#46](https://github.com/migok/lotispro/pull/46) |
| E1 🐛 #5 Plein écran | ✅ | 2 / 2 | [#15](https://github.com/migok/lotispro/issues/15) | [#47](https://github.com/migok/lotispro/pull/47) |
| E2 👤 #7 Fiche client | ✅ | 6 / 6 | [#18](https://github.com/migok/lotispro/issues/18) | [#48](https://github.com/migok/lotispro/pull/48) |
| E3 Statuts par projet + états des lieux | 🟨 | 5 / 5 | [#23](https://github.com/migok/lotispro/issues/23) | |
| E4 🔄 #8 Réservation | 🟦 | 0 / 6 | [#29](https://github.com/migok/lotispro/issues/29) | |
| E5 📊 #3 Vue projet | ⬜ | 0 / 3 | [#34](https://github.com/migok/lotispro/issues/34) | |
| E6 📅 #4 Dashboard par période | ⬜ | 0 / 3 | [#38](https://github.com/migok/lotispro/issues/38) | |
| E7 SMS / WhatsApp | ⛔ fournisseur à choisir | 0 / 3 | [#42](https://github.com/migok/lotispro/issues/42) | |

## Détail des tâches

| ID | Tâche | Statut | Issue | PR | Terminé le |
|---|---|---|---|---|---|
| E0-T1 | Réconcilier `main` → `dev` (hors IA) ; deploy strict | ✅ | [#9](https://github.com/migok/lotispro/issues/9) | [#46](https://github.com/migok/lotispro/pull/46) | 2026-10-24 |
| E0-T2 | Isolation tests backend + fabriques | ✅ | [#10](https://github.com/migok/lotispro/issues/10) | [#46](https://github.com/migok/lotispro/pull/46) | 2026-10-22 |
| E0-T3 | Tests de caractérisation des transitions | ✅ | [#11](https://github.com/migok/lotispro/issues/11) | [#46](https://github.com/migok/lotispro/pull/46) | 2026-10-22 |
| E0-T4 | Backend ruff à 0 (dont `F821`) | ✅ | [#12](https://github.com/migok/lotispro/issues/12) | [#46](https://github.com/migok/lotispro/pull/46) | 2026-10-22 |
| E0-T5 | ESLint à 0 + Vitest | ✅ | [#13](https://github.com/migok/lotispro/issues/13) | [#46](https://github.com/migok/lotispro/pull/46) | 2026-10-23 |
| E0-T6 | CI GitHub Actions + `CLAUDE.md` | ✅ | [#14](https://github.com/migok/lotispro/issues/14) | [#46](https://github.com/migok/lotispro/pull/46) | 2026-10-23 |
| E1-T1 | Carte flexible en plein écran | ✅ | [#16](https://github.com/migok/lotispro/issues/16) | [#47](https://github.com/migok/lotispro/pull/47) | 2026-10-24 |
| E1-T2 | Recette multi-navigateurs | ✅ | [#17](https://github.com/migok/lotispro/issues/17) | [#47](https://github.com/migok/lotispro/pull/47) | 2026-10-24 |
| E2-T1 | Migration 0017 + modèle client | ✅ | [#19](https://github.com/migok/lotispro/issues/19) | [#48](https://github.com/migok/lotispro/pull/48) | 2026-10-24 |
| E2-T2 | Validation + doublons | ✅ | [#20](https://github.com/migok/lotispro/issues/20) | [#48](https://github.com/migok/lotispro/pull/48) | 2026-10-24 |
| E2-T3 | Formulaire client | ✅ | [#21](https://github.com/migok/lotispro/issues/21) | [#48](https://github.com/migok/lotispro/pull/48) | 2026-10-24 |
| E2-T4 | Fiche / listes / PDF | ✅ | [#22](https://github.com/migok/lotispro/issues/22) | [#48](https://github.com/migok/lotispro/pull/48) | 2026-10-24 |
| E2-T5 | Villes, adresse obligatoire, notice acte | ✅ | — | [#48](https://github.com/migok/lotispro/pull/48) | 2026-10-25 |
| E2-T6 | Pays de l'adresse à l'étranger | ✅ | — | [#48](https://github.com/migok/lotispro/pull/48) | 2026-10-25 |
| E3-T1 | `lot_workflow` + `lot_status_history` | ✅ | [#24](https://github.com/migok/lotispro/issues/24) | | 2026-10-25 |
| E3-FIX | Dernière échéance payée → 500 (#50) | ✅ | [#50](https://github.com/migok/lotispro/issues/50) | | 2026-10-25 |
| E3-T2 | Statuts optionnels par projet | ✅ | [#25](https://github.com/migok/lotispro/issues/25) | | 2026-10-25 |
| E3-T3 | Transition option → engagée | ✅ | [#26](https://github.com/migok/lotispro/issues/26) | | 2026-10-25 |
| E3-T4 | États des lieux backend | ✅ | [#27](https://github.com/migok/lotispro/issues/27) | | 2026-10-26 |
| E3-T5 | Frontend statuts + EDL | ✅ | [#28](https://github.com/migok/lotispro/issues/28) | | 2026-10-26 |
| E4-T0 | Correctif PDF : police Unicode (’, arabe) | 🟨 | [#49](https://github.com/migok/lotispro/issues/49) | | |
| E4-T1 | Acte auto à l'engagement | ⬜ | [#30](https://github.com/migok/lotispro/issues/30) | | |
| E4-T2 | Service de notifications | ⬜ | [#31](https://github.com/migok/lotispro/issues/31) | | |
| E4-T3 | UI notifications + historique | ⬜ | [#32](https://github.com/migok/lotispro/issues/32) | | |
| E4-T4 | Rappels d'expiration | ⬜ | [#33](https://github.com/migok/lotispro/issues/33) | | |
| E4-T5 | Modifier une réservation engagée | ⬜ | [#52](https://github.com/migok/lotispro/issues/52) | | |
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
- `backend/railway.toml` ligne 6 : `|| alembic stamp 0001` retiré (appliqué manuellement par l'utilisateur le 2026-10-24) — un échec de migration fait désormais échouer le déploiement.

## Dette technique suivie

Fonctions backend qui dépassent les seuils `PLR0912` (> 12 branches) / `PLR0915` (> 50 instructions). Ces règles sont désactivées dans `backend/pyproject.toml` ; à découper quand un epic touche la fonction. Liste issue de `ruff check . --isolated --select PLR0912,PLR0915` (E0-T4, 2026-10-22).

| Fichier | Fonction | Dépassement |
| --- | --- | --- |
| `app/services/certificate_service.py` | `generate_reservation_certificate` | PLR0915 82/50 |
| `app/services/certificate_service.py` | `generate_payment_receipt` | PLR0915 59/50 |
| `app/services/dashboard_service.py` | `get_dashboard_stats` | PLR0912 38/12, PLR0915 121/50 |
| `app/services/dashboard_service.py` | `get_clients_pipeline` | PLR0912 16/12, PLR0915 62/50 |
| `app/services/dashboard_service.py` | `get_lots_dashboard` | PLR0912 18/12, PLR0915 65/50 |
| `app/services/lot_service.py` | `bulk_update_lot_metadata` | PLR0912 13/12 |
| `app/services/project_service.py` | `get_project_kpis` | PLR0915 67/50 |
| `app/services/project_service.py` | `_get_user_filtered_kpis` | PLR0915 64/50 |
| `app/services/project_service.py` | `upload_geojson` | PLR0912 16/12, PLR0915 63/50 |
| `app/services/project_service.py` | `export_geojson` | PLR0912 20/12, PLR0915 62/50 |
| `app/services/project_service.py` | `import_csv_metadata` | PLR0912 20/12, PLR0915 74/50 |
| `app/services/reservation_service.py` | `finaliser_engage` | PLR0912 19/12 |

Autres règles ruff désactivées par choix (E0-T4) : `PLC0415` (44 imports différés dans les services, repositories, schémas et tests, probablement pour éviter des dépendances circulaires ; à revoir, voir le détail ci-dessous) et `ARG001` limité aux endpoints FastAPI, handlers d'erreur, logging, lifespan (signatures imposées par le framework).

Autre dette relevée en fin d'E0 (revue finale, 2026-10-24) :

- **Tests manquants avant les refactors E3 / E4** : aucun test n'exerce `payment_plan` / les échéances ; l'effet de `engage` avec `guarantee_action=deduct` et les notes d'audit de `extend-option` ne sont pas assertés. À couvrir avant de toucher ces flux.
- **`PLC0415` (imports différés)**, 44 occurrences, issues de `ruff check . --isolated --select PLC0415 --output-format concise` (depuis `backend/`) : `services/project_service.py` 14, `services/dashboard_service.py` 11, `repositories/lot_repository.py` 5, et 1 chacun dans `domain/schemas/lot.py`, `repositories/base.py`, `client_repository.py`, `project_repository.py`, `sale_repository.py`, `user_repository.py`, `database/session.py`, `services/email_service.py`, `lot_pricing_service.py`, `payment_service.py`, `reservation_service.py`, `user_service.py`, `tests/unit/test_domain/test_security.py`, `tests/unit/test_imports.py`.
- **`Dashboard.jsx`** : `setPerformance` n'est jamais lu (état en écriture seule) et son appel API (`loadDashboardData`) est mort ; à nettoyer avec le découpage de E6-T2.

Dette relevée en fin d'E3 (revue finale, statuts optionnels et état des lieux) :

- `extend_option` n'appelle pas `assert_transition_allowed` (sans effet de comportement aujourd'hui).
- `POST /api/lots` accepte n'importe quel statut, y compris les statuts EDL ; restreindre `LotCreate.status` à `DIRECT_UPDATE_STATUSES`.
- Un acompte d'option remboursé reste compté comme encaissé dans `ca_realise`, `total_deposits` et les totaux client.
- Pas de verrou de ligne entre la vérification « statut en cours d'utilisation » du workflow projet et la mise à jour.
- Les numéros de lots du message `status_in_use` sont triés comme des chaînes (`10` avant `2`).
- Un remboursement sans montant est accepté par le backend.
- `LotRepository` construit un `EtatDesLieuxRepository` (couplage entre repositories).
- Le bouton « Finaliser » reste désactivé si le chargement de l'EDL échoue.
- `LotDetailModal` fait environ 2850 lignes ; à découper.
- Endpoint mort `POST /api/sales` (répond toujours 400) et schéma `SaleCreate` à supprimer.
- **Dépendances backend : 3 sources divergentes** (relevé lors de la CI de la PR #46) : `backend/requirements.txt` (épingle `fastapi==0.115.0`, `pydantic==2.8.2`…, utilisé en local), `backend/pyproject.toml` (plages non épinglées, utilisé par la CI via `pip install -e ".[dev]"`) et `backend/Dockerfile` (liste explicite non épinglée, utilisée en production). Conséquence constatée : la CI et la production résolvent fastapi 0.162.0 / starlette 1.9.0 alors que le local est en 0.115.0 (ex. `HTTPBearer` renvoie 401 au lieu de 403 sans jeton ; le test `test_get_current_user_unauthorized` attend désormais 401). À faire dans une tâche dédiée : introduire un lockfile unique (uv ou pip-tools) utilisé par le local, la CI et Docker. D'ici là, mettre à jour les environnements locaux avec `pip install -e ".[dev]" --upgrade`.
- **`LotDetailModal.jsx`** : la formule du solde restant est dupliquée (imposée par l'ordre des hooks) ; à factoriser lors d'un refactor du composant.
- **E2, erreurs 422 non traduites** : le toast de repli anglais « Request validation failed » et les erreurs de parsing de date en anglais restent affichés sur les chemins 422 non couverts par `error_handlers.py`.
- **E2, migration 0017 : downgrade destructif** : `downgrade()` supprime les colonnes ajoutées au profil client ; après usage réel, un retour arrière entraîne une perte de données.
- **E2, ordre de déploiement** : déployer Railway (backend) puis Vercel (frontend) immédiatement après, car l'ancienne interface envoie `POST {name}`, qui reçoit un 422 sur le nouveau backend.

Dette relevée en fin d'E2 (revue finale, 2026-10-25) :
- ~~**PDF d'acte / reçu en erreur 500** si une adresse, une ville, un pays ou un nom contient un caractère hors latin-1 (apostrophe typographique ’ insérée par les claviers de téléphone, écriture arabe). Préexistant, plus probable avec les nouveaux champs. Correctif : police Unicode (DejaVuSans via `pdf.add_font`) dans `certificate_service.py`, ou au minimum remplacer ’‘“” avant impression. → planifié en **E4-T0** ([#49](https://github.com/migok/lotispro/issues/49)), première tâche d'E4.~~ **Résolu par E4-T0** : DejaVu Sans embarquée (`app/assets/fonts/`) + mise en forme du texte arabe via `uharfbuzz`.
- Badge « Actes » de la fiche client choisi par comparaison de chaînes (`ClientDetailPage.jsx`) : comparer la clé (`morocco`/`abroad`) serait plus robuste.
- Adresses héritées contenant déjà la ville : la ville apparaîtra deux fois après saisie de la ville (pas de migration de découpage, décision utilisateur).
- `pydantic_validation_handler` renvoie encore « Data validation failed » (anglais).

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
- **`DELETE /api/lots/{id}/documents/{doc_id}` sans contrôle de rôle** : `documents.py:78` appelle `document_service.py:181` `delete_document(user_role)` mais l'argument `user_role` n'est jamais utilisé ; n'importe quel utilisateur connecté peut supprimer les documents de n'importe quel lot.
- **Arguments inutilisés masqués par `ARG002`** (règle ignorée dans `pyproject.toml`, 10 occurrences via `ruff check . --isolated --select ARG002 --output-format concise` depuis `backend/`) :
  - `certificate_service.py:48` `reservation_id`
  - `document_service.py:181` `user_role` (voir anomalie ci-dessus)
  - `reservation_service.py:1117` `user_id` (`update_notaire_info`)
  - `reservation_service.py:1240` `data` (`unblock_lot`)
  - `project_service.py:1257` `user_id`
  - (mis à jour en E3-T1 : 5 occurrences restantes, les autres `user_id` sont désormais enregistrés dans `lot_status_history`)

Relevés lors de E3-T1 (`lot_workflow` + `lot_status_history`) :

- ✅ **Corrigé ([#50](https://github.com/migok/lotispro/issues/50)) — statut `sold` écrit par deux chemins hérités** : payer la dernière échéance (`PATCH /api/payments/installments/{id}` → `_auto_convert_to_sale` → `release_lot(lot.id, "sold")`) renvoyait une 500 (contrainte `valid_lot_status`), de même que `POST /api/sales`. Décision utilisateur : plus de conversion automatique — l'échéance est enregistrée, le lot reste `reservation_engagee`, le commercial utilise « Marquer soldé ». `POST /api/sales` (inutilisé par l'UI) est refusé en 400 (`use_transition_endpoint`). `release_lot` supprimé.
- **`PUT /api/lots/{id}` avec `status` depuis un statut du workflow** : auparavant seul le statut cible était contrôlé (`creation` / `available` / `blocked`), si bien qu'un lot en `option` (ou plus loin) pouvait être remis `available` ou `blocked` directement. La table `lot_workflow` (`direct_update` : depuis `creation`, `available`, `blocked` uniquement) refuse désormais ce cas (400, `invalid_lot_status`). Aucun test de caractérisation ne couvrait ce chemin.

## Recette E1 (plein écran)

Recette faite par l'utilisateur le 2026-10-24 sur http://localhost:5174 (branche `feature/e1-plein-ecran`, commit `210f9c2`), scénario : édition groupée en plein écran, désélection du dernier lot (pas de bande grise), fenêtre basse (~600 px, défilement), lot à compléter (avertissement puis succès), sortie par Échap, console sans erreur → **validé**.

| Mode | Navigateur principal de l'utilisateur | Firefox | Edge |
|---|---|---|---|
| Fenêtré standard | ✅ | non testé | non testé |
| Plein écran (bouton) | ✅ | non testé | non testé |
| Fenêtre basse (~600 px) | ✅ | non testé | non testé |
| Tablette 1024 px / écran large ≥ 1440 px | non testé séparément | non testé | non testé |

Safari : non testé (Windows).
