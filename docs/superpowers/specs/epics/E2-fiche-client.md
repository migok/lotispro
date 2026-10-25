# E2 — 👤 #7 Fiche client

**Design parent :** [roadmap design](../2026-10-22-roadmap-lotispro-design.md) §5 E2
**Ticket Asana :** 👤 [FEATURE #7] (1214275894876452) + sous-tâches 1214275895081423 (identité), 1214275625826149 (canal), 1214275927317836 (validation)
**Dépend de :** E0 — **Débloque :** E4 (adresse d'acte, préférences de notification)

## Modèle de données (`clients`)

| Champ | Type | Obligatoire (formulaire) | Note |
|---|---|---|---|
| `last_name` | str(100) | oui | backfill = ancien `name` |
| `maiden_name` | str(100) | non | |
| `first_name` | str(100) | oui (création/édition) | vide pour les clients existants |
| `cin` | str(20) | non | format validé |
| `phone` | str(20) | oui | international |
| `whatsapp` | str(20) | non | pré-rempli depuis `phone` côté UI |
| `email` | str(255) | non | format validé |
| `address_morocco` | str(500) | non | backfill = ancien `address` |
| `address_abroad` | str(500) | non | |
| `city_morocco` | str(100) | oui si `address_morocco` remplie | ajouté le 2026-10-25 (migration 0018) |
| `city_abroad` | str(100) | oui si `address_abroad` remplie | ajouté le 2026-10-25 (migration 0018) |
| `country_abroad` | str(100) | oui si `address_abroad` remplie | ajouté le 2026-10-25 (migration 0019) ; imprimé sur l'acte |
| `acte_address` | `'morocco' \| 'abroad'` \| null | oui si les 2 adresses sont remplies | sinon déduit de l'adresse remplie |
| `acquisition_channel` | `'smap' \| 'bureau_vente' \| 'reseaux_sociaux' \| 'recommandation' \| 'samsar'` | oui (formulaire) | nullable en base |
| `acquisition_referrer` | str(200) | oui si `recommandation` ou `samsar` | « Qui ? » |
| `acquisition_date` | date | oui si `samsar` | « Quand ? » |
| `notification_channels` | liste JSON parmi `email`, `sms`, `whatsapp` | non | défaut `["email"]` si email renseigné |
| `name` | str(200) | — | **conservé**, recalculé = « Prénom Nom » à chaque écriture (compatibilité écrans/PDF) |

`client_type` existant conservé. Migration `0017` avec `downgrade` (ré-assemble `name` et `address`).

## Règles de validation
- **Au moins une adresse** (Maroc ou étranger) est obligatoire ; chaque adresse remplie exige sa **ville** (décision utilisateur, recette du 2026-10-25).
- Une notice indique que l'adresse d'acte (adresse + ville) figurera sur l'acte de réservation et l'acte final.
- CIN marocain : `^[A-Z]{1,2}\d{1,6}$` après passage en majuscules et suppression des espaces (*choix de Claude*).
- Téléphone : format E.164 après normalisation (`+212…`) ; un numéro local `0XXXXXXXXX` est converti en `+212XXXXXXXXX`.
- Email : `EmailStr`.
- Doublons : `GET /api/v1/clients/duplicates?cin=&email=&exclude_id=` renvoie les clients correspondants ; l'UI affiche une **alerte non bloquante** avec lien vers la fiche existante.
- Erreurs renvoyées par champ (422 Pydantic) et affichées sous chaque champ ; toast de succès à l'enregistrement.

## Périmètre

- **E2-T1** Migration 0017 + modèle + schémas `ClientCreate` / `ClientUpdate` / `ClientResponse` + backfill.
- **E2-T2** Validation (CIN, téléphone, conditionnels canal/adresse) + endpoint doublons.
- **E2-T3** Formulaire (création et édition) dans l'ordre défini, champs conditionnels, pré-remplissage WhatsApp, préférences de notification. Extrait dans `components/clients/ClientForm.jsx`.
- **E2-T4** Fiche client et listes : affichage des nouveaux champs ; recherche par nom, prénom, CIN, téléphone ; PDF d'acte utilise `acte_address`.

## Critères d'acceptance (ticket Asana)
- [ ] Tous les champs présents dans l'ordre défini ; obligatoires signalés visuellement.
- [ ] Validation des formats CIN, téléphone, email.
- [ ] Choix d'adresse d'acte fonctionnel (obligatoire si deux adresses).
- [ ] Section canal avec champs conditionnels dynamiques ; canal obligatoire.
- [ ] Message d'erreur par champ ; toast de confirmation ; fiche éditable après création.
- [ ] Détection des doublons par CIN et email.
- [ ] Les clients existants s'affichent sans erreur après migration (nom conservé).
