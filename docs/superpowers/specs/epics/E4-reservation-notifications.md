# E4 — 🔄 #8 Réservation : acte auto, notifications, rappels

**Design parent :** [roadmap design](../2026-10-22-roadmap-lotispro-design.md) §5 E4
**Ticket Asana :** 🔄 [FEATURE #8] (1214275786426817) + sous-tâches 1214275786574543 (sélection), 1214275927432961 (type), 1214275927376451 (acte), 1214275625856582 (notifications)
**Dépend de :** E2 (adresse d'acte, préférences), E3 (toutes les voies d'engagement passent par `lot_workflow`)

## Déjà fait (vérifié à l'audit, à couvrir par tests seulement)
- Sélection lot disponible + client, 3 choix (option / à finaliser / engagée), garantie, type de paiement, date limite.
- PDF d'acte (`certificate_service.generate_reservation_certificate`) téléchargeable et envoyable par email.
- Restant de la sous-tâche « Sélection » à vérifier en E4-T1 : recherche client par CIN/téléphone et création à la volée ; bouton « Continuer » désactivé tant que lot + client ne sont pas choisis.

## Périmètre

### E4-T0 Correctif PDF : police Unicode (ajouté le 2026-10-25, issue #49)
- Les PDF d'acte et de reçu (`certificate_service.py`, fpdf2 + Helvetica) échouent en 500 (`FPDFUnicodeEncodingException`) sur tout caractère hors latin-1 : apostrophe typographique `’` (claviers mobiles), guillemets `“ ”`, écriture arabe.
- Embarquer une police Unicode TTF (DejaVuSans regular + bold) et l'enregistrer via `pdf.add_font` pour tous les textes ; arabe : `set_text_shaping(True)` si disponible, sinon au minimum aucun crash.
- Tests : certificat et reçu avec `’`, `“ ”`, « Côte d’Ivoire », « وجدة » → PDF valide ; `GET /api/reservations/{id}/certificate` → 200.
- **Prérequis d'E4-T1** (l'acte devient automatique à l'engagement : un échec PDF ne doit plus arriver pour un caractère courant).

### E4-T1 Acte généré automatiquement
- Sur **toute** arrivée en `reservation_engagee` (`direct-engage`, `engage`, `option-engage`), l'acte PDF est généré et
  enregistré comme document du lot (`document_service`, catégorie `acte_reservation`), dans la même requête.
- L'acte utilise `clients.acte_address` (E2).
- Visible et téléchargeable depuis `LotDetailModal` (onglet documents) et la fiche client.
- La règle existante « premier acompte payé requis » est conservée pour le téléchargement manuel ; à l'engagement
  le premier acompte est par définition reçu (`guarantee_amount`).
- Échec de génération PDF → la transition réussit quand même, l'erreur est journalisée et une alerte s'affiche
  avec un bouton « Régénérer » (*choix de Claude* : ne pas bloquer la vente pour un PDF).

### E4-T2 Service de notifications
- Interface `NotificationChannel.send(recipient, subject, body, attachments) -> DeliveryResult`.
- `EmailChannel` (Resend, existant). `SmsChannel` / `WhatsAppChannel` : stubs qui renvoient `not_configured`.
- Table `notifications` : `client_id`, `lot_id`, `reservation_id`, `channel`, `kind`
  (`option_confirmee` | `reservation_a_finaliser` | `reservation_engagee` | `rappel_expiration`), `status`
  (`sent` | `failed` | `not_configured`), `error`, `sent_at`, `sent_by_user_id`.
- Contenu : n° de lot, projet, montant, date limite si applicable, nom + téléphone + email du commercial ; lien vers l'acte pour `reservation_engagee`.
- `POST /api/v1/reservations/{id}/notify` {channels[], kind} ; `GET /api/v1/notifications?client_id=&lot_id=`.

### E4-T3 UI notifications
- Après chaque étape (option, à finaliser, engagée) : panneau « Notifier le client » avec cases pré-cochées depuis `clients.notification_channels` ; SMS / WhatsApp grisés « bientôt disponible » tant que E7 n'est pas fait.
- Historique des notifications sur `LotDetailModal` et `ClientDetailPage`.

### E4-T4 Rappels d'expiration
- APScheduler démarré dans `lifespan`, job quotidien à 08:00 (Africa/Casablanca).
- Verrou `pg_try_advisory_lock(<id fixe>)` : une seule exécution malgré 2 workers ; sous SQLite (dev/tests) pas de verrou.
- Cible : options (`expiration_date`) et réservations à finaliser (`finalization_date`) qui expirent dans `REMINDER_DAYS_BEFORE` jours (setting, défaut 2).
- Notifie le commercial (email) et le client (canaux préférés) ; idempotent : pas de second rappel du même `kind` pour la même réservation et la même date limite (vérifié dans `notifications`).
- Le job est une fonction testable `send_expiration_reminders(now) -> int` indépendante du scheduler.

### E4-T5 Modifier une réservation engagée + montants clarifiés (ajouté le 2026-10-28, issue #52)

**Source :** issue #52 (besoin validé par l'utilisateur le 2026-10-27). Réponses : rôles = commercial (ses réservations) et manager (toutes) ; rien en production, donc aucune reprise des anciennes données « promotion » ; la validation notaire/comptable du traitement de l'écart reste hors application (l'application trace, elle ne valide pas).

**Constat (code au 2026-10-28) :** un « paiement » n'est aujourd'hui qu'une échéance cochée `paid` (date, notes, sans montant partiel ni justificatif) ; la « promotion » vaut `prix catalogue − sale_price`, avec un simple booléen `promotion_received` et un moment `debut | fin`. L'échéancier est calculé sur `sale_price` avec la promotion retranchée de l'acompte.

#### Définitions (mêmes libellés partout : engagement, modification, échéancier, solde, acte)
| Libellé UI | Donnée | Règle |
|---|---|---|
| Prix catalogue | `lots.price` | référence affichée, jamais utilisée comme prix de la réservation |
| Prix total convenu | `reservations.agreed_total_price` (nouveau) | montant total demandé au client ; défaut = prix catalogue |
| Prix figurant sur l'acte | `reservations.sale_price` (existant) | imprimé sur l'acte ; défaut = grille de prix (`lot_pricing_config`) sinon prix total convenu ; ≤ prix total convenu |
| Écart à régulariser | calculé = convenu − acte | jamais saisi, jamais ajouté ni déduit une seconde fois ; remplace « Montant promotion » |
| Premier acompte reçu | calculé = somme des encaissements sans échéance (`reservation_payments.installment_id` null) | encaissé à l'engagement (garantie conservée, versement d'option conservé, premier versement) ; 0 si la garantie a été remboursée ; remplace « Premier acompte (ND) » ; `reservations.guarantee_amount` garde son sens d'origine (garantie versée) — précisé le 2026-10-28 |
| Reste à payer | calculé = convenu − total des encaissements | seule source du « reste » affiché |

