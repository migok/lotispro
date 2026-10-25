# LotisPro — Roadmap Plan

> **For agentic workers:** ce document est la roadmap (epics → tâches). Chaque epic a sa spec dans
> `docs/superpowers/specs/epics/` et reçoit son **plan d'implémentation détaillé** (format
> superpowers:writing-plans) au moment où il démarre. Exécution : superpowers:subagent-driven-development
> ou superpowers:executing-plans.

**Goal:** Livrer les tickets Asana encore ouverts + états des lieux + statuts par projet, sur un code nettoyé, testé et suivi.

**Architecture:** 8 epics séquentiels (E0 → E7), une branche et une PR par epic vers `dev`, `dev → main` après chaque epic validé. Le GitHub Project « LotisPro — Roadmap » fait foi ; `docs/AVANCEMENT.md` le reflète.

**Tech Stack:** FastAPI · SQLAlchemy async · Alembic · Pydantic v2 · React 19 · Vite · Leaflet · Supabase · Railway · Resend · fpdf2 (+ ajouts : Vitest, APScheduler, openpyxl).

**Spec:** [2026-10-22-roadmap-lotispro-design.md](../specs/2026-10-22-roadmap-lotispro-design.md)

## Global Constraints

- Transitions de statut strictes inchangées ; seul ajout autorisé : `option → reservation_engagee` (E3-T3).
- Statuts obligatoires : `creation`, `available`, `reservation_engagee`, `reservation_soldee`, `chez_notaire`, `chez_proprietaire`, `blocked`. Optionnels : `option`, `reservation_a_finaliser`, bloc `edl`.
- Assistant IA hors `dev` (branche `feature/ai_assistant`).
- Base de prod = données de test : réinitialisable au premier déploiement.
- Migrations Alembic linéaires à partir de `0016`, chacune avec `downgrade` testé.
- UI en français ; `BusinessRuleError` → HTTP 400.
- Définition de Terminé (design §6) : test d'abord, lint propre, CI verte, revue de code, vérification dans l'app, migration up/down testée.

## Review Focus

1. **Projet existant après les migrations E2/E3** — attendu : comportement identique ; couvert par les tests de caractérisation E0-T3 rejoués à chaque epic.
2. **Client existant sans prénom ni canal** ouvert en édition — attendu : formulaire ouvert, champs manquants signalés, pas de crash ; test dans E2-T3.
3. **Désactivation d'un statut occupé** — attendu : refus avec liste des lots ; test dans E3-T2.
4. **Double exécution du job de rappel** (2 workers gunicorn) — attendu : un seul envoi ; test d'idempotence dans E4-T4.
5. **Période vide ou inversée** sur le dashboard — attendu : KPIs à 0 / erreur 422 claire ; tests dans E6-T1.

---

## Ordre et dépendances

```
E0 ──► E1
  └──► E2 ──► E3 ──► E4 ──► E7 (bloqué : fournisseur SMS/WhatsApp)
              ├────► E5
              └────► E6
```

| Epic | Branche | Spec | Plan détaillé | Asana |
|---|---|---|---|---|
| E0 Fondations & nettoyage | `feature/e0-fondations` | [E0](../specs/epics/E0-fondations-nettoyage.md) | [plan E0](2026-10-22-e0-fondations-nettoyage.md) | — |
| E1 🐛 #5 Plein écran | `feature/e1-plein-ecran` | [E1](../specs/epics/E1-plein-ecran.md) | [plan 2026-07-04](2026-07-04-fullscreen-metadata-edit-fix.md) (tâches 2-3) | BUG #5 |
| E2 👤 #7 Fiche client | `feature/e2-fiche-client` | [E2](../specs/epics/E2-fiche-client.md) | à écrire au démarrage | FEATURE #7 |
| E3 Statuts + EDL | `feature/e3-statuts-edl` | [E3](../specs/epics/E3-statuts-etats-des-lieux.md) | à écrire au démarrage | Consolidation §2 |
| E4 🔄 #8 Réservation | `feature/e4-reservation` | [E4](../specs/epics/E4-reservation-notifications.md) | à écrire au démarrage | FEATURE #8 |
| E5 📊 #3 Vue projet | `feature/e5-vue-projet` | [E5](../specs/epics/E5-vue-projet.md) | à écrire au démarrage | FEATURE #3 |
| E6 📅 #4 Dashboard | `feature/e6-dashboard-periode` | [E6](../specs/epics/E6-dashboard-periode.md) | à écrire au démarrage | FEATURE #4 |
| E7 SMS / WhatsApp | `feature/e7-sms-whatsapp` | [E7](../specs/epics/E7-sms-whatsapp.md) | à écrire au démarrage | Notifications |

