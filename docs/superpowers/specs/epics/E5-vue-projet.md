# E5 — 📊 #3 Vue projet : grille type de lot × statut

**Design parent :** [roadmap design](../2026-10-22-roadmap-lotispro-design.md) §5 E5
**Ticket Asana :** 📊 [FEATURE #3] (1214275786423605) + sous-tâches 1214275625757827 (grille), 1214275786467747 (navigation), 1214275927333186 (filtres)
**Dépend de :** E3 (statuts actifs du projet)

## Périmètre

### E5-T1 Endpoint matrice
- `GET /api/v1/projects/{id}/lots-matrix` → `{ statuses: [<statuts actifs ordonnés>], rows: [{ type_lot, counts: {status: n}, total }], totals: {status: n}, grand_total }`.
- Lots sans `type_lot` regroupés sous « Non renseigné ».
- Commercial : voit le projet seulement s'il y est affecté (règle d'accès existante).
- Requête unique `GROUP BY type_lot, status`.

### E5-T2 Onglet « Lots »
- Nouvel onglet dans `ProjectDetailPage`, composant dans `components/project/LotsTab.jsx` (+ `LotsMatrix.jsx`, `LotsList.jsx`).
- Grille : lignes = types, colonnes = statuts actifs, cellules colorées (couleurs de `utils/constants.js`), totaux ligne/colonne/général.
- Clic cellule → liste filtrée (type + statut) ; clic total colonne → filtre statut seul.
- Clic lot → `LotDetailModal` existant ; fermeture → retour à la même liste filtrée.
- Rafraîchissement après toute transition faite depuis le modal.
- Responsive : défilement horizontal de la grille sur tablette.

### E5-T3 Filtres
- Statut (multi), type de lot, recherche par numéro ; bouton « Réinitialiser » ; badge « N filtres ».
- Persistés dans `sessionStorage` par projet (clé `lotsFilters:<projectId>`).

## Critères d'acceptance (ticket Asana)
- [ ] Vue accessible depuis la page projet ; types de lots dynamiques.
- [ ] Compteurs par statut avec code couleur ; totaux par type et global.
- [ ] Compteurs à jour après une transition.
- [ ] Chaque lot cliquable ; détail sans rechargement ; retour avec le même filtre.
- [ ] Filtres instantanés ; réinitialisation ; indicateur du nombre de filtres actifs.
- [ ] Affichage correct desktop et tablette.
