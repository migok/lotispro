# E4 — 🔄 #8 Réservation : acte auto, notifications, rappels

**Design parent :** [roadmap design](../2026-10-22-roadmap-lotispro-design.md) §5 E4
**Ticket Asana :** 🔄 [FEATURE #8] (1214275786426817) + sous-tâches 1214275786574543 (sélection), 1214275927432961 (type), 1214275927376451 (acte), 1214275625856582 (notifications)
**Dépend de :** E2 (adresse d'acte, préférences), E3 (toutes les voies d'engagement passent par `lot_workflow`)

## Déjà fait (vérifié à l'audit, à couvrir par tests seulement)
- Sélection lot disponible + client, 3 choix (option / à finaliser / engagée), garantie, type de paiement, date limite.
- PDF d'acte (`certificate_service.generate_reservation_certificate`) téléchargeable et envoyable par email.
- Restant de la sous-tâche « Sélection » à vérifier en E4-T1 : recherche client par CIN/téléphone et création à la volée ; bouton « Continuer » désactivé tant que lot + client ne sont pas choisis.

## Périmètre

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

## Critères d'acceptance (ticket Asana)
- [ ] L'acte est généré automatiquement sans action manuelle, données correctes, accessible depuis fiche lot et client, PDF téléchargeable.
- [ ] Interface de choix des canaux après chaque étape, préférences pré-cochées.
- [ ] Envoi effectif par email ; historique visible sur fiche lot et client.
- [ ] Rappel avant expiration envoyé une seule fois, même avec 2 workers.
