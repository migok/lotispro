# Lot 3 — shell et dashboard global

Autorisé par l’utilisateur (« ok continue »), après la revue des lots 1 et 2. Branche dédiée `feature/ui-dashboard-global`, dépendante des PR #58 et #59 ouvertes vers dev. Identité navy et laiton, thèmes clair et sombre conservés ; application des skills dashboard-design, responsive-design, content-design, spec-driven-development et des skills de la mission.

## Critères et travail

- [x] #1 : chargement, réponse valide, vide et erreur indépendants par source ; retry local ; réponses obsolètes ignorées ; aucune erreur transformée en zéro.
- [x] #7, #8 : panneau À traiter unique, expirations dédupliquées par lot, échéances de paiement distinctes par installment_id, urgence partagée, total et liste complète, liens vers la fiche existante du lot.
- [x] #14 : quatre KPI actuels, stock par statut et filtre accessible ; évolution commerciale E6 dans une section avec sa propre période (ne filtre pas les stocks et urgences actuels).
- [x] #15 : disponibilités des projets via `/projects/{id}/kpis`, jamais `total - sold - reserved` ; erreurs par projet.
- [x] #16 : une action principale ouvre le formulaire existant de création ; payload et permissions conservés.
- [x] #20, #21 : shell sans version codée en dur, rôle français, menu de compte compact, menu mobile SVG avec focus et fermeture clavier ; responsive 640 / 1024 / 1280.
- [x] Tests de régression : 647 tests / 56 fichiers ; lint sans erreur ni avertissement ; build OK ; contrôle API réel.
- [ ] Captures 375/768/1440 clair/sombre : non validées, contrôle Chrome bloqué aux lots précédents, aucun navigateur pilotable exposé dans cette session.
- [x] Documentation et livraison pour revue en PR draft vers dev ; merge réservé à l’utilisateur. Lots 4 et 5 hors périmètre.

Contrats vérifiés dans le code backend : `late-payments.amount` (l’audit disait `amount_due`), `alerts.reservations` sans project_id, options avec project_id, performance.series et disponibilité de l’historique via stats.flow_kpis_available. Aucun changement backend requis.
