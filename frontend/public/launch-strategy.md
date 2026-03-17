# LotisPro — Plan de lancement Go-to-Market
## France + Maroc · Q2 2026

---

## Positionnement central

**Pour qui :** Directeur de Programmes et Directeur Commercial dans des sociétés de promotion immobilière gérant 50 à 500 lots par projet.

**Problème adressé :** Tableurs Excel partagés, double-réservations, zéro visibilité temps réel sur les lots et les réservations.

**Différenciateur :** LotisPro est le seul outil qui combine carte GeoJSON interactive + pipeline de réservation avec expiration automatique + planning de paiement échelonné + RBAC équipe commerciale — dans une seule plateforme, sans Excel.

**Tagline de lancement :** *"Chaque lot vendu. Aucun perdu de vue."*

---

## Phase 1 — Pré-lancement (J-21 à J-1)

### Objectif
Construire une liste d'attente qualifiée de 30 prospects avant le lancement public. Chauffer l'audience cible sur LinkedIn. Préparer tous les assets.

---

### Semaine 1 (J-21 à J-14) — Fondations

**LinkedIn France (profil fondateur + page LotisPro)**

Post 1 — Le problème (accroche, pas de vente) :
> "On estime que 73 % des promoteurs immobiliers en France gèrent encore leurs réservations dans Excel. Deux commerciaux, un même lot, deux promesses différentes au même client. Ça arrive chaque semaine dans des équipes de 5 personnes. On a construit quelque chose pour ça. Lancement dans 3 semaines."

Post 2 — Le produit moment (carte GeoJSON) :
> "Voici ce que voit un commercial LotisPro quand il ouvre un projet : une carte de ses lots, colorée par statut. Vert = disponible. Ambré = réservé. Rouge = vendu. Il clique sur un lot et réserve en 90 secondes. Pas d'Excel ouvert, pas d'email à envoyer, pas de collision possible."
> [Capture ou GIF du mockup carte de LandingPage]

**LinkedIn Maroc (arabe et français — cibler Casablanca, Rabat, Tanger)**

Post 1 — Même accroche, adapté :
> "La majorité des groupes immobiliers marocains gèrent leurs programmes en Excel ou WhatsApp. Un commercial à Casablanca et un autre à Rabat peuvent réserver le même lot le même jour. LotisPro règle ça. Lancement bientôt — on cherche 5 groupes pilotes au Maroc."

**Actions concrètes semaine 1 :**
- [ ] Créer page LinkedIn LotisPro
- [ ] Publier post fondateur "le problème" FR + MA
- [ ] Préparer liste de 50 prospects cibles (LinkedIn Sales Navigator ou recherche manuelle) :
  - France : chercher "Directeur de Programmes" + "Directeur Commercial" dans promoteurs 10-200 salariés
  - Maroc : chercher "Directeur Immobilier", "Responsable Programmes", groupes type Alliances, Addoha, Résidences Dar Saada, promoteurs régionaux
- [ ] Configurer le formulaire /contact pour capturer la source (UTM)

---

### Semaine 2 (J-14 à J-7) — Liste d'attente

**Landing page : activer la bannière "lancement imminent"**
Ajouter en haut de LandingPage.jsx un bandeau :
> "LotisPro est en lancement — 10 places de démo disponibles cette semaine. [Réserver la mienne →]"

**Outreach LinkedIn manuel (30 messages)**

Message type pour France (InMail ou connexion + message) :
> "Bonjour [prénom], je vois que vous gérez [X] programmes chez [société]. On lance LotisPro la semaine prochaine — une plateforme qui remplace Excel pour la gestion de lots et réservations. Je cherche 5 directeurs de programmes en France pour une démo de 30 min avant le lancement public. Ça vous intéresse ?"

Message type pour Maroc :
> "Bonjour [prénom], je suis en train de lancer LotisPro, une plateforme de gestion de lots immobiliers conçue pour les promoteurs marocains — suivi des réservations en temps réel, carte interactive, plans de paiement en MAD. On cherche 5 sociétés pilotes au Maroc. 30 minutes de démo, sans engagement. Disponible cette semaine ?"

