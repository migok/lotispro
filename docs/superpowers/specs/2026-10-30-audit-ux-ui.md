# Audit UX/UI — LotisPro (frontend)

Date : 2026-10-30 · Base auditée : `lot_webapp/` sur `dev` @ `46101cf` (E0–E5 inclus) · Phase 1 de la refonte, aucun code modifié.

## Méthode et limites

- Lecture du code : `App.jsx`, `GlobalDashboard.jsx`, `Dashboard.jsx`, `ProjectDetailPage.jsx`, `LotDetailModal.jsx`, `ClientsPage.jsx`, `styles.css`, `utils/formatters.js`, schéma API `backend/app/domain/schemas/dashboard.py`.
- Mesures automatiques sur `styles.css` et les composants (couleurs, tailles de police, styles inline, accessibilité) et calcul des contrastes WCAG des tokens.
- **Pas d'inspection visuelle** : aucun navigateur dans cette session et l'app demande une connexion. Les captures avant/après sont prévues en phase 5. Certains points de mise en page restent donc à confirmer à l'écran.
- Le chantier **E6** (`feature/e6-dashboard-periode`, plan prêt, pas encore codé) va découper `Dashboard.jsx` et refaire son graphique. Le dashboard projet est audité ici, mais sa refonte doit se faire **après E6**.

## Chiffres clés

| Mesure | Valeur |
|---|---|
| `styles.css` | 13 605 lignes (+ 1 614 pour `landing.css`) |
| CSS injecté en chaîne dans `GlobalDashboard.jsx` | ~500 lignes, 2ᵉ système de style |
| `style={{…}}` inline dans les composants | 546 (Dashboard 94, LotDetailModal 66, ProjectDetailPage 64) |
| Couleurs hex distinctes dans le CSS / `rgba()` | 80 / 532 |
| Couleurs hex codées en dur dans le JSX | 67 |
| Tailles de police distinctes | > 40 (de 0,57 rem à 2,2 rem) |
| Tailles < 0,7 rem (≈ 11 px) | 65 |
| Variantes de classes de bouton | 36 |
| `z-index` | de 1 à 99 999, sans échelle |
| Points de rupture responsive | 9 différents (480 → 1 200 px) |
| `div`/`tr` cliquables sans rôle ni clavier | 33 |
| `prefers-reduced-motion` | 0 |
| Plus gros fichiers | ProjectDetailPage 3 032 l., LotDetailModal 2 911 l., Dashboard 1 750 l. |

Contraste WCAG des tokens de texte (le minimum requis pour du texte courant est 4,5:1) :

| Token | Sombre (sur `--bg-primary` / `--bg-tertiary`) | Clair (sur `--bg-primary` / `--bg-tertiary`) |
|---|---|---|
| `--text-secondary` | 4,76 / **3,96** | 8,44 / 7,60 |
| `--text-muted` | **2,31 / 1,92** | **2,82 / 2,54** |
| `--color-primary` (or) | 7,67 / 6,39 | **3,47 / 3,12** |

## Tableau des problèmes

Gravité : 🔴 critique · 🟠 élevée · 🟡 moyenne · ⚪ faible

