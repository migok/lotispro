# Corrections de revue — PR #58, #59 et #60

Source : [consignes de revue](2026-11-02-codex-corrections-revue-pr-58-59-60.md). Travail dans lot_webapp-ui, sans modification backend, sans rebase/amend/force-push. PR conservées en brouillon ; lot 4 exclu.

## #58

58.1 : Livré est olive (#c2dc78 / #4a6216) et Disponible reste émeraude. Trois tests de régression échouaient (11 couleurs au lieu de 12) ; ils vérifient maintenant l’unicité des 12 couleurs Leaflet et des tokens résolus dans les deux thèmes. 58.2 : convention officielle Tailwind v4 + shadcn/Radix + Recharts, primitives communes, formats uniques et tableau des 12 statuts alignés sur les constantes et tokens. Le document humain est relu contre ces sources ; pas de test artificiel qui recherche des phrases.

Vérification avant push : lint code 0, aucune erreur ; 47 fichiers / 589 tests verts, 234,55 s ; build code 0, 10,77 s. Les avertissements historiques jsdom/navigation et chunk principal sont conservés. Recette à l’écran à effectuer après correction de la pile.

## #59 et #60

Corrections et résultats à compléter sur leurs branches, puis tableau final point → commit → régression → vérification à l’écran. Priorité du lot #60 : 60.1 avant les autres corrections.