**Actions concrètes semaine 2 :**
- [ ] Envoyer 30 messages LinkedIn ciblés (15 FR + 15 MA)
- [ ] Publier post "derrière les coulisses" (screenshot du dashboard ou de la carte)
- [ ] Créer un document "one-pager LotisPro" PDF (1 page, valeur prop + 3 fonctionnalités + CTA contact)
- [ ] Préparer 3 scénarios de démo (projet 50 lots / 200 lots / 500 lots)

---

### Semaine 3 (J-7 à J-1) — Chauffe finale

**Séquence cold email (3 emails — voir plan Phase 4)**

Email 1 — J-7 (hook douleur double-réservation)
Email 2 — J-3 (produit moment : carte + paiements)
Email 3 — J-1 (close doux : "on lance demain")

**Post LinkedIn J-2 :**
> "Demain on lance LotisPro. 18 mois de travail. Une question qu'on s'est posée chaque semaine : est-ce que ça, ça élimine vraiment le problème du doublon de réservation ? La réponse est oui. Voici comment. [lien landing page]"

**Actions concrètes semaine 3 :**
- [ ] Envoyer cold email séquence (liste extraite de LinkedIn / base de contacts)
- [ ] Confirmer 5 à 10 démos calées pour la semaine du lancement
- [ ] Préparer les scénarios de démo live (données fictives réalistes en MAD et EUR)
- [ ] Vérifier que /contact → backend fonctionne et que les emails arrivent
- [ ] Préparer le post de lancement J+0

---

## Phase 2 — Lancement (J+0 à J+7)

### Jour J — Publication publique

**Post LinkedIn lancement (FR + MA séparés)**

France :
> "C'est lancé. LotisPro est disponible. Pour les promoteurs immobiliers qui en ont fini avec Excel.
>
> Ce qu'on a construit :
> — Carte GeoJSON interactive de vos lots
> — Pipeline de réservation avec expiration automatique
> — Plans de paiement échelonnés (MAD / EUR)
> — RBAC : directeur, commercial, client — chacun voit ce qu'il doit voir
>
> On offre 10 démos personnalisées cette semaine. Chacune est calée sur vos projets en cours, pas sur un template générique.
>
> Lien en commentaire. [tag 3 contacts ciblés]"

Maroc :
> [Version adaptée en français, mention MAD, mention des projets marocains types, tag contacts Casablanca/Rabat]

**Actions J+0 à J+3 :**
- [ ] Publier les posts lancement FR + MA
- [ ] Répondre à chaque commentaire dans l'heure
- [ ] Relancer les 30 prospects LinkedIn contactés en semaine 2 ("c'est lancé, votre créneau est dispo")
- [ ] Activer la séquence email post-lancement pour les prospects qui n'ont pas répondu

