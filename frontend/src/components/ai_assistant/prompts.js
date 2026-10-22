/**
 * Bibliothèque de prompts — LotisPro Assistant Manager
 * 6 catégories · ~48 prompts · Niveaux intermédiaire → complexe
 */

export const PROMPT_LIBRARY = [
  {
    id: 'finance',
    label: 'Analyse financière',
    prompts: [
      { id: 'f1', text: "Quel est le CA réalisé vs l'objectif sur chaque projet ?" },
      { id: 'f2', text: "Si toutes les réservations actives se convertissent, quel serait le CA total ?" },
      { id: 'f3', text: "Quelle est la tendance du CA : en hausse ou en baisse par rapport au mois précédent ?" },
      { id: 'f4', text: "Quel est le prix moyen au m² par projet ?" },
      { id: 'f5', text: "Quelle est la valeur totale des lots encore disponibles (CA potentiel non capturé) ?" },
      { id: 'f6', text: "Quel projet contribue le plus au CA global ?" },
      { id: 'f7', text: "Quel mois a été le plus performant en termes de CA cette année ?" },
      { id: 'f8', text: "Affiche un graphique de progression du CA réalisé vers l'objectif pour chaque projet." },
    ],
  },
  {
    id: 'commercial',
    label: 'Performance commerciale',
    prompts: [
      { id: 'c1', text: "Quel commercial a le meilleur taux de transformation ce trimestre ?" },
      { id: 'c2', text: "Quel commercial génère le plus de CA moyen par vente ?" },
      { id: 'c3', text: "Montre-moi l'évolution mensuelle du CA par commercial sur 6 mois." },
      { id: 'c4', text: "Y a-t-il un commercial dont les réservations n'aboutissent jamais en vente ?" },
      { id: 'c5', text: "Qui performe en dessous de la moyenne de l'équipe ?" },
      { id: 'c6', text: "Quel commercial a le plus de réservations actives en attente de conversion ?" },
      { id: 'c7', text: "Affiche un bar chart des ventes par commercial ce trimestre." },
      { id: 'c8', text: "Bubble chart : commercial × nombre de ventes × CA total (taille de bulle = CA)." },
    ],
  },
  {
    id: 'graphiques',
    label: 'Graphiques & Visualisations',
    prompts: [
      { id: 'g1', text: "Affiche un donut chart de la répartition des lots par statut (disponible, réservé, vendu, bloqué)." },
      { id: 'g2', text: "Trace la courbe des ventes mensuelles avec une ligne d'objectif en pointillé." },
      { id: 'g3', text: "Montre un stacked bar chart du CA par mois, empilé par commercial." },
      { id: 'g4', text: "Affiche un funnel de conversion : lots disponibles → réservés → validés → vendus." },
      { id: 'g5', text: "Compare le nombre de réservations vs conversions par commercial (grouped bar)." },
      { id: 'g6', text: "Génère une heatmap des ventes par mois et par commercial." },
      { id: 'g7', text: "Affiche un graphique cascade (waterfall) : CA objectif → CA réalisé → CA potentiel réservé → écart." },
      { id: 'g8', text: "Scatter plot : surface du lot vs prix de vente — y a-t-il une corrélation ?" },
    ],
  },
  {
    id: 'lots',
    label: 'Lots & Projets',
    prompts: [
      { id: 'l1', text: "Quels lots sont disponibles depuis plus de 60 jours sans jamais avoir été réservés ?" },
      { id: 'l2', text: "Quel type de lot (villa, appartement) a le meilleur taux de vente ?" },
      { id: 'l3', text: "Les lots en angle (3 façades) se vendent-ils plus vite que les lots standard ?" },
      { id: 'l4', text: "Quelle zone du projet concentre le plus de lots vendus ?" },
      { id: 'l5', text: "Y a-t-il une tranche de prix où les lots restent bloqués le plus longtemps ?" },
      { id: 'l6', text: "Quel est le ratio surface vendue / surface totale par projet ?" },
      { id: 'l7', text: "Quels lots ont été libérés après réservation — indiquant une rétractation ?" },
      { id: 'l8', text: "Affiche un graphique empilé : lots vendus + réservés + disponibles par projet." },
    ],
  },
  {
    id: 'reservations',
    label: 'Réservations & Alertes',
    prompts: [
      { id: 'r1', text: "Quelles réservations expirent dans les 5 prochains jours avec un dépôt supérieur à 50 000 ?" },
      { id: 'r2', text: "Quel est le délai moyen entre une réservation et sa conversion en vente ?" },
      { id: 'r3', text: "Quel pourcentage des réservations expire sans jamais être converti ?" },
      { id: 'r4', text: "Quels paiements sont en retard de plus de 30 jours ?" },
      { id: 'r5', text: "Quel est le montant total à risque sur les réservations expirant cette semaine ?" },
      { id: 'r6', text: "Quels clients ont des réservations actives ET des retards de paiement sur d'autres lots ?" },
      { id: 'r7', text: "Combien de réservations ont été prolongées au moins une fois ?" },
      { id: 'r8', text: "Montre la courbe des réservations vs ventes par mois pour les 6 derniers mois." },
    ],
  },
  {
    id: 'clients',
    label: 'Clients & Pipeline',
    prompts: [
      { id: 'cl1', text: "Qui sont les 5 clients ayant généré le plus de CA ?" },
      { id: 'cl2', text: "Quelle catégorie de client (investisseur, propriétaire, revendeur) achète le plus ?" },
      { id: 'cl3', text: "Quels clients ont effectué plus d'un achat ?" },
      { id: 'cl4', text: "Affiche le pipeline client : acheteurs confirmés, réservations actives, prospects." },
      { id: 'cl5', text: "Quels prospects (sans achat) ont l'activité la plus récente ?" },
      { id: 'cl6', text: "Affiche un camembert de la répartition des clients par type." },
      { id: 'cl7', text: "Quel client a le plus grand montant de solde restant dû ?" },
      { id: 'cl8', text: "Quel commercial devrait-on affecter en priorité au nouveau projet selon ses résultats ?" },
    ],
  },
];
