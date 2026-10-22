# E6 — 📅 #4 Tableau de bord par période

**Design parent :** [roadmap design](../2026-10-22-roadmap-lotispro-design.md) §5 E6
**Ticket Asana :** 📅 [FEATURE #4] (1214275895083551) + sous-tâches 1214275625660819 (sélecteur), 1214275786504270 (KPIs), 1214275895136974 (export)
**Dépend de :** E3 (`lot_status_history`)

## Définitions des KPIs

| KPI | Famille | Calcul sur [date_from, date_to] |
|---|---|---|
| Lots vendus | flux | lots arrivés en `reservation_engagee` dans la période (date d'engagement de la réservation) |
| CA | flux | somme des `sale_price` (ou prix du lot) de ces lots |
| Réservations créées | flux | réservations dont `reservation_date` est dans la période (toutes étapes) |
| Taux de conversion | flux | lots vendus / réservations créées (0 si aucune) |
| Lots disponibles | état | nombre de lots `available` à `date_to` |
| Lots en option | état | nombre de lots `option` à `date_to` |

- Variation : même KPI sur la période précédente de même durée, en %, `null` si la valeur précédente vaut 0.
- KPIs d'état à une date passée : reconstruits depuis `lot_status_history` ; si `date_to` est antérieure au
  premier enregistrement d'historique, l'API renvoie `state_kpis_available: false` et l'UI affiche « disponible
  à partir du <date> ».
- Bornes inclusives, fuseau Africa/Casablanca.

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
- `GET /dashboard/export?project_id=&date_from=&date_to=` → `.xlsx` (`openpyxl`), feuilles « KPIs » et « Lots ».
- Nom : `dashboard_<slug-projet>_<date_from>_<date_to>.xlsx`.
- Bouton « Exporter » sur le tableau de bord, téléchargement immédiat.

## Critères d'acceptance (ticket Asana)
- [ ] Sélecteur de période visible en haut ; raccourcis fonctionnels ; période active affichée.
- [ ] Tous les KPIs et graphiques filtrés par la période ; variation vs période précédente.
- [ ] Skeleton pendant le chargement ; données cohérentes avec les rapports détaillés.
- [ ] Export avec colonnes et valeurs affichées ; nom de fichier avec la période.