**Actions J+3 à J+7 :**
- [ ] Faire les 5 à 10 démos confirmées
- [ ] Après chaque démo : envoyer un récapitulatif personnalisé + proposition tarifaire sous 24h
- [ ] Demander un retour testimonial aux prospects qui ont vu la démo (même s'ils ne signent pas)

---

## Phase 3 — Post-lancement (J+8 à J+90)

### J+8 à J+30 — Consolidation et premiers clients

**Objectif :** Signer les 2 à 3 premiers clients payants. Recueillir les premiers témoignages réels.

**Actions :**
- [ ] Relancer tous les prospects ayant fait une démo mais pas signé (délai 7 jours)
- [ ] Publier un post "J+7 de lancement" : ce qu'on a appris des premières démos (transparence = confiance)
- [ ] Remplacer les témoignages fictifs de la landing page par de vraies citations dès le premier client

**Canaux à activer post J+30 :**
- Salons : SIMED (Maroc, nov.), MIPIM (Cannes, mars), Salon de l'Immobilier Paris (SIMI, déc.)
- Partenaires : notaires, syndics, cabinets d'architecture qui travaillent avec des promoteurs
- Référencement : article de blog "Comment gérer 200 lots sans Excel" (SEO long terme)

### J+30 à J+90 — Croissance

**Objectif :** 5 clients payants, 2 marchés actifs (FR + MA), premiers témoignages vidéo ou écrits sur la landing page.

**Actions :**
- [ ] Programme de référence : offrir 1 mois gratuit au client qui recommande un nouveau client signé
- [ ] Webinaire LinkedIn : "Comment les promoteurs immobiliers gèrent 500 lots sans Excel" (démo live, 30 min, inscription /contact)
- [ ] Partenariat 1 notaire France + 1 cabinet d'architecture Maroc (ils voient tous les promoteurs)
- [ ] Mise à jour landing page avec vrais chiffres clients (X lots gérés, X projets actifs)

---

## Messaging par segment

### Segment 1 — Directeur de Programmes (France)
**Douleur principale :** Doublon de réservation, versions Excel incontrôlées
**Message :** "Un seul endroit où votre équipe voit les mêmes données en temps réel. Zéro collision possible."
**Canal prioritaire :** LinkedIn InMail, cold email, salon SIMI/MIPIM
**CTA :** Démo 30 min sur vos projets en cours

### Segment 2 — Directeur Commercial (France)
**Douleur principale :** Pas de visibilité sur les réservations de l'équipe, pas d'alerte expiration
**Message :** "Votre tableau de bord commercial : classement des agents, réservations qui expirent cette semaine, CA objectif vs réalisé — en temps réel."
**Canal prioritaire :** LinkedIn, cold email
**CTA :** Démo 30 min focalisée sur les KPIs commerciaux

### Segment 3 — DG / Directeur Général (Maroc)
**Douleur principale :** Coordination entre bureaux, transparence actionnaire, multi-devises MAD/EUR
**Message :** "Pilotez vos programmes depuis Casablanca ou Rabat. Un seul dashboard. Toutes les équipes. Toutes les devises."
**Canal prioritaire :** LinkedIn, référencement par partenaires notaires/cabinets
**CTA :** Démo 30 min multi-projets

---

## Checklist pré-lancement

### Technique
- [ ] /contact → backend opérationnel, emails reçus, pas de bug de soumission
- [ ] Page /contact mobile-friendly (testée sur iPhone + Android)
- [ ] LandingPage chargée en < 2s (Lighthouse score > 85)
- [ ] Toutes les sections LandingPage visibles et correctes après les rewrites Phases 1-3
- [ ] Pas de lien /login cassé dans la nav (vérifié après remplacement nav CTA)

### Marketing
- [ ] Page LinkedIn LotisPro créée et complétée (logo, description, lien site)
- [ ] 3 posts LinkedIn pré-rédigés et programmés (J-7, J-2, J+0)
- [ ] Cold email séquence (3 emails) rédigée et prête à envoyer
- [ ] One-pager PDF LotisPro exporté et prêt à joindre aux emails
- [ ] Liste de 50 prospects LinkedIn qualifiés (nom, poste, société, lien profil)
- [ ] 3 scénarios de démo préparés (50 / 200 / 500 lots, données réalistes)

### Commercial
- [ ] Grille tarifaire interne définie (même si non affichée publiquement)
- [ ] Template de proposition commerciale prêt (à personnaliser après démo)
- [ ] Process post-démo défini : récap envoyé sous 24h, relance J+7

---

## Métriques de succès

### J+30
| Métrique | Cible |
|----------|-------|
| Démos réalisées | 10 minimum |
| Taux conversion démo → proposition | > 50 % |
| Clients signés | 1 à 2 |
| Connexions LinkedIn qualifiées | +100 (FR + MA) |
| Taux ouverture cold email | > 40 % |
| Taux réponse cold email | > 8 % |

### J+90
| Métrique | Cible |
|----------|-------|
| Clients payants actifs | 5 |
| MRR (Monthly Recurring Revenue) | Positif |
| Témoignages clients collectés | 3 minimum |
| Lots gérés sur la plateforme | > 500 |
| Marché Maroc : clients actifs | 2 minimum |
| NPS (Net Promoter Score) | > 40 |

---

## Canaux prioritaires par marché

| Canal | France | Maroc | Priorité |
|-------|--------|-------|----------|
| LinkedIn outreach manuel | Oui | Oui | **P1** |
| Cold email B2B | Oui | Oui | **P1** |
| Référencement notaires/partenaires | Oui | Oui | **P2** |
| Salons immobiliers | SIMI (déc.), MIPIM (mars) | SIMED (nov.) | **P2** |
| SEO blog | Oui | Non (phase 2) | **P3** |
| Webinaire LinkedIn | Oui | Oui (J+60) | **P3** |
| Publicité LinkedIn Ads | Non (phase 2) | Non (phase 2) | **P4** |
