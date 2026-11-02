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

Branche `feature/ui-primitives`, dépend de la [PR #58](https://github.com/migok/lotispro/pull/58). PR demandée vers `dev`, à fusionner après le lot 1. Aucun lot 3 démarré.

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
