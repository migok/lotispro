# E7 — Notifications SMS / WhatsApp

**Design parent :** [roadmap design](../2026-10-22-roadmap-lotispro-design.md) §5 E7
**Ticket Asana :** Notifications client - Choix du canal (1214275625856582) — partie SMS / WhatsApp
**Dépend de :** E4 (interface `NotificationChannel`) — **Bloqué par :** choix du fournisseur (décision utilisateur)

## Périmètre

- **E7-T1 Décision fournisseur** : comparer 2-3 fournisseurs couvrant le Maroc (ex. Twilio, Infobip,
  WhatsApp Business Cloud API de Meta) sur prix par message, délai d'approbation des modèles WhatsApp,
  numéro expéditeur marocain. Décision consignée dans `AVANCEMENT.md`.
- **E7-T2 Canal SMS** : implémentation de `SmsChannel` ; secrets en variables d'environnement Railway ; tests avec client HTTP simulé.
- **E7-T3 Canal WhatsApp** : `WhatsAppChannel` avec modèles de messages approuvés pour chaque `kind` ; activation des cases dans l'UI.

## Critères d'acceptance
- [ ] Envoi effectif SMS et WhatsApp depuis l'écran de notification et le rappel automatique.
- [ ] Échec fournisseur → `notifications.status = failed` avec message, visible dans l'historique.
- [ ] Aucun secret dans le code ni dans les logs.
