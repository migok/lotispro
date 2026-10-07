# Fix: édition des métadonnées inutilisable en mode plein écran (Carte)

## Contexte

Sur l'onglet Carte de `ProjectDetailPage.jsx`, le mode plein écran (`isFullscreen`) utilise l'API navigateur `requestFullscreen()` sur `carteTabRef` (avec fallback CSS `.carte-fullscreen` si l'API échoue). `LotDetailModal` et `BulkMetadataModal` (édition groupée) sont déjà rendus à l'intérieur de `carteTabRef`, donc dans le sous-arbre DOM de l'élément fullscreen — ce n'est pas un problème de portail/positionnement de ces composants eux-mêmes.

Deux bugs distincts et indépendants ont été identifiés comme cause du symptôme rapporté ("le panneau d'édition n'est pas visible / les modifications semblent ne pas s'appliquer en plein écran") :

### Bug 1 — Feedback utilisateur invisible en plein écran

`ToastProvider` est monté à la racine de l'app dans `App.jsx` (au-dessus du `BrowserRouter`/`AuthProvider`), et son `ToastContainer` (`position: fixed`, `z-index: 9999`) est donc rendu **hors** du sous-arbre de `carteTabRef`.

La spec Fullscreen API du navigateur ne peint que l'élément fullscreen et ses descendants ; tout ce qui est hors de ce sous-arbre devient invisible tant que le fullscreen est actif, quel que soit son `z-index` ou son `position: fixed`.

Conséquence concrète : `handleCompleteLot` (édition individuelle, `LotDetailModal.jsx`) valide les champs requis (`price_per_sqm`, `surface`) et déclenche `toast.warning(...)` si invalide — invisible en plein écran, donnant l'impression qu'un clic sur "Sauvegarder" ne fait rien. Les toasts de succès (`toast.success`) disparaissent aussi, supprimant toute confirmation positive.

### Bug 2 — Le panneau d'édition groupée déborde du conteneur fullscreen sans recours au scroll

En plein écran, `.carte-fullscreen` devient `position: fixed` (`top/left/right/bottom: 0`, donc hauteur = exactement `100vh`) avec `display: flex; flex-direction: column`, mais :

- **Classe CSS morte** : la règle `.carte-fullscreen .carte-filters { flex-shrink: 0; }` ([styles.css:874](../../../frontend/src/styles.css)) ne s'applique jamais — le JSX utilise `className="map-filters-v2"` ([ProjectDetailPage.jsx:866](../../../frontend/src/components/ProjectDetailPage.jsx)), pas `.carte-filters`.
- **Hauteur de carte figée** : `.carte-map-container` a une hauteur inline fixe `calc(100vh - 120px)` ([ProjectDetailPage.jsx:1121](../../../frontend/src/components/ProjectDetailPage.jsx)), calculée pour laisser de la place uniquement à l'en-tête de filtres. Elle ne tient pas compte de la `selection-action-bar` ni du panneau `BulkMetadataModal` (`inline`) qui s'affichent tous deux au-dessus de la carte en mode sélection.
- **Pas de scroll de secours** : `.carte-fullscreen` n'a pas de `overflow-y: auto`. Un conteneur `position: fixed` sans overflow scrollable rend tout contenu qui dépasse sa hauteur physiquement inaccessible (pas de scroll de page possible sur un élément fixed).

Résultat : dès que filtres + barre de sélection + panneau d'édition dépassent l'espace vertical restant après la réservation faite pour la carte, le panneau déborde hors du conteneur fixe et devient invisible/inaccessible — exactement le symptôme observé (capture d'écran fournie par l'utilisateur montrant le panneau correctement affiché en mode normal, absent en plein écran).

## Périmètre

- **Inclus** : `ToastContext.jsx` (portail dynamique), layout flex de `.carte-fullscreen` / `.carte-map-container` dans `styles.css`, ajustement `invalidateSize()` de la carte dans `ProjectDetailPage.jsx`.
- **Exclu** : audit des autres overlays globaux (ex. widget assistant IA) — hors périmètre de ce fix, à traiter séparément si un besoin similaire est identifié plus tard.
- **Exclu** : comportement en mode non-fullscreen — déjà correct (page scrollable normale), aucun changement nécessaire.

## Design

### Fix 1 — Portail dynamique du ToastContainer

`ToastProvider` (`ToastContext.jsx`) :

- Ajoute un state interne `fullscreenTarget` (élément DOM ou `null`), mis à jour par un listener sur `fullscreenchange` / `webkitfullscreenchange` / `msfullscreenchange` (même pattern que celui déjà utilisé dans `ProjectDetailPage.jsx`), enregistré une seule fois au montage du provider.
- Rend `ToastContainer` via `createPortal(toastContainerJSX, fullscreenTarget ?? document.body)`.
- Aucun changement à l'API publique (`useToast()`, `addToast`, `removeToast`, `success/error/warning/info`) — changement purement interne au point de rendu.

Aucune modification CSS nécessaire : `.toast-container` reste `position: fixed`, qui se positionne par rapport au viewport quel que soit son ancêtre DOM (aucun ancêtre du sous-arbre carte n'a de `transform`/`filter` créant un containing block différent).

### Fix 2 — Layout flex adaptatif de la carte en plein écran

Dans `styles.css` :

- Remplacer la règle morte `.carte-fullscreen .carte-filters { flex-shrink: 0; }` par le bon sélecteur `.carte-fullscreen .map-filters-v2 { flex-shrink: 0; }` (l'en-tête de filtres ne doit jamais rétrécir).
- `.carte-fullscreen .carte-map-container` : passer de hauteur fixe à `flex: 1; min-height: 0;` pour qu'elle absorbe dynamiquement l'espace restant, quel que soit le nombre d'éléments affichés au-dessus (filtres, barre de sélection, panneau d'édition groupée).
- Ajouter `overflow-y: auto;` sur `.carte-fullscreen` en filet de sécurité, au cas où le contenu (filtres + panneaux, sur un très petit viewport) dépasse malgré tout la hauteur disponible.

Dans `ProjectDetailPage.jsx` :

- Retirer le calcul inline `height: isFullscreen ? 'calc(100vh - 120px)' : 'calc(100vh - 300px)'` pour la variante fullscreen (laisser le CSS `flex:1` gérer la hauteur) ; conserver `calc(100vh - 300px)` pour le mode non-fullscreen (page normale, inchangé).
- Ajouter un `useEffect` déclenchant `mapRef.current.invalidateSize()` quand `selectionMode` ou `showBulkEdit` changent (même pattern que l'effet existant sur `showFilters`, lignes 750-758), pour que Leaflet recalcule la taille de la carte quand son conteneur change de hauteur suite à l'apparition/disparition de la barre de sélection ou du panneau d'édition groupée.

### Cas limites

- Sortie du plein écran : le portail des toasts bascule vers `document.body` sans perte d'état (les toasts vivent dans le state du provider, indépendant de leur cible de rendu).
- Fallback CSS-only (`requestFullscreen()` échoue, `toggleFullscreen` bascule sur la classe `.carte-fullscreen` sans API navigateur réelle) : `document.fullscreenElement` reste `null`, donc les toasts restent sur `document.body` — comportement correct puisque rien n'est réellement masqué par le navigateur dans ce cas ; le fix de layout flex (Fix 2) s'applique quand même via la classe CSS, qui est active dans les deux cas (API native ou fallback).
- Un seul élément fullscreen existe actuellement dans l'app (`carteTabRef`) — pas de logique multi-cible à prévoir.
- Mode non-fullscreen : aucune régression attendue, la hauteur `calc(100vh - 300px)` et le scroll de page normal sont inchangés.

## Tests / validation manuelle

1. Onglet Carte → mode plein écran (bouton ou double-clic sur la carte) → activer le mode sélection (manager) → sélectionner des lots → cliquer "Modifier" : le panneau `Modifier les métadonnées` doit être entièrement visible, sans avoir besoin de scroller, et la carte doit occuper le reste de l'espace disponible.
2. Modifier un ou plusieurs champs (`type_lot`, `emplacement`, `type_maison`) et cliquer "Appliquer" : la mise à jour doit réussir et un toast de succès doit être visible en plein écran.
3. Ouvrir un lot individuel en plein écran, passer en mode `complete_lot`, soumettre sans `price_per_sqm` ni `surface` : le toast d'avertissement de validation doit être visible en plein écran (pas juste silencieusement ignoré).
4. Sortir du plein écran (Échap ou bouton) : vérifier que les toasts et le panneau d'édition s'affichent normalement comme avant ce fix (pas de régression).
5. Redimensionner la fenêtre / tester sur un petit viewport en plein écran avec filtres + sélection + panneau tous ouverts simultanément : si l'espace est insuffisant, `overflow-y: auto` doit permettre de scroller pour tout voir plutôt que de masquer silencieusement du contenu.
