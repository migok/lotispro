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
