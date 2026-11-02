# Refonte UI — suivi et validation

Date : 2026-11-02. Source : mission `2026-11-02-prompt-codex-refonte-ui.md` et audit UX/UI du 30 octobre.
Base : `origin/dev` à `c87150b` (E6 fusionné par #57). Worktree isolé `lot_webapp-ui`.

Les choix recommandés s'appliquent : shadcn/ui + Tailwind v4, Recharts lorsqu'un graphique sera refondu, E6 avant la refonte projet, fiche lot en Sheet, thèmes sombre et clair conservés. L'utilisateur a ajouté explicitement le skill Dashboard Design, déjà appliqué.

## Lot 1 — fondations

- [x] Tokens centralisés : primitives, sémantique, composants, thèmes sombre et clair.
- [x] Or de marque séparé des statuts commerciaux violets et des alertes orangées.
- [x] Palette regroupée par phases, libellés conservés ; hex Leaflet synchronisés avec le thème sombre de référence.
- [x] Contraste automatisé des textes primaire, secondaire, atténué et doré sur les cinq surfaces des deux thèmes.
- [x] Sept tailles de texte (12, 14, 16, 18, 24, 32, 40 px), DM Sans tabulaire pour les chiffres, serif pour les titres de page.
- [x] Échelles d'espacement, rayons, couches, ombres teintées ; seuils responsive 640 / 1024 / 1280.
- [x] Formateur monétaire Intl fr-MA unique, séparateurs harmonisés, promotion d'unité à l'arrondi ; alias historiques délégués.
- [x] Formateur de dates unique et valeurs date seules indépendantes du fuseau ; arithmétique des dates inchangée.
- [x] Valeurs exactes au focus/survol des montants compacts ; les infobulles interactives arrivent au lot 2.
- [x] Focus visible global, réduction des animations et contraste forcé.
- [x] Tailwind v4 via Vite ; shadcn JSX, alias @ ; preflight volontairement omis pour préserver le reset existant.
- [ ] Recette visuelle et captures avant/après : non réalisées.

Problèmes traités : #2, #3, #4, #9, #12, #13, #19 ; #22 amorcé (libellés courants), à poursuivre lors des migrations d'écran.

Fichiers principaux : `frontend/src/styles/tokens.css`, `styles/tailwind.css`, `styles.css`, `utils/formatters.js`, `utils/constants.js`, `vite.config.js`, `components.json`, `jsconfig.json`, `lib/utils.js`. Adaptation des usages de dates, montants et tailles de texte dans les composants existants ; aucune API ni règle métier modifiée.

Dépendances : Tailwind et son plugin Vite pour les utilitaires ; clsx et tailwind-merge pour `cn` ; class-variance-authority et Radix Slot pour Button ; Radix Dialog, AlertDialog et Tooltip pour les primitives accessibles du lot 2. Aucun ajout Recharts avant son premier usage.

## Limite de la validation visuelle

Backend démarré depuis ce worktree sur 8010, sans reload et avec `SCHEDULER_ENABLED=false`. Frontend sur 5180.
Le contrôle Chrome a été arrêté par l'outil : « could not determine the current browser URL on Windows with enough confidence to enforce policy ». Aucun autre moyen d'automatisation du navigateur n'a été utilisé pour contourner cet arrêt. La connexion et les captures via navigateur ne sont donc pas validées.

Matrice à réaliser : dashboard global, projets, projet/Carte, projet/Lots, clients, fiche client, commerciaux, login ; largeurs 375 / 768 / 1440 px ; thèmes sombre et clair ; captures avant et après chaque lot. Vérifier les montants longs, le focus, les dialogues et la réduction des animations. Les changements des seuils responsive et des tailles de texte nécessitent particulièrement cette revue.

Les erreurs de données du dashboard (#1) restent dans le lot 3 : cette session ne les déclare pas corrigées. Pas de migration ni de changement serveur, de permission ou de calcul financier.

## Résultats automatisés — lot 1

Cycle rouge constaté avant implémentation : `999999` affichait `1000K MAD`, format de date avec heure inattendue, contrastes insuffisants dans 29 des 50 cas (dont le token doré absent).

Sortie réelle de la suite complète :

```text
npm test -- --maxWorkers=2 --testTimeout=15000 --reporter=verbose
Test Files  47 passed (47)
Tests       586 passed (586)
Duration    325.97s
```

Les premiers essais avec le délai de 5 secondes ont été interrompus après des dépassements de temps de saisie téléphonique ; le test concerné passe en 5680 ms avec le délai de 15 secondes. La suite conserve des avertissements existants : navigation jsdom non implémentée, mises à jour de paramètres hors `act`, ancien téléphone sans indicatif. Aucune assertion n'est désactivée.

`npm run lint` : code de sortie 0. `npm run build` : code de sortie 0 ; 250 modules transformés. Avertissement de chunk principal supérieur à 500 kB conservé, à traiter dans un chantier de découpage. Installation npm : 17 vulnérabilités signalées dans l'arbre ; aucun `audit fix` global ou changement de dépendances hors périmètre.

Compte de test vérifié en mémoire contre l'API du worktree : connexion HTTP 200 ; `/api/projects`, `/api/dashboard/stats` et `/api/clients` HTTP 200. Aucun identifiant ni jeton n'est enregistré dans le dépôt. Ceci ne remplace pas la recette navigateur.

## Lot 2 — primitives et premières migrations

Branche `feature/ui-primitives`, dépend de la [PR #58](https://github.com/migok/lotispro/pull/58). PR demandée vers `dev`, à fusionner après le lot 1. Lot 3 autorisé ultérieurement par l’utilisateur ; compte rendu ci-dessous.

- [x] Button (variantes, composition Slot, état occupé/désactivé), Card, StatusBadge, StatTile, EmptyState, Skeleton/LoadingSkeleton, DataTable, Dialog, Sheet, Tooltip, ConfirmDialog dans `frontend/src/components/ui/`.
- [x] Chacune couverte par les tests de rendu et les interactions applicables : clavier, tri et pagination, état vide/erreur/chargement, focus, Escape, annulation, double exécution, échec asynchrone.
- [x] StatusBadge lit exclusivement STATUS_LABELS et STATUS_COLORS ; styles de badges/infobulles historiques raccordés aux mêmes tokens. Le lot 2 complète la migration des couleurs de statut amorcée au lot 1.
- [x] Les deux confirmations natives remplacées : retrait d'un commercial et libération d'une réservation. Chemins, paramètres et corps des requêtes API identiques ; annuler ne déclenche aucune mutation.
- [x] Messages de chargement remplacés par un skeleton générique annoncé une seule fois ; les libellés de boutons occupés et le chargement du dashboard projet restent spécifiques.
- [x] Liens natifs sur les cartes du dashboard global, les lignes d'options globales et les cartes/classement Clients ; aucune imbrication de liens ou boutons.
- [x] Aides KPI et valeurs exactes accessibles au focus, au toucher et au survol ; fermeture par Escape et au défilement. Portails compatibles avec le conteneur plein écran.
- [ ] Captures et recette visuelle aux six combinaisons largeur/thème : même blocage de l'outil Chrome.

Problèmes traités : #5 (primitives et première adoption, migration progressive des écrans aux lots suivants), #11 (dashboard global et Clients ; les autres cartes métier restent pour les lots suivants), #17 (confirmations uniquement ; fiche lot en Sheet au lot 5), #18 (placeholders de chargement).

Nouveaux fichiers : onze modules de primitives dans `frontend/src/components/ui/`, tests `ui/__tests__/primitives.test.jsx`, `components/__tests__/uiMigration.test.jsx`, styles isolés `styles/ui.css`. Tests de confirmation ajoutés à `Dashboard.smoke.test.jsx`. Les autres adaptations de composants portent sur les aides, placeholders et liens, sans refonte des écrans.

Dépendances ajoutées au lot 2 : aucune, les dépendances shadcn/Radix sont préparées dans le lot 1. Le test setup fournit seulement l'observateur de dimension absent de jsdom ; les interactions, la gestion du focus et les composants Radix sont réels.

Cycle rouge : 20 tests de primitives échouaient sur les composants vides ; les quatre tests de migration reproduisaient l'absence de liens, de skeleton et de confirmation ; un test additionnel reproduisait la confirmation native de libération ; le test d'aide KPI exige désormais un bouton utilisable au clavier. Passage ciblé final : 35 tests verts dans quatre fichiers. Le test historique de chargement d'échéancier a été adapté à l'annonce `role=status` / `aria-busy`, en conservant ses assertions de non-régénération d'acte.

Lint : code 0. Build : code 0, 325 modules transformés ; avertissement de chunk conservé. Suite complète finale verte : 49 fichiers, 611 tests, 223,27 secondes (commande ci-dessous).

## Revue et suites

- CI de la PR #58 : backend ruff/pytest, frontend eslint/vitest/build, migrations upgrade/downgrade/upgrade et aperçu Vercel verts.
- Les dossiers `lot_webapp`, `lot_webapp-e5` et `lot_webapp-e6` sont propres et n'ont pas été modifiés.
- Les corrections d'architecture des données et de salience du dashboard restent au lot 3 ; le portefeuille en tableau reste au lot 4 ; la vraie fiche lot en Sheet reste au lot 5.
- Risque principal : absence de recette visuelle. Les PR restent en brouillon et ne sont pas déclarées « Terminées » ; seule l'implémentation et la validation automatisée sont proposées à la revue.

Sortie réelle finale du lot 2 :

```text
npm test -- --maxWorkers=2 --testTimeout=15000 --reporter=verbose
Test Files  49 passed (49)
Tests       611 passed (611)
Duration    223.27s
```

Les vérifications HTTP finales répondent 200 : frontend sur `http://127.0.0.1:5180/`, transformation Vite de `src/components/ui/confirm-dialog.jsx`, backend `/api/health` sur 8010. Cela vérifie les serveurs, pas le rendu des pages. L'aperçu local est laissé disponible pour la revue utilisateur.


## Lot 3 — shell et dashboard global

Branche `feature/ui-dashboard-global`, à la suite des PR #58 et #59 (encore ouvertes). Accord utilisateur « ok continue ». Le diff propre au lot 3 est relatif à `feature/ui-primitives`. Aucun fichier backend ni worktree protégé modifié.

### Corrections proposées à la revue

- **#1** : ressources indépendantes avec chargement, réponse valide, erreur et bouton Réessayer local. Une erreur masque les valeurs du bloc avec « — ». Les alertes partielles affichent « Liste incomplète » ; aucun bilan rassurant tant qu’une source manque. Validation des comptes par statut ; les réponses dépassées sont ignorées au changement de période, de tentative ou de compte (même si l’URL de l’endpoint ne change pas).
- **#7, #8** : un panneau À traiter pour les options/réservations, échéances de paiement et dossiers notaire. Une expiration par lot, chaque échéance de paiement conservée par installment_id. Tri par échéance et urgence, nombre connu explicite, filtres, cinq lignes puis Voir tout. Liens natifs vers la fiche existante du lot via `?lot=ID` et téléphone cliquable. Aucune relance ou mutation automatique. Le badge DeadlineBadge et le calcul d’urgence sont partagés avec OptionsTrackingTab : dépassé / sous un jour / sous trois jours / plus tard / sans échéance. La restructuration du dashboard projet reste au lot 5.
- **#14** : quatre KPI actuels (CA et potentiel, disponible et pourcentage, taux de vente, nombre et montant des retards), répartition de tous les statuts groupés par phase, compte des lots libérés rétrogradé. Chaque statut ouvre une liste filtrée en Sheet avec accès à la fiche du lot. Évolution E6 dans une section séparée avec sa propre période, comparaison serveur et historique indisponible respecté. Tableau des valeurs accessible en complément du graphique.
- **#15** : disponibilité, taux de vente et CA par projet lus dans `/api/projects/{id}/kpis`. Le calcul `total - sold - reserved` a disparu. Lecture limitée aux six projets affichés ; accès à la liste complète. Les KPI et l’évolution sont rechargés après une action sur un lot.
- **#16** : une seule action principale dans le header, Nouveau projet, ouvre immédiatement le formulaire existant migré vers Dialog. Labels associés, erreurs annoncées, payload et vérifications de rôle conservés.
- **#20, #21** : sidebar compacte, rubrique active annoncée, lien d’évitement, SVG, menu mobile Radix (focus piégé, Escape, retour au déclencheur, fermeture à la sélection), menu de compte (rôle français, thème, déconnexion). Version codée en dur supprimée. Nouveaux styles limités aux trois points de rupture 640/1024/1280. Les anciens breakpoints des autres écrans restent à leur migration ultérieure.
- **#5** : suppression complète du CSS injecté et découpage du dashboard global en composants ; adoption des primitives du lot 2.

### Fichiers et dépendance

`App.jsx`, `AccountMenu.jsx`, `GlobalDashboard.jsx`, `global/{useDashboardResource,ResourceError,TreatmentPanel,StockPanel,CommercialTrend,TrendChart,DashboardLot}`, `ui/deadline-badge.jsx`, `utils/deadlines.js`, `styles/{shell,global-dashboard}.css`, formulaire CreateProjectModal et badge d’OptionsTrackingTab. Tests de régression dans sept nouveaux fichiers, fixture historique uiMigration complétée avec le contrat réel des statuts.

Ajout **Recharts 3.10.1**, prévu par la décision de bibliothèque, pour les séries E6. Import dynamique : le graphique est dans un chunk séparé ; animations désactivées ; navigation clavier et infobulles exactes testées. Référence API officielle consultée : https://recharts.github.io/en-US/api/BarChart/ . Aucun autre ajout direct.

### Vérifications numériques et API réelles

Connexion au compte de test fourni, uniquement des lectures après authentification ; aucun secret enregistré. Frontend `http://localhost:5177` HTTP 200 et backend 8010 disponible, scheduler désactivé.

Les sept endpoints de lecture (projets, stats, alertes, options, paiements, notaire, performance) et les KPI du projet répondent 200. L’audit indiquait amount_due ; le contrat réel est **amount**, utilisé sans changer la définition financière. La somme des comptes par statut égale counts.total. Les sommes des séries de ventes et réservations égalent les totaux flow correspondants. Données observées : 4 échéances en retard, total 190 250 MAD ; 6 lots avec expiration distincte ; 10 dossiers en tout, notaire compris. Le lot testé possède bien une ligne correspondant à current_reservation_id ; la fiche refuse de charger une ancienne réservation à sa place.

Fixture indépendante : 2 puis 3 ventes = 5, 3 puis 4 réservations = 7 ; KPI et cellules du tableau vérifiés séparément, infobulles du vrai graphique contrôlées au focus et avec les flèches. Deux échéances de 1 250 et 2 750 MAD = 4 000 MAD, plus une expiration dédupliquée = trois dossiers. Tests des limites temporelles (dépassé, exactement 1/3 jour, juste après, date absente), des erreurs, de l’absence de faux zéro, des réponses obsolètes et du clavier.

### Recette et limites

Validation automatisée finale (avant commit) :

```text
npm run lint
> eslint .
(code 0, aucune erreur ni avertissement)

npm test -- --maxWorkers=2 --testTimeout=15000 --reporter=verbose
Test Files  56 passed (56)
Tests       647 passed (647)
Duration    321.08s

npm run build
vite v7.3.1
930 modules transformed
built in 30.33s
```

Build : chunk graphique 380,77 ko (gzip 111,03 ko), chunk principal 1 143,61 ko (gzip 306,21 ko). Les avertissements de tests historiques jsdom/navigation, act et anciens téléphones sont conservés et ne font échouer aucun test. Aucun avertissement dans les nouveaux tests ciblés. Diff check sans erreur de whitespace ; trois worktrees protégés propres.

Cycles rouges observés : shell sans dialogue mobile ni lien d’évitement ; ancien format J-1 critique au lieu du badge partagé ; stats incomplètes acceptées ; projets de l’ancien compte restant affichés sur changement de compte. Corrections suivies des passages ciblés puis de la suite complète. Une erreur de préparation des premiers mocks (retour involontaire du beforeEach interprété comme nettoyage par Vitest) a été corrigée ; elle n’a pas été comptée comme preuve fonctionnelle.

Les captures avant/après et la recette visuelle aux largeurs 375/768/1440 dans les deux thèmes restent **non validées**. Lors des lots précédents, Computer Use a arrêté l’accès à Chrome : il ne pouvait pas déterminer l’URL Windows avec assez de confiance. L’inventaire de cette session ne fournit toujours aucun navigateur pilotable (`browsers: []`). Un contrôle HTTP ou jsdom n’est pas une validation visuelle. La PR reste donc en brouillon, sans déclaration du lot comme terminé.

Risques maintenus : chunk principal supérieur à 500 ko (antérieur), 17 vulnérabilités déjà signalées par npm (même nombre avant/après l’ajout de Recharts), recette visuelle manquante. Aucun audit fix global. Les limites de droits demeurent celles des endpoints existants ; aucun contournement ajouté. L’adaptateur de fiche ouvre le composant historique, dont la conversion en Sheet reste au lot 5. Lots 4 et 5 non démarrés.