## Tâches

Chaque ligne = une sous-issue GitHub. Le détail (fichiers, tests, critères) est dans la spec de l'epic.

### E0 — Fondations & nettoyage
- [ ] **E0-T1** Réconcilier `main` → `dev` (hors assistant IA) ; deploy qui échoue si migration KO
- [ ] **E0-T2** Isolation des tests backend + fabriques + fixtures d'auth
- [ ] **E0-T3** Tests de caractérisation des 16 transitions
- [ ] **E0-T4** Backend : `F821` et ruff à 0 erreur
- [ ] **E0-T5** Frontend : ESLint à 0 erreur + Vitest + tests de fumée
- [ ] **E0-T6** CI GitHub Actions + `CLAUDE.md` à jour

### E1 — 🐛 #5 Plein écran
- [ ] **E1-T1** Carte flexible en plein écran (panneau d'édition groupée visible)
- [ ] **E1-T2** Recette multi-navigateurs / multi-résolutions + non-régression

### E2 — 👤 #7 Fiche client
- [ ] **E2-T1** Migration 0017 + modèle + schémas (nouveaux champs, backfill `name` / `address`)
- [ ] **E2-T2** Validation (CIN, téléphone, conditionnels) + endpoint doublons
- [ ] **E2-T3** Formulaire client ordonné, conditionnels canal, adresse d'acte, préférences de notification
- [ ] **E2-T4** Fiche/listes clients + recherche + PDF avec adresse d'acte

### E3 — Moteur de statuts : statuts par projet + états des lieux
- [ ] **E3-T1** Module `lot_workflow` + table `lot_status_history` branchée sur toutes les transitions
- [ ] **E3-T2** Statuts optionnels par projet (API, gardes, refus si occupé)
- [ ] **E3-T3** Transition `option → reservation_engagee` (si « à finaliser » désactivé)
- [ ] **E3-T4** États des lieux backend (tables, 3 statuts, actions, garde de finalisation)
- [ ] **E3-T5** Frontend : paramètres projet, actions filtrées, écrans EDL, couleurs

### E4 — 🔄 #8 Réservation
- [ ] **E4-T0** Correctif PDF : police Unicode (apostrophe typographique, arabe) — #49, à faire en premier
- [ ] **E4-T1** Acte PDF généré automatiquement à l'engagement et stocké en document (+ vérif. sélection lot/client)
- [ ] **E4-T2** Service de notifications (interface canal, email, table `notifications`, API)
- [ ] **E4-T3** UI choix des canaux après chaque étape + historique fiche lot / client
- [ ] **E4-T4** Job quotidien de rappels d'expiration (verrou, idempotence)

### E5 — 📊 #3 Vue projet
- [ ] **E5-T1** Endpoint `lots-matrix` (type × statut actif)
- [ ] **E5-T2** Onglet « Lots » : grille, liste filtrée, navigation vers le détail
- [ ] **E5-T3** Filtres (statut multi, type, recherche) persistés en session

### E6 — 📅 #4 Dashboard par période
- [ ] **E6-T1** Backend `date_from` / `date_to`, KPIs flux / état, période précédente
- [ ] **E6-T2** Sélecteur de période + raccourcis + découpage `Dashboard.jsx`
- [ ] **E6-T3** Export Excel

### E7 — SMS / WhatsApp (bloqué)
- [ ] **E7-T1** Décision fournisseur (comparatif)
- [ ] **E7-T2** Canal SMS
- [ ] **E7-T3** Canal WhatsApp

## Rituel par epic

1. Passer l'issue epic en *En cours* ; créer la branche depuis `dev`.
2. Écrire le plan détaillé (`docs/superpowers/plans/YYYY-MM-DD-eN-<slug>.md`) à partir de la spec — sauf E0 (déjà écrit) et E1 (plan existant).
3. Exécuter tâche par tâche ; à chaque tâche : sous-issue → *En cours* puis *Terminé*, ligne `AVANCEMENT.md` mise à jour dans le même commit.
4. PR vers `dev`, revue de code, CI verte, vérification dans l'app contre les critères d'acceptance de la spec.
5. Merge ; epic → *Terminé* ; ticket(s) Asana correspondants cochés ; release `dev → main` si souhaitée.