| # | Gravité | Domaine | Problème | Solution recommandée | Fichiers |
|---|---|---|---|---|---|
| 1 | 🔴 | Données | **Une erreur d'API s'affiche comme un zéro.** Le dashboard global charge ses 6 sources avec `Promise.allSettled` et ignore les échecs. Si `/stats` tombe, l'écran affiche « 0 MAD » de CA. Si `/alerts` tombe, il affiche « Aucune réservation à risque » avec une icône verte. Le `catch` ne se déclenche jamais. | Un état d'erreur par bloc (« — », message, bouton « Réessayer »). Ne jamais afficher un zéro sans réponse valide. | `GlobalDashboard.jsx:656-701` |
| 2 | 🔴 | Lisibilité | **Textes secondaires illisibles.** `--text-muted` a un contraste de 2,3:1 en sombre et 2,8:1 en clair. Il sert aux libellés de KPI, sous-titres et métadonnées, souvent en capitales de 10 à 11 px (`.stat-tile-label` 0,63 rem, `.gdb-tile-label` 0,74 rem). 65 déclarations sous 0,7 rem. | Remonter `--text-muted` à ≥ 4,5:1. Plancher typographique à 12 px pour les libellés et 14 px pour le texte courant. Moins de capitales. | `styles.css:17,7272`, `GlobalDashboard.jsx:143` |
| 3 | 🟠 | Couleur | **Le doré veut dire quatre choses à la fois.** La marque et le bouton principal (`--color-primary #d4973a`), le statut « réservé » (`#e8a93a`), l'avertissement (`#e8a93a`, identique) et l'option (`#f59e0b`) sont quasi identiques. Un badge doré ne se lit pas sans légende. | Réserver l'or à la marque, aux actions principales et aux chiffres clés. Une palette sémantique séparée pour les statuts et les alertes. | `styles.css:21-46` |
| 4 | 🟠 | Couleur | **Pipeline à 9 statuts difficile à distinguer.** Cinq bleus et cyans voisins (`soldee`, `edl-programme`, `edl-realise`, `edl-finalise`, `notaire`), plus un violet isolé (`engaged`). Les trois EDL ne se distinguent qu'à la nuance. | Regrouper par phase avec une couleur par phase (commercial, financier, EDL, notarial, livré) et des nuances contrôlées. Toujours accompagner la couleur d'un libellé. | `styles.css:28-37`, `utils/constants.js` |
| 5 | 🟠 | Architecture UI | **Quatre façons de styler en parallèle** : `styles.css` géant, CSS injecté par chaîne dans `GlobalDashboard`, 546 styles inline et 67 hex dans le JSX. 36 variantes de bouton (`gdb-btn`, `cp-btn-primary`, `cl-view-btn`…), deux familles de modales (`modal-*`, `cp-modal-*`). Toute retouche visuelle devient coûteuse et incohérente. | Centraliser les tokens. Créer des primitives réutilisables : Button, Card, Badge, StatTile, DataTable, EmptyState, Skeleton, Dialog/Sheet. Migrer page par page. | tous |
| 6 | 🟠 | Dashboards | **Trois onglets d'analyse redondants dans un projet** : « Tableau de bord », « KPIs » et « Performance ». CA réalisé, CA potentiel, CA ce mois, Ventes ce mois, Prix moyen / lot, Prix moyen / m², Total acomptes et CA objectif apparaissent à la fois dans `Dashboard.jsx` et dans `KPIsTab`. L'onglet s'appelle « Tableau de Bord » pour un manager et « Dashboard » pour un commercial. | Après E6 : un seul onglet « Pilotage » (période, KPI, évolution, stock, catégories), avec la performance des commerciaux en section. Supprimer `KPIsTab`. | `ProjectDetailPage.jsx:83-91,1317-1765,1803-2134`, `Dashboard.jsx` |
| 7 | 🟠 | Alertes | **Alertes non actionnables.** Les lignes « Réservations à risque », « Retards de paiement » et « Notaire » ne sont pas cliquables. La liste est coupée à 5 sans lien « Voir tout » ni total. Pas de montant cumulé des retards ni d'ancienneté. Le badge du panneau Notaire affiche toujours « Notaire ». | Lignes cliquables vers le lot, actions rapides (relancer, prolonger, ouvrir la fiche), total et montant cumulé en tête de panneau, tri par urgence, lien vers la liste complète. | `GlobalDashboard.jsx:1068-1222` |
| 8 | 🟠 | Dashboards | **Mêmes expirations à plusieurs endroits, formats différents.** La tuile « Alertes actives » répète le compteur du panneau « Réservations à risque ». « Suivi des options » existe dans le dashboard global et dans le dashboard projet. Une échéance dépassée s'affiche « Expiré » à un endroit, « +3j dépassé » à un autre, « J-1 critique » ailleurs. | Un seul composant « Échéances » réutilisé partout, une seule règle d'urgence (dépassé / ≤ 1 j / ≤ 3 j / plus tard) et un seul format. | `GlobalDashboard.jsx:809-831,878-958`, `Dashboard.jsx` |
| 9 | 🟠 | Formats | **Montants formatés de trois façons.** `formatPrice` donne « 1 250 000 MAD ». `formatCompactPrice` donne « 12.5M MAD » (point anglais, K/M). Le `fmtCurrency` local donne « 1000K MAD » pour 999 999 (bug d'arrondi) et « 1.0M MAD ». Les montants compacts n'ont pas d'infobulle avec la valeur exacte. 25 appels `toLocale*` dispersés pour les dates. | Un seul formateur `Intl` fr-MA (« 12,5 M MAD »), compact uniquement dans les tuiles avec la valeur exacte au survol. Un seul formateur de date. | `utils/formatters.js:41-55`, `GlobalDashboard.jsx:523-533` |
| 10 | 🟠 | Clients | **Le portefeuille ne tient pas à l'échelle.** Tous les clients sont chargés d'un coup, en cartes empilées (avatar, badges, 3 mini-stats, barre de CA) : environ 6 à 8 clients par écran, sans pagination ni colonnes triables. Le classement « Meilleurs clients » répète la liste. | Tableau dense et triable (nom, statut pipeline, téléphone cliquable, réservations, achats, acompte, total) avec filtres en barre, pagination et aperçu latéral. Le pipeline devient une barre empilée cliquable qui filtre la liste. | `ClientsPage.jsx:157-469` |
| 11 | 🟠 | Accessibilité | **Navigation clavier cassée et aides invisibles.** 33 cartes ou lignes cliquables (`div`/`tr` + `onClick`) ne sont pas atteignables au clavier. Les explications des KPI passent par `title` sur « ⓘ », invisibles au toucher et pour les lecteurs d'écran. Seulement 4 règles `:focus-visible`. Animations décalées sans `prefers-reduced-motion`. | Vrais liens ou boutons, focus visible global, infobulles accessibles, réduction des animations respectée. | `GlobalDashboard.jsx:1000`, `ClientsPage.jsx`, `styles.css` |
| 12 | 🟡 | Thème clair | 26 `color: white` en dur (dont `.kpis-hero-value`) qui cassent le thème clair. L'or clair `#b87728` n'atteint que 3,5:1 sur fond blanc, insuffisant pour du texte. | Tokens « texte sur accent » et « or texte » distincts de l'or décoratif. | `styles.css:4095` et suiv. |
| 13 | 🟡 | Typographie | Pas d'échelle typographique (plus de 40 tailles). Les chiffres sont tantôt en Cormorant Garamond (classe `.num`, KPI Clients), tantôt en DM Sans (tuiles du dashboard). Le conflit vient de l'ordre d'injection du CSS. Une serif d'affichage à petite taille nuit aux chiffres. | Échelle à 7 niveaux. Cormorant réservée aux titres de page. Tous les chiffres en DM Sans avec chiffres tabulaires. | `styles.css:7253,7431`, `GlobalDashboard.jsx:134` |
| 14 | 🟡 | Dashboard global | Les KPI apportent peu de décision. « Projets actifs » répète sa valeur en sous-titre (« 3 projets assignés »). « Lots libérés » (annulations et expirations) est mis au même niveau que le CA, en violet codé en dur. Les 9 statuts renvoyés par `/stats` (`counts.*`) ne sont pas affichés alors que la donnée existe. Pas d'encaissements ni de comparaison dans le temps (E6 l'apporte pour le projet). | Voir la structure proposée plus bas. | `GlobalDashboard.jsx:752-854` |
| 15 | 🟡 | Données (à vérifier) | Sur les cartes projet, la disponibilité est recalculée côté navigateur (`total - sold - reserved`). Ce calcul ignore les lots bloqués et une partie des 9 statuts, et « % vendus » ne compte que `sold`. Le chiffre affiché peut différer de `/stats`. | Faire calculer ces valeurs par l'API (comptes par statut) plutôt que par le navigateur. À confirmer avec les données réelles. | `GlobalDashboard.jsx:994-998` |
| 16 | 🟡 | Actions | Les actions rapides du header doublonnent la sidebar (« Clients », « Commerciaux »). « Nouveau projet » mène à la liste des projets au lieu d'ouvrir la création. Les trois boutons ont le même style principal, donc rien n'est prioritaire. | Une seule action principale, qui ouvre directement le formulaire de création. | `GlobalDashboard.jsx:731-748` |
| 17 | 🟡 | Interactions | Deux `confirm()` natifs (libérer un lot, retirer un commercial). La fiche lot est une modale unique de 2 911 lignes à trois panneaux. | Dialogue de confirmation maison, fiche lot en panneau latéral large (Sheet) ou en page dédiée. | `Dashboard.jsx:208`, `AssignCommercialsModal.jsx:56`, `LotDetailModal.jsx` |
| 18 | 🟡 | Chargement | Skeletons sur le dashboard global, mais simple texte « Chargement… » ou spinner ailleurs (4 fois dans ProjectDetailPage, Clients, Managers). | Skeleton générique qui reprend la forme du contenu. | `ProjectDetailPage.jsx:531,1371,1872,2265`, `ClientsPage.jsx` |
| 19 | 🟡 | Surfaces | Ombres noires lourdes (`rgba(0,0,0,.5–.65)`) sur fond navy, 92 `box-shadow`, `transition: all` 58 fois, `z-index` jusqu'à 99 999. | Niveaux de surface par la couleur de fond plutôt que par l'ombre, ombres teintées discrètes, échelle de `z-index`, transitions ciblées. | `styles.css:66-69` |
| 20 | 🟡 | Responsive | 9 points de rupture différents. Mise en page tablette et mobile à vérifier à l'écran. Le bouton de menu mobile utilise les caractères « ☰ » et « ✕ ». | 3 points de rupture (640 / 1024 / 1280), icônes SVG. | `styles.css`, `App.jsx:160` |
| 21 | 🟡 | Sidebar | Le rôle s'affiche en brut (« MANAGER », « COMMERCIAL »), « v2.0 » est codé en dur, le bloc utilisateur est stylé en inline. | Libellé français du rôle, bloc utilisateur compact avec menu. | `App.jsx:205-241` |
| 22 | ⚪ | Contenu | Majuscule à chaque mot (« Tableau de Bord », « CA Réalisé », « Prix Moyen / Lot »). En français, seule la première lettre prend une majuscule. | Harmoniser les libellés. | multiples |
| 23 | ⚪ | Code | Entités HTML (`&eacute;`) mélangées à l'UTF-8 dans le JSX. 39 emojis, dont 🥇🥈🥉 dans le classement des commerciaux. | UTF-8 partout, icônes SVG cohérentes. | `ProjectDetailPage.jsx:1857-1859` |
| 24 | ⚪ | Couleur | Gris froids et ombres chaudes mélangés en thème clair (sidebar teintée lin, ombres brun). | Une seule famille de gris par thème. | `styles.css:86-148` |