#### Encaissements et échéancier
- Nouvelle table `reservation_payments` (encaissements) : `reservation_id`, `amount` (> 0), `paid_on` (date), `method` (`cash | card | check | transfer`), `reference` (texte libre), `document_id` (justificatif **facultatif** — décision du 2026-10-28 —, `lot_documents` catégorie `justificatif_paiement`), `installment_id` (null = premier acompte), `recorded_by_user_id`, `created_at`. **Jamais modifiée ni supprimée** par l'application.
- À l'engagement, le premier acompte reçu crée l'encaissement n° 1 (`installment_id` null).
- L'échéancier couvre exactement `prix total convenu − premier acompte reçu`. L'écart y figure comme **échéance de type `gap`** (« Écart à régulariser ») placée **au début**, **à la fin** ou **à une date précise** (`reservations.gap_due_timing` : `debut | fin | date`, `gap_due_date`). Les autres échéances gardent les types `deposit` / `balance` et le plan existant (pourcentage, nombre, périodicité, délai).
- Une échéance n'est jamais un encaissement : son statut est **calculé** à partir des encaissements qui lui sont affectés — « À recevoir » (0), « Partiellement reçu » (0 < reçu < montant), « Reçu » (reçu = montant). Un encaissement ne peut pas dépasser le restant dû de son échéance. L'ordre de paiement actuel (acompte avant solde) reste appliqué.
- « Marquer payé » est remplacé par « Enregistrer un encaissement » (montant prérempli avec le restant dû de l'échéance, date, mode, référence, justificatif). L'email de confirmation de paiement existant est envoyé par encaissement.
- **Solde :** le passage en `reservation_soldee` est refusé tant que le reste à payer > 0, écart compris, avec le message « Reste à payer : {montant} MAD — la réservation ne peut pas être soldée. » ; le prix de la vente créée (`sales.price`) = prix total convenu (le champ libre actuel n'est plus saisi).
- Exemple de référence (critère d'acceptance) : convenu 500 000, acte 450 000, écart 50 000 à la fin, premier acompte 100 000 → reste 400 000 dont 50 000 à la fin ; après 350 000 encaissés → reste 50 000, solde refusé ; après 50 000 sur l'échéance « Écart » → reste 0, solde possible.

#### Émission de l'acte (décision du 2026-10-28)
- Nouveau réglage projet `projects.acte_min_paid_pct` (pourcentage, 0-100, **défaut 10**), modifiable par un manager dans l'onglet Paramètres du projet, à côté des statuts optionnels (E3).
- L'acte ne peut être émis (génération automatique, régénération, téléchargement et envoi manuels) que si le total des encaissements, premier acompte compris, est **> 0 et ≥ `acte_min_paid_pct` % du prix total convenu**. Sinon : 400 « L'acte sera disponible quand {pct} % du prix total convenu aura été encaissé ({montant} MAD sur {seuil} MAD). »
- Cette règle **remplace** celles d'E4-T1 (« premier versement d'acompte payé » et « promotion reçue », dont le choix Q1).
- Génération automatique : à l'engagement si le seuil est atteint ; sinon lors de l'encaissement qui fait franchir le seuil (une seule fois : pas de nouvelle version si un acte existe déjà pour la réservation, hors modification de ses données).
- Le reçu de paiement reste disponible dès le premier acompte.

#### Modifier une réservation engagée
- Bouton « Modifier la réservation » dans `LotDetailModal`, uniquement au statut `reservation_engagee`, pour le commercial auteur de la réservation et les managers (contrôle backend, 403 sinon).
- Formulaire prérempli ; champs modifiables : prix total convenu, prix figurant sur l'acte, moment/date de l'écart, notes, montants et dates des échéances **non encore reçues**. Non modifiables : lot, client, statut, encaissements, premier acompte.
- `PUT /api/reservations/{id}/engagement` avec `reason` obligatoire et `expected_updated_at` : refus 409 « La réservation a été modifiée entre-temps. Rechargez la fiche. » si la réservation a changé ; refus 400 si le lot n'est plus `reservation_engagee` (vérifié sous verrou de ligne), si le prix total convenu < total déjà encaissé, si le prix sur l'acte > prix total convenu, ou si les échéances ne totalisent pas `convenu − premier acompte` ou descendent sous ce qui leur est déjà affecté.
- Enregistrement atomique ; journal `reservation_changes` : `reservation_id`, `user_id`, `changed_at`, `reason`, `before` (JSON), `after` (JSON). Historique visible dans la fiche lot.
- Si une donnée imprimée sur l'acte change (prix sur l'acte, premier acompte), une nouvelle version de l'acte est générée via `ActeService.generate_and_store` ; l'ancienne reste consultable ; un échec n'annule pas la modification et affiche l'alerte « Régénérer » existante.
- Annuler le formulaire ne modifie rien. Après enregistrement, la fiche lot, les montants et l'échéancier sont rechargés.

#### Migration
`0025` additive : colonnes `agreed_total_price`, `gap_due_timing`, `gap_due_date` sur `reservations` ; `acte_min_paid_pct` (défaut 10) sur `projects` ; type d'échéance `gap` ; tables `reservation_payments` et `reservation_changes`. `promotion_amount`, `promotion_received`, `promotion_paid_timing` ne sont plus lus ni écrits (colonnes conservées, dépréciées ; aucune conversion des données de test).

## Critères d'acceptance (ticket Asana)
- [ ] Les PDF acceptent les caractères hors latin-1 (’, “ ”, arabe) sans erreur.
- [ ] L'acte est généré automatiquement sans action manuelle, données correctes, accessible depuis fiche lot et client, PDF téléchargeable.
- [ ] Interface de choix des canaux après chaque étape, préférences pré-cochées.
- [ ] Envoi effectif par email ; historique visible sur fiche lot et client.
- [ ] Rappel avant expiration envoyé une seule fois, même avec 2 workers.
- [ ] (#52) Une réservation engagée se modifie avec droits et statut contrôlés côté backend, motif et historique avant/après ; nouvelle version d'acte si ses données changent.
- [ ] (#52) Prix catalogue, prix total convenu, prix sur l'acte, écart et premier acompte reçu présentés sans ambiguïté ; l'écart (début / fin / date) se suit par les encaissements réels, sans double comptage ; l'exemple de référence donne 400 000 → 50 000 → 0.
- [ ] (#52) Le solde est refusé tant qu'une somme reste due ; aucun encaissement ni justificatif n'est supprimé ou réécrit.
