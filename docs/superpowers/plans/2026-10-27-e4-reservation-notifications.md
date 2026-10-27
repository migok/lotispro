# E4 — 🔄 #8 Réservation : acte auto, notifications, rappels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les PDF robustes à l'Unicode, générer et archiver l'acte à chaque engagement, notifier le client par canal avec historique, envoyer un rappel unique avant expiration, puis (E4-T5, #52) permettre de modifier une réservation engagée.

**Architecture:** T0 isole la création du PDF dans une fabrique unique (`_new_pdf`) qui enregistre une police TTF Unicode embarquée. T1 extrait la préparation des données d'acte (aujourd'hui dupliquée dans deux endpoints) dans un `ActeService` appelé après chaque transition vers `reservation_engagee`, qui stocke le PDF comme document du lot sans jamais faire échouer la transition. T2 introduit un service de notifications à canaux interchangeables et une table d'historique ; T3 l'expose dans l'UI ; T4 ajoute un job APScheduler quotidien, protégé par verrou PostgreSQL et idempotent via la table `notifications`.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2, fpdf2 2.8 (+ `uharfbuzz` pour la mise en forme arabe), Resend, APScheduler 3.x ; React 19, Vitest.

**Spec:** [docs/superpowers/specs/epics/E4-reservation-notifications.md](../specs/epics/E4-reservation-notifications.md) + issue [#52](https://github.com/migok/lotispro/issues/52) (E4-T5, hors spec à ce jour).

## Ordre et dépendances

| Tâche | Issue | Dépend de | Peut démarrer |
|---|---|---|---|
| E4-T0 Police Unicode PDF | #49 | — | maintenant (branche créée depuis `dev` sans E3) |
| E4-T1 Acte auto à l'engagement | #30 | E3 (`lot_workflow`, `option-engage`) + T0 | après fusion de la PR #51 dans `dev` puis `git rebase dev` |
| E4-T2 Service de notifications | #31 | T1 (pièce jointe de l'acte) | après T1 |
| E4-T3 UI notifications | #32 | T2 | après T2 |
| E4-T4 Rappels d'expiration | #33 | T2 | après T2 (parallélisable avec T3) |
| E4-T5 Modifier une réservation engagée | #52 | T1 (Q4, Q5 répondus) | après T1 |

**Après le rebase sur `dev` (E3 fusionné)**, relire les références de fichiers/lignes des tâches T1-T5 : elles ont été écrites contre `origin/feature/e3-statuts-edl` (`0b4a036`).

## Global Constraints

- Branche `feature/e4-reservation` (worktree `../lot_webapp-e4`) ; PR vers `dev`. Ne jamais toucher `lot_webapp/` ni `lot_webapp-e3/` ni leurs branches.
- Migrations : E3 occupe `0020`-`0022` → E4 utilise **`0023`** (T1), **`0024`** (T2), puis `0025+` (T5). Additives, chacune avec `downgrade`. Ne jamais lancer `alembic upgrade` sur la base Supabase : seulement `alembic upgrade head --sql` pour relecture ; **l'utilisateur décide** de l'application.
- Messages d'UI et d'erreur API en français ; `BusinessRuleError` → 400, rôle insuffisant → 403.
- Dépendances Python ajoutées dans les **trois** sources : `backend/pyproject.toml` (`dependencies`), `backend/requirements.txt`, liste `pip wheel` de `backend/Dockerfile` (ligne ~22). Si l'édition du `Dockerfile` est refusée par le classifieur de permissions, ne pas contourner : le signaler à l'utilisateur.
- Tests backend dans une venv dédiée à ce worktree (`<scratchpad>/venv-e4`, `pip install -e ".[dev]"` depuis `backend/`) : `SECRET_KEY=ci-dummy-secret-key-for-tests-only-0123456789abcdef python -m pytest -q`, `python -m ruff check .`, `python -m ruff format --check .`. Frontend : `npx vitest run`, `npx eslint src` (0 erreur), `npm run build`.
- TDD : test écrit avant le code, sortie RED consignée dans le rapport de tâche.
- Commits conventionnels en anglais terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; jamais d'amend ni de force-push (le rebase de T1 se fait avant tout push de la branche, ou via merge de `dev` si la branche a déjà été poussée).
- Chaque tâche met à jour sa ligne dans `docs/AVANCEMENT.md` dans le même commit et passe l'issue sur le Project #4 (En cours → En revue). « Terminé » seulement après recette de l'utilisateur dans l'app.

## Décisions à confirmer par l'utilisateur

Valeur par défaut appliquée si pas de réponse ; à poser au plus tard au démarrage de la tâche concernée.

- **Q1 (T1) Promotion non reçue à l'engagement.** Le téléchargement manuel de l'acte est refusé tant que la promotion (`promotion_amount > 0`, `promotion_received = false`) n'est pas reçue. *Défaut :* à l'engagement, l'acte n'est pas généré dans ce cas ; il est généré automatiquement quand la promotion est marquée reçue (`mark-promotion-received`). Le reçu reste téléchargeable.
- **Q2 (T2) Téléphone du commercial.** `users` n'a pas de colonne téléphone. *Défaut :* migration 0024 ajoute `users.phone` (nullable), éditable dans la gestion des commerciaux ; la ligne téléphone est omise du message si vide.
- **Q3 (T2) « Lien vers l'acte ».** *Défaut :* l'acte stocké est joint en PDF à l'email `reservation_engagee` (pas de lien public signé, qui expirerait et exposerait le document).
- **Q4 (T5) Rôles — répondu le 2026-10-27 :** commercial et manager peuvent modifier une réservation engagée. *Application :* même règle de propriété que les transitions existantes (`engage`, `solde`…) : le commercial modifie les réservations qu'il a faites, le manager toutes.
- **Q5 (T5) Anciennes réservations avec « promotion » encaissée — répondu le 2026-10-27 :** rien n'est en production, aucune reprise de données à prévoir ; la migration peut ignorer les valeurs existantes de `promotion_amount` / `promotion_received` / `promotion_paid_timing` (pas de conversion, pas d'audit préalable).
- **Q6 (T5) Validation notaire/comptable de l'écart.** *Défaut :* ne bloque pas l'implémentation ; l'application trace les montants sans valider leur traitement juridique ou fiscal (mention de #52), la validation reste hors application.