## Dashboard général : structure proposée (données existantes uniquement)

1. **Bandeau de 4 KPI** :
   - CA réalisé, avec le CA potentiel en secondaire (`ca_realise`, `ca_potentiel`)
   - Stock disponible, en nombre et en % du total (`counts.available`, `counts.total`, `percentages.available`)
   - Taux de vente (`taux_vente`)
   - Retards de paiement, en nombre et en montant cumulé (somme de `late-payments.amount_due`)
2. **Répartition des lots par statut** : barre empilée horizontale sur les 9 statuts plus « bloqué », groupés par phase (`counts.*`). Cliquer sur un segment ouvre la liste filtrée.
3. **À traiter maintenant** : un seul panneau d'échéances fusionnant options et réservations qui expirent, retards de paiement et passages chez le notaire. Tri par urgence, actions sur chaque ligne.
4. **Projets** : tableau compact ou cartes plus denses (avancement, disponibles, CA), avec les comptes calculés côté serveur.
5. **Évolution commerciale** : graphique temporel une fois E6 livré (`/performance` avec période).

Retirés ou rétrogradés : « Projets actifs » (déjà visible dans la section Projets), « Lots libérés » (déplacé dans la répartition par statut), la tuile « Alertes actives » (remplacée par le panneau « À traiter »).

