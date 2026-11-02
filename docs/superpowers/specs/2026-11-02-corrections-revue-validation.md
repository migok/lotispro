# Corrections de revue — PR #58, #59 et #60

Source : [consignes de revue](2026-11-02-codex-corrections-revue-pr-58-59-60.md). Travail dans lot_webapp-ui, sans modification backend, sans rebase/amend/force-push. PR conservées en brouillon ; lot 4 exclu.

## #58

58.1 : Livré est olive (#c2dc78 / #4a6216) et Disponible reste émeraude. Trois tests de régression échouaient (11 couleurs au lieu de 12) ; ils vérifient maintenant l’unicité des 12 couleurs Leaflet et des tokens résolus dans les deux thèmes. 58.2 : convention officielle Tailwind v4 + shadcn/Radix + Recharts, primitives communes, formats uniques et tableau des 12 statuts alignés sur les constantes et tokens. Le document humain est relu contre ces sources ; pas de test artificiel qui recherche des phrases.

Vérification avant push : lint code 0, aucune erreur ; 47 fichiers / 589 tests verts, 234,55 s ; build code 0, 10,77 s. Les avertissements historiques jsdom/navigation et chunk principal sont conservés. Recette à l’écran à effectuer après correction de la pile.

## #59 et #60

Corrections et résultats à compléter sur leurs branches, puis tableau final point → commit → régression → vérification à l’écran. Priorité du lot #60 : 60.1 avant les autres corrections.

## #59 — corrections et contrôles

Merge de #58 : 66dd36a, correction source 1e9a022. Conflit limité à AVANCEMENT résolu en conservant le lot 2 en revue et les 589 tests de #58.

59.1 : liens natifs couvrant cartes et classement Clients, frères des aides de montant pour éviter toute imbrication interactive ; focus visible sur la surface complète. Régression rouge sur les anciens liens limités au nom, puis clic et activation clavier vers /app/clients/12 vérifiés.

59.2 : Amount et InfoTip communs, 20 blocs de montants et 21 aides migrés. Amount affiche le compact sans espace initial et expose l’exact en aria-label et en infobulle. Deux tests échouaient sur les primitives encore vides avant leur implémentation ; passage ciblé 12 tests verts. Pas de nouvelle dépendance.

Avant push : lint code 0 ; 50 fichiers / 617 tests verts (254,14 s) ; build code 0 (12,64 s). Le gros chunk et les avertissements historiques de tests restent documentés. CLAUDE.md liste aussi Amount et InfoTip. Recette à l’écran à effectuer après la pile.

## #60 — corrections et contrôles

Merge de #59 : 9af2b88 (correction 2d8dcc9 et merge 66dd36a). Conflits résolus dans AVANCEMENT (états des trois lots conservés) et GlobalDashboard (nouvel écran du lot 3 conservé ; les aides copiées de l’ancien écran ont déjà disparu). Correction 60.1 effectuée en premier après les merges, puis 60.2 à 60.6. Correctif frontend : **2d04094**.

- **60.1** : DashboardLot utilise `fetchProjectLots`, donc le même GeoJSON et `lotFromFeature` que l’onglet Lots. Plus de jointure limitée aux réservations actives ni d’exigence `reservation_id === current_reservation_id`. Régression initiale : six états avancés échouaient ; les sept états testés s’ouvrent maintenant, y compris available.
- **60.2** : le dernier lot reste affiché pendant le rechargement et ses props sont remplacées à réception. Le composant reste monté ; état de notification conservé. Les erreurs de rechargement préservent la fiche et proposent une reprise. Le test rouge montrait le DOM du formulaire démonté après onRefresh ; il vérifie maintenant son identité et son état avant et après réception.
- **60.3** : lignes globales pour creation/available/blocked, lignes filtrées par user_id pour le pipeline commercial. Compteurs et listes utilisent exactement les mêmes lignes dédupliquées par id. Le total commercial est libellé « lots visibles » et son périmètre est expliqué en aide. Les compteurs sont uniquement des dénombrements d’affichage ; ni KPI financier ni API ne change. Cinq régressions reproduisaient listes vides, mauvais compteur personnel et doublons.
- **60.4** : une date seule inclut la fin du jour métier Africa/Casablanca, avec décalage IANA (sans UTC+1 codé en dur). Les timestamps avec fuseau gardent leur instant. Le test à 23 h 30 échouait ; tests aussi à 00 h 30, le lendemain et avec un timestamp explicite.
- **60.5** : is_expired et days_remaining du serveur pilotent l’état expiré/actif, ses compteurs et son style. Le badge partagé reprend le même état serveur pour son libellé ; la dérive de l’horloge navigateur ne peut plus l’inverser. Fixture renforcée pour qu’un écart de compteur ne puisse pas être masqué par deux désaccords qui se compensent.
- **60.6** : blur avec relatedTarget=null ignoré ; actions accessibles jusqu’au clic. Échap capturé au document, avec retour du focus, même après perte du focus ; clic extérieur conservé. Trois tests échouaient avant correction. Solution minimale explicitement autorisée, sans nouvelle dépendance.

Premier contrôle local avant le push initial : lint code 0, aucune erreur ni avertissement ; 60 fichiers / **675 tests verts** (**304,36 s**) ; build code 0 (**17,36 s**). Dernier ciblé transversal : 48 tests verts ; fixture du compteur serveur renforcée : deux tests verts. Les warnings historiques jsdom/navigation/act et le gros chunk demeurent ; aucun test désactivé.

## Rapport point → commit → test → vérification à l’écran

| Point | Commit correctif | Régression ajoutée / contrôle | Vérifié à l’écran |
|---|---|---|---|
| 58.1 | 1e9a022 puis db10310 | 12 couleurs uniques ; écart CIELAB ≥ 20 entre chaque paire dans les palettes carte/sombre/clair, contraste carte/blanc ≥ 3:1 (4 nouvelles régressions initialement rouges) | Non |
| 58.2 | 1e9a022 | Relecture de CLAUDE.md contre constantes, tokens et architecture ; pas de test artificiel de prose | Non (documentation) |
| 59.1 | 2d8dcc9 | Liens natifs couvrant carte et classement, href, clic et activation clavier vers la fiche | Non |
| 59.2 | 2d8dcc9 | Amount compact sans espace initial, exact en aria-label/tooltip ; InfoTip au clavier | Non |
| 60.1 | 2d04094 | Sept états depuis le vrai service GeoJSON : soldée, trois EDL, notaire, propriétaire, disponible | Non |
| 60.2 | 2d04094 | Identité du formulaire et état « Notifier le client » conservés durant et après onRefresh | Non |
| 60.3 | 2d04094 | Commercial : disponible/bloqué/création/pipeline, compte égal aux lignes ; doublons neutralisés | Non |
| 60.4 | 2d04094 | Date seule à 00 h 30, 23 h 30 au Maroc et le lendemain ; timestamp explicite conservé | Non |
| 60.5 | 2d04094 | Serveur expiré contre date future : compteur, style et badge concordants | Non |
| 60.6 | 2d04094 | Blur null puis déconnexion/thème ; Échap et retour du focus ; clic extérieur | Non |

## Commandes et résultats par branche

Commandes : `npm run lint`, `npm test -- --maxWorkers=2 --testTimeout=15000` (reporter verbose pour #59/#60), `npm run build`. Toutes terminées avec code 0 avant chaque push. Aucun changement de code après ces contrôles ; le rapport est ajouté ensuite.

| Branche | Lint | Tests | Durée tests | Build |
|---|---|---|---|---|
| feature/ui-fondations (#58) | 0 erreur | 589 / 47 fichiers | 234,55 s | OK, 10,77 s |
| feature/ui-primitives (#59) | 0 erreur | 617 / 50 fichiers | 254,14 s | OK, 12,64 s |
| feature/ui-dashboard-global (#60), final | 0 erreur | 678 / 60 fichiers | 274,08 s | OK, 15,44 s |

CI des mises à jour #58 et #59 : frontend, backend, migrations et Vercel verts. Les checks de #60 restent visibles sur sa PR ; les commentaires de corrections consignent le résultat final. Les trois PR restent en brouillon et aucun merge vers dev n’est effectué.

## Recette, captures et limites

L’application et le backend répondent HTTP 200 sur localhost:5177 et localhost:8010. Ce contrôle ne vaut pas validation à l’écran. Lecture authentifiée du jeu réel : 610 lots GeoJSON, 599 disponibles, 3 options, 3 réservations à finaliser, 1 bloqué, 4 engagées. Les 599 disponibles de la liste globale dédupliquée égalent le compteur serveur. Aucun lot soldé, EDL, notaire ou propriétaire dans ce jeu : le scénario avancé demandé ne peut pas être déclaré vu à l’écran sur ces données.

Aucune capture validée à ce stade. L’outil Computer Use avait interrompu l’accès Chrome Windows faute de déterminer l’URL avec confiance ; aucun autre moteur n’est utilisé pour contourner ce contrôle. Les tentatives natives suivantes échouent au clic (`coordinate input geometry is unavailable`) et à la capture (`window capture timed out: timed out waiting on channel`), même après resélection et activation de la fenêtre. Faute de scénario effectivement observé, les points restent marqués Non. Les tests DOM/jsdom ne sont jamais présentés comme une recette visuelle. Un compte commercial a ensuite été fourni : authentification réussie, rôle commercial confirmé par API. Lecture seule : 610 lots globaux uniques et pipeline personnel vide ; la répartition attendue pour ce compte est de 599 disponibles et 1 bloqué, soit 600 lots visibles. Cela ne valide pas les listes et compteurs à l’écran. Aucun changement de droits ou d’identité pour simuler sa connexion.

Aucune modification backend, API, modèle, règle métier, calcul financier ou permission. Aucun e-mail/SMS/WhatsApp envoyé et aucune écriture métier effectuée pendant les contrôles API. Lot 4 non commencé.

## Complément 60.4 — écart de données de fuseau révélé par la CI

Le premier push de #60 a eu **deux échecs de tests sur 675** dans deadlines.test.js sous Node 22.23.4, malgré le passage local sous Node 24.13.0. Reproduction avec le même Node 22, sans toucher à l’installation système : le runtime local embarque tzdata 2025b, le runner tzdata 2026e. La fixture supposait à tort UTC+1 en novembre 2026 ; le calcul de production suivait déjà le fuseau IANA.

L’[annonce officielle IANA 2026c](https://data.iana.org/time-zones/tzdb-2026c/NEWS) enregistre le passage du Maroc à UTC+0 le 20 septembre 2026. La [release officielle Node 22.23.4](https://nodejs.org/en/blog/release/v22.23.4) embarque tzdata 2026e. Les tests utilisent maintenant juin 2026 (UTC+1) et mars 2026 (UTC+0), périodes déterminées identiquement par les deux versions ; assertions inchangées sur 00 h 30, 23 h 30 et le lendemain. Trois cas UTC+0 ajoutés, aucun cas supprimé ni assertion affaiblie. Les sept cas passent sous le Node 22 du runner. Aucune modification de règle métier ou du backend, aucun décalage UTC fixé en dur, aucune dépendance produit ajoutée. Nouveau passage complet local consigné après cette correction de fixture.


Dernier passage avant le push de la fixture : `npm run lint` code 0 ; `npm test -- --maxWorkers=2 --testTimeout=15000 --reporter=verbose` : **678 tests / 60 fichiers verts, 274,08 s** ; `npm run build` : code 0, **15,44 s**. Les sept tests de dates ont également été exécutés explicitement sous Node 22.23.4 : 7/7 verts. Le code de production du correctif 2d04094 reste inchangé ; seuls les tests et ce rapport ont évolué après le premier push.

## Complément — couleurs de statuts trop proches

Le retour utilisateur et sa capture montrent des pastels difficiles à distinguer sur la carte : options/réservations à finaliser, engagées/soldées, ainsi que les trois EDL. Le correctif **db10310** est ajouté à #58 puis propagé par les merges **218287f** vers #59 et **fefed64** vers #60. Pas de rebase, amend ou force-push.

Carte et points de légende partagent une palette plus soutenue. Les variantes des tokens sombre et clair conservent les mêmes familles de teintes : création ardoise, disponible vert, option ambre, réservation à finaliser violet, engagée bleu, soldée cyan, EDL programmé rouille, réalisé turquoise, finalisé indigo, notaire rose, propriétaire vert citron, bloqué rouge. Le texte du badge du popup utilise la variante du thème pour conserver sa lisibilité ; sa pastille reprend la couleur cartographique. CLAUDE.md répertorie les trois palettes.

Quatre nouveaux tests échouaient avant correction : écart perceptuel trop faible dans chacune des trois palettes et contraste insuffisant des couleurs cartographiques sur blanc. Après correction : CIELAB ΔE76 ≥ 20 entre chaque paire des 12 statuts et contraste carte/blanc ≥ 3:1. Ces seuils ne remplacent pas la recette visuelle ni une vérification des déficiences de perception des couleurs ; les libellés sont conservés.

Validation locale avant les pushes : #58, lint OK, **593 tests / 47 fichiers** (252,52 s), build OK (13,66 s) ; #59 après merge, lint OK, **621 tests / 50 fichiers** (215,37 s), build OK (9,80 s) ; #60 final après stabilisation du test, lint OK, **682 tests / 60 fichiers** (243,26 s), build OK (16,57 s).

Le premier passage complet de #60 a signalé **1 échec / 682 tests** dans le test existant PaymentsPanel « legacy » : l’assertion du callback était synchrone alors que `usePaymentsData` appelle `onSummaryChange` dans un effet React après le rendu. Les 14 tests du fichier passent immédiatement en relance isolée sans changement, ce qui confirme le problème de synchronisation ; l’assertion attend maintenant le callback avec `waitFor`, sans changer sa condition. Les 14 tests passent ensuite aussi après cette stabilisation. Aucun code de production de paiement ni calcul financier modifié. Le résultat du nouveau passage complet est consigné dans le commentaire de #60.

Recette visuelle de ce complément : **non validée**. La page projet est bien exposée sur localhost:5177, mais la tentative de capture de sa légende et de sa carte échoue encore avec `window capture timed out: timed out waiting on channel`. Aucun screenshot présenté comme réussi.