## Review Focus

1. **Écriture arabe dans un PDF** (ville « وجدة », nom en arabe) — attendu : PDF produit, glyphes présents (aucun avertissement fpdf « missing glyphs »), lettres liées si `uharfbuzz` est installé → T0 tests `test_pdf_has_no_missing_glyphs` + recette visuelle.
2. **Mise en page après changement de police** (DejaVu est plus large qu'Helvetica) — attendu : l'acte reste sur 2 pages et le reçu sur 1 page pour un client type, comme aujourd'hui → T0 `test_page_count_unchanged`.
3. **Échec de stockage Supabase ou de génération PDF à l'engagement** — attendu : la transition réussit, aucune ligne de document orpheline, erreur journalisée, alerte « Régénérer » dans la fiche lot → T1 `test_engage_succeeds_when_storage_fails`.
4. **Deux workers exécutent le job de rappel en même temps / le job est relancé le même jour** — attendu : un seul rappel par réservation et par date limite → T4 `test_reminders_idempotent`.
5. **Client sans email, ou `RESEND_API_KEY` absente** — attendu : une ligne `notifications` `failed` (« Le client n'a pas d'adresse email. ») ou `not_configured`, réponse 200 avec le détail par canal, jamais de 500 → T2 `test_notify_without_email_records_failure`.

---

### Task 0 (E4-T0, #49): Police Unicode pour l'acte et le reçu

**Files:**
- Create: `backend/app/assets/fonts/DejaVuSans.ttf`, `DejaVuSans-Bold.ttf`, `DejaVuSans-Oblique.ttf`, `LICENSE-DejaVu.txt` (version 2.37 officielle : `https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip`, fichiers `ttf/` et `LICENSE`)
- Modify: `backend/app/services/certificate_service.py` (fabrique `_new_pdf`, toutes les occurrences de `"Helvetica"`)
- Modify: `backend/pyproject.toml`, `backend/requirements.txt`, `backend/Dockerfile` (ajout `uharfbuzz`)
- Test: `backend/app/tests/unit/test_certificate_service.py`, `backend/app/tests/integration/test_api/test_certificate_unicode.py`
- Modify: `docs/AVANCEMENT.md` (ligne E4-T0 ; entrée de dette « PDF en erreur 500 » marquée résolue)

**Interfaces:**
- Produces: `FONT_FAMILY = "DejaVu"` ; `FONTS_DIR: Path` (= `Path(__file__).resolve().parent.parent / "assets" / "fonts"`) ; `_new_pdf() -> FPDF` (A4 portrait, marges 20 mm, saut de page auto marge 20, `add_page()` fait, polices `""`, `"B"`, `"I"` enregistrées sous `FONT_FAMILY`, mise en forme de texte activée si `uharfbuzz` est importable). Signatures publiques de `generate_reservation_certificate` / `generate_payment_receipt` **inchangées** (T1 les consomme).

- [ ] **Step 1: Préparer la venv du worktree**

Run (depuis `backend/`) : `python -m venv <scratchpad>/venv-e4 && <scratchpad>/venv-e4/Scripts/python -m pip install -e ".[dev]"`
Expected: installation OK ; `python -m pytest -q` vert sur `dev` (état de référence, nombre de tests noté dans le rapport).

- [ ] **Step 2: Écrire les tests unitaires (RED)**

`app/tests/unit/test_certificate_service.py`, fonction utilitaire `_page_count(pdf: bytes) -> int` (= nombre de `/Type /Page` hors `/Pages`, regex `rb"/Type\s*/Page[^s]"`), données de base : client « Ahmed Benali », CIN `F123456`, adresse `12 rue Ibn Rochd, Oujda`, lot `A-12`, 200 m², prix 500 000, acompte 10 000, projet « Les Jardins ».

```python
UNICODE_CASES = [
    "Côte d’Ivoire",            # apostrophe typographique
    "“Les Palmiers”",           # guillemets anglais
    "وجدة",                     # arabe
    "Aït Ben Haddou — l’Oasis",  # tiret cadratin + apostrophe
]

@pytest.mark.parametrize("text", UNICODE_CASES)
def test_certificate_accepts_unicode(text):  # text dans client_name, client_address ET project_name
    pdf = CertificateService().generate_reservation_certificate(...)
    assert pdf.startswith(b"%PDF")

@pytest.mark.parametrize("text", UNICODE_CASES)
def test_receipt_accepts_unicode(text):      # idem pour generate_payment_receipt (promotion_amount=50000)
    assert pdf.startswith(b"%PDF")

def test_page_count_unchanged():  # données de base, sans caractère spécial
    assert _page_count(certificate) == 2
    assert _page_count(receipt) == 1

def test_pdf_has_no_missing_glyphs(caplog):  # client « وجدة » / « Côte d’Ivoire »
    caplog.set_level(logging.WARNING)
    ...generate both...
    assert not [r for r in caplog.records if "missing" in r.getMessage().lower()]

def test_missing_glyph_detection_works(caplog):  # garde-fou du test précédent
    # « 漢 » est absent de DejaVu : fpdf doit le signaler → prouve que le test ci-dessus mesure quelque chose
    assert [r for r in caplog.records if "missing" in r.getMessage().lower()]
```

Si fpdf2 signale les glyphes manquants par `warnings.warn` plutôt que par `logging`, adapter les deux tests avec `pytest.warns`/`recwarn` (le garde-fou doit rester vert).

- [ ] **Step 3: Écrire le test d'API (RED)**

`app/tests/integration/test_api/test_certificate_unicode.py` (`pytestmark = pytest.mark.integration`) : client créé par `make_client(..., last_name="Benali", first_name="Aïcha", address_abroad="12 rue de l’Église", city_abroad="Abidjan", country_abroad="Côte d’Ivoire", acte_address="abroad")` ; lot engagé via l'API `POST /api/lots/{id}/transitions/direct-engage` (payload comme `_direct_reservation_payload` de `test_lot_transitions.py`, sans `sale_price` ni `payment_plan`).

```python
async def test_certificate_with_unicode_address_returns_pdf(...):
    resp = await client.get(f"/api/reservations/{reservation_id}/certificate", headers=auth_headers(commercial))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")

async def test_receipt_with_unicode_address_returns_pdf(...):  # /receipt → 200, %PDF
```

- [ ] **Step 4: Lancer les tests, vérifier l'échec**

Run: `python -m pytest app/tests/unit/test_certificate_service.py app/tests/integration/test_api/test_certificate_unicode.py -v`
Expected: FAIL — `FPDFUnicodeEncodingException` sur les cas Unicode (les tests de nombre de pages et de garde-fou peuvent déjà passer ou échouer selon l'existant ; consigner la sortie).

- [ ] **Step 5: Ajouter les polices et la dépendance**

Télécharger le zip 2.37 (curl), copier les 3 TTF + `LICENSE` → `LICENSE-DejaVu.txt` ; ajouter `"uharfbuzz>=0.39"` aux trois sources de dépendances ; réinstaller la venv (`pip install -e ".[dev]"`). Vérifier que `app/assets/fonts/` est bien copié par le `Dockerfile` (ligne `COPY app/ ./app/`) et n'est pas exclu par `.dockerignore` / `.gitignore` (`git check-ignore -v`).

- [ ] **Step 6: Implémenter `_new_pdf()` et basculer les deux PDF sur `FONT_FAMILY`**

Remplacer les deux blocs de création `FPDF(...)` par `_new_pdf()` ; remplacer `"Helvetica"` par `FONT_FAMILY` partout (styles `"B"`, `"BU"`, `"I"`, `""` conservés : `U` est un soulignement, pas une police). Mise en forme : `pdf.set_text_shaping(True)` seulement si `importlib.util.find_spec("uharfbuzz")` ; sinon pas d'appel (texte arabe affiché non lié, sans crash). Si l'acte déborde sur 3 pages, réduire les interlignes/espacements (pas la taille du corps de texte sous 9,5) jusqu'à retrouver 2 pages.

- [ ] **Step 7: Lancer les tests, vérifier le succès**

Run: `python -m pytest app/tests/unit/test_certificate_service.py app/tests/integration/test_api/test_certificate_unicode.py -v` puis `python -m pytest -q`, `python -m ruff check .`, `python -m ruff format --check .`
Expected: tout PASS, ruff 0.

- [ ] **Step 8: Contrôle visuel**

Générer dans le scratchpad `acte_unicode.pdf` et `recu_unicode.pdf` (client « Aïcha Benali », adresse « 12 rue de l’Église, Abidjan, Côte d’Ivoire », ville « وجدة » dans un second jeu) ; les convertir en PNG (PyMuPDF `pip install pymupdf` dans la venv, hors dépendances du projet) et les lire pour vérifier : apostrophes, guillemets, arabe lié de droite à gauche, gras/souligné des titres, pied de page. Joindre les chemins au rapport.

- [ ] **Step 9: Commit**

```bash
git add backend/app/assets/fonts backend/app/services/certificate_service.py backend/pyproject.toml backend/requirements.txt backend/Dockerfile backend/app/tests/unit/test_certificate_service.py backend/app/tests/integration/test_api/test_certificate_unicode.py docs/AVANCEMENT.md
git commit -m "fix: embed DejaVu Unicode font in reservation PDFs"
```

---

### Task 1 (E4-T1, #30): Acte généré et archivé à chaque engagement

**Files:**
- Create: `backend/alembic/versions/0023_add_lot_document_category.py` (`lot_documents.category` `String(30)` nullable, index `ix_lot_documents_reservation_category (reservation_id, category)`)
- Modify: `backend/app/infrastructure/database/models.py` (`LotDocumentModel.category`), `backend/app/domain/schemas/document.py` (ou fichier du schéma `LotDocumentResponse` : champ `category: str | None`)
- Create: `backend/app/services/acte_service.py`
- Modify: `backend/app/services/document_service.py` (`store_generated_document`, partage du chemin de stockage avec `upload_document`)
- Modify: `backend/app/api/v1/endpoints/reservations.py` (les endpoints `certificate` / `certificate/email` / `receipt` délèguent à `ActeService` ; nouveaux `POST /{id}/acte`, `GET /{id}/acte`)
- Modify: `backend/app/api/v1/endpoints/lot_transitions.py` (`direct-engage`, `engage`, `option-engage`, `mark-promotion-received` appellent `acte_service.generate_and_store`)
- Modify: `backend/app/api/dependencies.py` (`ActeServiceDep`)
- Modify: `frontend/src/components/LotDetailModal.jsx` (badge « Acte », alerte + bouton « Régénérer »), `frontend/src/components/ClientDetailPage.jsx` (bouton « Acte » → acte archivé, repli sur génération à la volée)
- Test: `backend/app/tests/integration/test_api/test_acte_auto.py`, `frontend/src/components/__tests__/LotDetailModal.test.jsx` (cas ajoutés)

**Interfaces:**
- Consumes: `CertificateService.generate_reservation_certificate(...)` (T0, inchangée) ; transitions E3 vers `reservation_engagee` : `direct_engage`, `engage`, `option_engage`.
- Produces:
  - `ACTE_CATEGORY = "acte_reservation"` (dans `acte_service.py`).
  - `ActeNotReadyError(BusinessRuleError)` avec les messages existants (premier acompte non payé ; promotion non reçue).
  - `ActeService(session)` : `async build_certificate_pdf(reservation_id: int) -> tuple[bytes, str]` (PDF, nom de fichier `acte_reservation_{id}_lot{lot}.pdf` ; lève `NotFoundError` / `ActeNotReadyError` — reprend exactement la logique et les messages actuels des endpoints) ; `async generate_and_store(reservation_id: int, user_id: int | None) -> ActeResult` ; `async latest_acte(reservation_id: int) -> LotDocumentModel | None`.
  - `ActeResult` (dataclass) : `status: Literal["stored", "not_ready", "failed"]`, `document_id: int | None`, `error: str | None`. `generate_and_store` **ne lève jamais** : PDF/stockage en échec → rollback du savepoint (`session.begin_nested()`), `logger.exception("Acte generation failed", ...)`, `status="failed"`.
  - `DocumentService.store_generated_document(lot_id: int, reservation_id: int, filename: str, content: bytes, content_type: str, category: str, user_id: int | None) -> LotDocumentResponse` (ne fait pas `commit` ; l'appelant gère la transaction).
  - API : `POST /api/reservations/{id}/acte` → 201 `LotDocumentResponse` (régénère une **nouvelle** version, les anciennes restent) ; 400 si non prêt ; 502 `"La génération de l'acte a échoué. Réessayez."` si échec. `GET /api/reservations/{id}/acte` → PDF de la dernière version archivée, 404 `"Aucun acte archivé pour cette réservation."`.

- [ ] **Step 1: Rebase** — `git fetch origin && git rebase origin/dev` (branche non poussée) ; suite complète verte ; relire les chemins/lignes de cette tâche.
- [ ] **Step 2: Tests backend (RED)** dans `test_acte_auto.py`, avec une fixture `fake_storage` qui remplace `get_storage_client` dans `app.services.document_service` par un objet enregistrant les `upload_bytes` (et une variante qui lève `RuntimeError`) :
  - `test_engagement_stores_acte[direct-engage|engage|option-engage]` : après la transition (projet configuré pour rendre la route possible), exactement 1 `LotDocumentModel` avec `category == "acte_reservation"`, `reservation_id` = réservation courante, contenu uploadé commençant par `b"%PDF"`.
  - `test_acte_uses_acte_address` : client `acte_address="abroad"` → `ActeService.build_certificate_pdf` reçoit l'adresse étrangère (patch de `CertificateService.generate_reservation_certificate` pour capturer `client_address == "12 rue de l’Église, Abidjan, Côte d’Ivoire"`).
  - `test_engage_succeeds_when_storage_fails` : storage qui lève → transition 200, lot en `reservation_engagee`, **0** document en base.
  - `test_promotion_pending_skips_acte_then_generates_on_receipt` (Q1) : `sale_price` < prix → pas d'acte ; `POST .../mark-promotion-received` → 1 acte.
  - `test_regenerate_creates_new_version` : `POST /acte` deux fois → 2 documents, `GET /acte` renvoie le plus récent.
  - `test_get_acte_404_when_none`.
  - `test_certificate_endpoints_unchanged` : les messages 422 existants de `/certificate` et `/certificate/email` sont identiques après délégation.
- [ ] **Step 3: Lancer, vérifier l'échec** — `python -m pytest app/tests/integration/test_api/test_acte_auto.py -v` → FAIL (table sans `category`, service absent).
- [ ] **Step 4: Migration + modèle + schéma** ; `alembic upgrade head --sql` relu (pas d'application sur Supabase).
- [ ] **Step 5: `DocumentService.store_generated_document` + `ActeService`** ; endpoints PDF existants délégués (suppression du doublon) ; appels dans les 3 routes d'engagement et `mark-promotion-received` (après le service de transition, même requête ; le résultat n'altère pas la réponse).
- [ ] **Step 6: Backend vert** — suite complète + ruff.
- [ ] **Step 7: Frontend (RED puis GREEN)** — tests `LotDetailModal` : lot `reservation_engagee` avec un document `category: 'acte_reservation'` → badge « Acte de réservation » ; sans document de cette catégorie (promotion reçue ou nulle) → alerte « L'acte n'a pas été généré. » + bouton « Régénérer » qui appelle `POST /api/reservations/{id}/acte` puis recharge les documents. `ClientDetailPage` : le bouton « Acte » appelle d'abord `GET /api/reservations/{id}/acte`, puis `/certificate` sur 404.
- [ ] **Step 8: Vérification « sélection » (spec, déjà fait)** — dans le flux de création de réservation de `LotDetailModal` : recherche client par CIN et par téléphone, création à la volée, bouton « Continuer » désactivé tant que lot + client ne sont pas choisis. Écrire un test par comportement ; si l'un manque, le signaler au contrôleur avant de l'implémenter (hors périmètre si absent : à décider).
- [ ] **Step 9: Vérifs + commit** — vitest, eslint 0, build ; `git commit -m "feat: generate and archive the reservation deed on engagement"`.

---

### Task 2 (E4-T2, #31): Service de notifications

**Files:**
- Create: `backend/alembic/versions/0024_add_notifications.py` — table `notifications` : `id`, `client_id` FK, `lot_id` FK, `reservation_id` FK, `recipient` `String(20)` (`client` | `commercial`), `channel` `String(20)` (`email` | `sms` | `whatsapp`), `kind` `String(40)` (`option_confirmee` | `reservation_a_finaliser` | `reservation_engagee` | `rappel_expiration`), `status` `String(20)` (`sent` | `failed` | `not_configured`), `error` `Text` null, `deadline_at` `DateTime(tz)` null (date limite rappelée — sert à l'idempotence T4), `sent_at` `DateTime(tz)` non null, `sent_by_user_id` FK null ; contraintes CHECK sur les 4 énumérations ; index `(client_id)`, `(lot_id)`, `(reservation_id, kind, deadline_at)`. + `users.phone` `String(30)` null (Q2).
- Modify: `models.py` (`NotificationModel`, `UserModel.phone`), schémas utilisateur (champ `phone` optionnel en lecture/écriture)
- Create: `backend/app/domain/schemas/notification.py`, `backend/app/infrastructure/database/repositories/notification_repository.py`
- Create: `backend/app/services/notifications/__init__.py`, `channels.py`, `content.py`, `service.py`
- Modify: `backend/app/services/email_service.py` (envoi générique)
- Create: `backend/app/api/v1/endpoints/notifications.py` ; Modify: `reservations.py` (`POST /{id}/notify`), `app/api/v1/router.py`, `dependencies.py`
- Test: `backend/app/tests/unit/test_notification_content.py`, `backend/app/tests/integration/test_api/test_notifications.py`

**Interfaces:**
- Consumes: `ActeService.latest_acte(reservation_id)` (T1) et le contenu du fichier via `get_storage_client()`.
- Produces:
  - `channels.py` : `Channel = Literal["email", "sms", "whatsapp"]` ; `Recipient(name: str, email: str | None, phone: str | None)` ; `Attachment(filename: str, content: bytes)` ; `DeliveryResult(status: Literal["sent", "failed", "not_configured"], error: str | None = None)` ; `NotificationChannel` (Protocol) `async send(recipient, subject, body_html, attachments) -> DeliveryResult` ; `EmailChannel(email_service)` (pas d'email → `failed` « Le client n'a pas d'adresse email. » ; pas de `RESEND_API_KEY` → `not_configured`) ; `SmsChannel`, `WhatsAppChannel` → toujours `not_configured` ; `CHANNELS: dict[Channel, type]`.
  - `EmailService.send_email(to: str, subject: str, html: str, attachments: list[Attachment] | None = None) -> DeliveryResult`.
  - `content.py` : `NotificationContext` (dataclass : `kind`, `client_name`, `lot_numero`, `project_name`, `amount: float | None`, `deadline: datetime | None`, `commercial_name`, `commercial_phone: str | None`, `commercial_email`) ; `build_message(ctx) -> tuple[str, str]` (sujet, HTML). Montant : `option_confirmee` → `deposit` ; `reservation_a_finaliser` → `guarantee_amount` ; `reservation_engagee` → `sale_price` sinon prix du lot. Date limite : option → `expiration_date` ; à finaliser → `finalization_date` ; sinon aucune. Sujets : « Confirmation d'option — Lot {n} · {projet} », « Réservation à finaliser — Lot {n} · {projet} », « Réservation engagée — Lot {n} · {projet} », « Rappel : échéance le {jj/mm/aaaa} — Lot {n} · {projet} ».
  - `NotificationService(session, email_service)` : `async notify(reservation_id: int, channels: list[Channel], kind: str, user_id: int | None, *, recipient: Literal["client", "commercial"] = "client", deadline_at: datetime | None = None) -> list[NotificationModel]` (une ligne par canal, jamais d'exception de canal remontée) ; `async list(client_id: int | None, lot_id: int | None) -> list[NotificationModel]` (tri `sent_at` décroissant).
  - API : `POST /api/reservations/{id}/notify` corps `NotifyRequest(channels: list[Channel] (min 1, sans doublon), kind: Literal["option_confirmee", "reservation_a_finaliser", "reservation_engagee"])` → 200 `list[NotificationResponse]` ; `kind` incohérent avec le statut du lot (option ↔ `option`, à finaliser ↔ `reservation_a_finaliser`, engagée ↔ `reservation_engagee`) → 400 `"Ce type de notification ne correspond pas au statut du lot."` (règle `notification_kind_mismatch`). `GET /api/notifications?client_id=&lot_id=` → au moins un filtre sinon 422 `"Indiquez client_id ou lot_id."`.

- [ ] **Step 1: Tests (RED)** — unitaires `build_message` (pour chaque `kind` : sujet exact, n° de lot, projet, montant formaté « 10 000,00 DH », date limite présente/absente, nom + email du commercial, téléphone omis si `None`) ; intégration : `test_notify_email_sent` (`EmailService.send_email` patché → 1 ligne `sent`) ; `test_notify_without_email_records_failure` ; `test_notify_without_resend_key_not_configured` ; `test_sms_and_whatsapp_not_configured` ; `test_engagee_email_attaches_acte` (pièce jointe `%PDF` quand un acte archivé existe) ; `test_kind_mismatch_400` ; `test_list_requires_filter_422` ; `test_list_by_client_and_lot`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Migration 0024 + modèles + repository** ; `alembic upgrade head --sql` relu.
- [ ] **Step 4: Canaux, contenu, service, endpoints.**
- [ ] **Step 5: Suite verte + ruff** ; commit `feat: add notification service with email channel and history`.

---

### Task 3 (E4-T3, #32): UI « Notifier le client » + historique

**Files:**
- Create: `frontend/src/services/notificationsService.js` (`notifyReservation(reservationId, { channels, kind })`, `listNotifications({ clientId, lotId })` via `utils/api.js`)
- Create: `frontend/src/components/notifications/NotifyClientPanel.jsx`, `NotificationHistory.jsx` (+ tests dans `frontend/src/components/notifications/__tests__/`)
- Modify: `frontend/src/components/LotDetailModal.jsx`, `frontend/src/components/ClientDetailPage.jsx`
- Modify: gestion des commerciaux (champ « Téléphone », Q2) dans le composant d'édition utilisateur existant

**Interfaces:**
- Consumes: API T2.
- Produces: `<NotifyClientPanel reservationId kind client onClose />` — cases Email / SMS / WhatsApp ; pré-cochées depuis `client.notification_channels` ; SMS et WhatsApp désactivées avec la mention « bientôt disponible » (constante `AVAILABLE_CHANNELS = ['email']`) ; bouton « Envoyer » désactivé sans canal coché ; après envoi, un toast par canal (« Email envoyé » / « Échec : {error} » / « Canal non configuré »). `<NotificationHistory clientId? lotId? />` — tableau date, type (libellés : « Option confirmée », « Réservation à finaliser », « Réservation engagée », « Rappel d'échéance »), canal, destinataire, statut (« Envoyé », « Échec », « Non configuré »), auteur ; état vide « Aucune notification ».

- [ ] **Step 1: Tests (RED)** — `NotifyClientPanel` : pré-cochage depuis `['email','sms']` → seule Email cochée et active, SMS cochée mais désactivée et exclue de l'envoi ; appel API avec `{ channels: ['email'], kind }` ; toasts. `NotificationHistory` : rendu des libellés, état vide, filtre transmis. `LotDetailModal` : après succès de `start-option`, `direct-reservation`/`to-reservation`, `direct-engage`/`engage`/`option-engage`, le panneau s'ouvre avec le bon `kind`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter** service, composants, intégrations (historique dans un onglet/section « Notifications » de `LotDetailModal` et de `ClientDetailPage`).
- [ ] **Step 4: vitest, eslint 0, build** ; commit `feat: notify client after each reservation step with history`.

---

### Task 4 (E4-T4, #33): Rappels d'expiration quotidiens

**Files:**
- Modify: `backend/app/core/config.py` (`REMINDER_DAYS_BEFORE: int = 2`, `SCHEDULER_ENABLED: bool = True`, `REMINDER_TIMEZONE: str = "Africa/Casablanca"`) ; `backend/app/tests/conftest.py` ou environnement de test : `SCHEDULER_ENABLED=False`
- Create: `backend/app/services/reminder_service.py`, `backend/app/core/scheduler.py`
- Modify: `backend/app/main.py` (`lifespan` : démarrage/arrêt du scheduler si `SCHEDULER_ENABLED`)
- Modify: `pyproject.toml`, `requirements.txt`, `Dockerfile` (`apscheduler>=3.10,<4`)
- Test: `backend/app/tests/integration/test_reminders.py`, `backend/app/tests/unit/test_scheduler.py`

**Interfaces:**
- Consumes: `NotificationService.notify(..., recipient=..., deadline_at=...)` et la table `notifications` (T2).
- Produces:
  - `REMINDER_LOCK_ID = 7_340_042` (constante dans `reminder_service.py`).
  - `async send_expiration_reminders(session: AsyncSession, now: datetime) -> int` — cibles : lots `option` dont la réservation a `expiration_date` dans `[now, now + REMINDER_DAYS_BEFORE jours]`, lots `reservation_a_finaliser` dont `finalization_date` est dans la même fenêtre ; pour chacune, sauf si une ligne `notifications(reservation_id, kind="rappel_expiration", deadline_at=<date limite>)` existe déjà : notifie le commercial (`recipient="commercial"`, email) et le client (`recipient="client"`, canaux `client.notification_channels`, défaut `["email"]`) ; renvoie le nombre de réservations rappelées. Sous PostgreSQL, commence par `SELECT pg_try_advisory_xact_lock(:id)` et renvoie `0` si `false` ; sous SQLite, pas de verrou.
  - `scheduler.py` : `start_scheduler() -> AsyncIOScheduler` (job `CronTrigger(hour=8, minute=0, timezone=settings.REMINDER_TIMEZONE)`, `id="expiration_reminders"`, `coalesce=True`, `max_instances=1`, le job ouvre sa propre session et appelle `send_expiration_reminders(session, datetime.now(UTC))`) ; `stop_scheduler(scheduler) -> None`.

- [ ] **Step 1: Tests (RED)** — `test_reminds_option_expiring_in_window` (J+1 → rappelé, 2 lignes : commercial + client) ; `test_ignores_outside_window` (J+3 et passé) ; `test_reminds_finalisation_deadline` ; `test_reminders_idempotent` (2 appels → 2e renvoie 0, pas de nouvelle ligne) ; `test_new_deadline_after_extension_reminds_again` (prolongation → nouvelle `deadline_at` → nouveau rappel) ; `test_lock_not_acquired_returns_zero` (dialecte forcé `postgresql` + exécution patchée renvoyant `False`) ; `test_scheduler_job_configured` (trigger 08:00 Africa/Casablanca, `max_instances=1`) ; `test_lifespan_skips_scheduler_when_disabled`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter** service, scheduler, réglages, `lifespan`, dépendance.
- [ ] **Step 4: Suite verte + ruff** ; vérifier au démarrage local (`uvicorn` sans `--reload`) la ligne de log « Scheduler started » ; commit `feat: send daily expiration reminders once per deadline`.

---

### Task 5 (E4-T5, #52): Modifier une réservation engagée — à détailler

Hors spec à ce jour ; périmètre et critères dans l'issue #52 (montants : prix catalogue, prix total convenu, prix figurant sur l'acte, écart à régulariser, premier acompte reçu ; échéance de l'écart au début / à la fin / à date précise ; reste à payer = prix total convenu − paiements reçus ; refus de solder tant qu'une somme reste due ; historique avant/après ; nouvelle version d'acte si les données de l'acte changent).

Prérequis avant d'écrire les étapes :
1. Q4 et Q5 répondus (voir « Décisions à confirmer ») ; Q6 avec défaut non bloquant.
2. T1 livré (versions d'actes via `ActeService.generate_and_store`).
3. Ajout d'une section E4-T5 dans la spec E4 (validée par l'utilisateur), puis plan détaillé en sous-tâches (probablement : T5a modèle financier + migration `0025` ; T5b API de modification + historique ; T5c écrans engagement/modification/échéancier ; T5d règle de solde).

---

## Fin d'epic

- [ ] Revue finale de toute la branche (modèle le plus capable), corrections, CI verte.
- [ ] PR `feature/e4-reservation` → `dev` ; migrations 0023/0024 appliquées sur Supabase **uniquement avec l'accord de l'utilisateur**.
- [ ] Recette de l'utilisateur dans l'app (PDF avec ’ et arabe, acte auto sur les 3 voies, notification email + historique, rappel), puis fermeture des issues et `AVANCEMENT.md` à jour.
