# Correctif — KPI sur les statuts E3 et montants encaissés (2026-11-07)

Branche `fix/kpis-statuts-encaisse` (depuis `dev` 3f9bf58). Hors roadmap ; prépare le lot 5 de la refonte UI.

## Constat

- Les KPI projet cherchent les statuts de lot `sold` / `reserved`, supprimés en E3 : lots vendus / réservés,
  taux de vente / réservation, surfaces, prix moyens = 0. La liste des projets compte `reserved` = 0.
- « En cours » du tableau de bord inclut `chez_proprietaire`, déjà compté dans « Chez le propriétaire ».
- Les « acomptes » additionnent `reservations.deposit` (acompte d'option), et le total projet ne garde que le
  statut `validated` (ancien circuit de paiement) : les encaissements E4 (`reservation_payments`) sont ignorés.

## Décisions (utilisateur, 2026-11-07)

1. Un lot est **vendu** quand il est `chez_proprietaire`. Les statuts `option` → `chez_notaire` sont **en cours**
   (« Réservés » des KPI projet et de la liste des projets).
2. Le montant affiché est **l'encaissé** de la réservation, libellé « Encaissé » :
   - réservation engagée (prix total convenu renseigné ou encaissements présents) : somme de `reservation_payments` ;
   - sinon (option, à finaliser, ancienne réservation) : acompte d'option + garantie.
3. La carte projet « Total Acomptes » devient l'encaissé des **réservations en cours** (statut `active` /
   `validated`, non soldées).

Hors périmètre : définition unique du CA (lot 5), branche commerciale de `/dashboard/stats`.

## Tâches

1. **Domaine** — `lot_workflow.IN_PROGRESS_STATUSES`, `DELIVERED_STATUS` ; expression SQL unique
   `amount_received_expr()` (encaissé d'une réservation).
2. **KPI projet** (`ProjectService.get_project_kpis` et filtre commercial) — compteurs, surfaces, taux,
   prix moyens calculés sur les ventes des lots chez le propriétaire, encaissé des réservations en cours.
3. **Liste des projets** — `sold_lots` = chez le propriétaire, `reserved_lots` = en cours, nouveau
   `available_lots` ; `ProjectsPage` l'utilise au lieu de le recalculer.
4. **Tableau de bord** — `en_cours` sans `chez_proprietaire` ; « Acomptes » des commerciaux et du pipeline
   clients = encaissé.
5. **Fiche client** — `amount_received` par réservation, `total_deposit` = encaissé ; front : libellés
   « Encaissé ».

Chaque tâche : test d'intégration d'abord (rouge), puis code ; ruff + pytest + eslint + vitest verts.

## Suivi

- `finaliser_engage` ne reprend pas l'acompte d'option dans les encaissements (seule la garantie) : à trancher.
- Conflit attendu avec `feature/ui-clients` (lot 4) sur `ClientsPage.jsx` / `ClientDetailPage.jsx` (libellés).