## Découpage proposé de la refonte

| Lot | Contenu | Problèmes traités | Dépend de |
|---|---|---|---|
| **1. Fondations** | Tokens (couleurs sémantiques, contraste, typographie, espacements, surfaces, `z-index`, points de rupture), Tailwind v4 et shadcn/ui configurés sur ces tokens, formateurs uniques (monnaie, date), focus visible et réduction des animations | 2, 3, 4, 9, 12, 13, 19, 22 | — |
| **2. Primitives** | Button, Badge de statut, StatTile, Card, DataTable, EmptyState, Skeleton, Dialog, Sheet, infobulle accessible, confirmation maison | 5, 11, 17, 18 | Lot 1 |
| **3. Shell et dashboard global** | Sidebar, header, nouvelle structure du dashboard global, panneau « À traiter », gestion des erreurs | 1, 7, 8, 14, 15, 16, 20, 21 | Lot 2 |
| **4. Clients** | Tableau du portefeuille, filtres, pipeline cliquable, fiche client | 10 | Lot 2 |
| **5. Projet et lots** | Fusion des onglets d'analyse en « Pilotage », liste des lots, fiche lot en panneau latéral | 6, 17 | Lot 2 **et E6 mergé** |
| **6. Validation** | Captures avant/après (desktop, tablette, mobile), contrôles de contraste, recette utilisateur | tous | chaque lot |

## Décisions à valider

1. **Bibliothèque** : shadcn/ui + Recharts (recommandé) ou Ant Design.
2. **Ordre avec E6** : terminer E6 avant la refonte (recommandé), ou lancer le lot 1 en parallèle (risque de conflits modéré dans `styles.css`).
3. **Fiche lot** : panneau latéral large ou page dédiée `/app/projects/:id/lots/:lotId`.
4. **Thème clair** : à conserver et à corriger, ou à abandonner au profit du seul thème sombre.
