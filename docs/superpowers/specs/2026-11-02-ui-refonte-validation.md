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
