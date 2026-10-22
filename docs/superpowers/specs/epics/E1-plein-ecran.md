# E1 — 🐛 #5 Métadonnées en plein écran (fin)

**Design parent :** [roadmap design](../2026-10-22-roadmap-lotispro-design.md) §5 E1
**Spec technique existante :** [2026-07-04-fullscreen-metadata-edit-fix-design.md](../2026-07-04-fullscreen-metadata-edit-fix-design.md)
**Plan existant :** [2026-07-04-fullscreen-metadata-edit-fix.md](../../plans/2026-07-04-fullscreen-metadata-edit-fix.md) — tâche 1 faite (`5b4a4bb`), tâches 2 et 3 restantes
**Ticket Asana :** 🐛 [BUG #5] (1214275625722583) + sous-tâches 1214275786530718, 1214275895069252, 1214275786541186
**Dépend de :** E0

## Périmètre

### E1-T1 Carte flexible en plein écran (= tâche 2 du plan existant)
- `.carte-fullscreen` : `overflow-y: auto` de secours ; sélecteur mort `.carte-filters` remplacé par `.map-filters-v2`.
- `.carte-map-container` : hauteur en `flex: 1; min-height` en plein écran ; la hauteur inline fixe
  `calc(100vh - 120px)` (`ProjectDetailPage.jsx:1121`) n'est plus appliquée en plein écran.
- `mapRef.current.invalidateSize()` appelé quand la barre de sélection ou le panneau d'édition groupée apparaît / disparaît.
- Test Vitest : en plein écran, le style inline de hauteur n'est pas appliqué au conteneur.

### E1-T2 Recette et non-régression (= tâche 3 du plan existant + sous-tâche Asana « Tests de non-régression »)
Grille de test complétée dans `AVANCEMENT.md` :

| Mode | Chrome | Firefox | Edge |
|---|---|---|---|
| Fenêtré standard | | | |
| Plein écran (F11 et bouton) | | | |
| Tablette 1024 px | | | |
| Écran large ≥ 1440 px | | | |

Pour chaque case : édition individuelle (`LotDetailModal`) et édition groupée (`BulkMetadataModal`) enregistrent, toast visible, boutons cliquables.
Safari : non testable sous Windows → noté « non testé » (choix de Claude).

## Critères d'acceptance
- [ ] Le formulaire s'affiche correctement en plein écran ; tous les champs sont éditables.
- [ ] Boutons de validation visibles et cliquables ; toasts visibles.
- [ ] Aucune régression en mode non plein écran.
- [ ] Grille de test remplie et commitée.
