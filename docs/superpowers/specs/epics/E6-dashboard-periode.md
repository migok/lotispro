# E6 — 📅 #4 Tableau de bord par période

**Design parent :** [roadmap design](../2026-10-22-roadmap-lotispro-design.md) §5 E6
**Ticket Asana :** 📅 [FEATURE #4] (1214275895083551) + sous-tâches 1214275625660819 (sélecteur), 1214275786504270 (KPIs), 1214275895136974 (export)
**Dépend de :** E3 (`lot_status_history`)

## Définitions des KPIs

> Révisées le 2026-10-30 (validées par l'utilisateur) après E3 / E4 : la réservation n'a pas de date
> d'engagement (seul `lot_status_history` la porte), `reservation.sale_price` est devenu le **prix acte**
> et la vente (`sales`) n'est créée qu'au solde.

| KPI | Famille | Calcul sur [date_from, date_to] |
|---|---|---|
| Lots vendus | flux | réservations distinctes dont le lot est entré en `reservation_engagee` dans la période (`lot_status_history.to_status = 'reservation_engagee'`, `changed_at`) ; un blocage / déblocage ultérieur ne retire pas la vente de sa période |
| CA | flux | somme du **prix total convenu** (`reservations.agreed_total_price`, valeur actuelle) de ces réservations ; réservation engagée avant E4 (sans prix convenu) → prix catalogue du lot (`lots.price`, 0 si absent) |
| Réservations créées | flux | réservations dont `reservation_date` est dans la période (toutes étapes, y compris annulées depuis) |
| Taux de conversion | flux | lots vendus / réservations créées × 100 (0 si aucune) ; pas une cohorte, peut dépasser 100 % |
| Encaissements | flux | somme des `reservation_payments.amount` dont `paid_on` est dans la période (versements reçus depuis E4) |
| Lots disponibles | état | nombre de lots `available` à `date_to` (niveau projet, sans filtre commercial) |
| Lots en option | état | nombre de lots `option` à `date_to` (niveau projet, sans filtre commercial) |

- Filtres : projet par `lots.project_id` (encaissements et réservations : `reservations.project_id`) ; commercial
  (`user_id`) par `reservations.reserved_by_user_id` pour les KPIs de flux.
- Variation : même KPI sur la période précédente de même durée (jours), en %, `null` si la valeur précédente
  vaut 0 ou si les flux de la période précédente ne sont pas disponibles.
- `history_start` = date (Casablanca) du premier enregistrement de `lot_status_history`, `null` si vide.
  - KPIs d'état : `state_kpis_available = history_start is null or date_to >= history_start or date_to >= aujourd'hui` ;
    sinon l'UI affiche « Situation des lots disponible à partir du <date> ».
  - Lots vendus, CA, conversion : `flow_kpis_available = history_start is null or date_from >= history_start` ;
    sinon « Ventes, CA et conversion disponibles à partir du <date> ». Réservations créées et encaissements
    restent affichés.
- Bornes inclusives, fuseau Africa/Casablanca (`settings.REMINDER_TIMEZONE`, repli UTC si la base des fuseaux manque).
- Les cartes cumulées existantes (CA réalisé, CA potentiel, prix moyens, acomptes, objectif) restent, étiquetées
  « à ce jour », sans filtre de période ; seules « Ventes ce mois » et « CA ce mois » sont remplacées. Les listes
  opérationnelles (alertes, options, retards, table des lots, clients, répartition par catégorie) restent la
  situation du jour.

## Périmètre

### E6-T1 Backend
- Paramètres `date_from`, `date_to` (ISO date, défaut = mois en cours) sur `GET /dashboard/stats` et `/dashboard/performance`, avec `project_id`.
- Réponse : `{ period, previous_period, flow: {...}, flow_previous: {...}, state: {...}, state_kpis_available }`.
- Refus 422 si `date_from > date_to`.

### E6-T2 Frontend
- Composant `components/dashboard/PeriodPicker.jsx` : date début / fin + raccourcis Aujourd'hui, Cette semaine, Ce mois, Ce trimestre, Cette année.
- Période active affichée en permanence ; conservée en `sessionStorage`.
- KPIs + graphiques recalculés ; skeleton pendant le chargement ; variation affichée (▲/▼ %).
- `Dashboard.jsx` (1 964 l.) découpé : `PeriodPicker`, `KpiCards`, `MonthlyChart`, sections existantes extraites.

### E6-T3 Export Excel
- `GET /dashboard/export?project_id=&date_from=&date_to=` → `.xlsx` (`openpyxl`), feuilles « KPIs » et « Lots »
  (« Lots » = lots vendus sur la période, une ligne par réservation engagée).
- Nom : `dashboard_<slug-projet>_<date_from>_<date_to>.xlsx`.
- Bouton « Exporter » sur le tableau de bord, téléchargement immédiat.

## Critères d'acceptance (ticket Asana)
- [ ] Sélecteur de période visible en haut ; raccourcis fonctionnels ; période active affichée.
- [ ] Tous les KPIs et graphiques filtrés par la période ; variation vs période précédente.
- [ ] Skeleton pendant le chargement ; données cohérentes avec les rapports détaillés.
- [ ] Export avec colonnes et valeurs affichées ; nom de fichier avec la période.
