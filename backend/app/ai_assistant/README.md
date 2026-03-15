# AI Assistant Module for LotisPro

Module agentique conversationnel permettant aux managers de poser des questions en langage naturel sur leurs données immobilières.

## Architecture

### Agents

1. **Orchestrator Agent** - Point d'entrée unique
   - Comprend la question du manager
   - Route vers le sous-agent approprié
   - Synthétise la réponse finale

2. **Data Fetcher Agent** - Spécialiste Text-to-SQL
   - Convertit les questions en SQL
   - Valide et exécute les requêtes de manière sécurisée
   - Retourne les données structurées

3. **Business Analyst Agent** - Expert en analyse
   - Analyse les données brutes
   - Fournit des insights et recommandations
   - Calcule les KPIs et tendances

### Tools

#### Database Tools
- `query_database` - Exécute SQL sécurisé (SELECT uniquement)
- `get_schema_info` - Fournit le schéma de la base

#### Analysis Tools
- `calculate_kpis` - Calcule les indicateurs clés
- `compare_periods` - Compare les périodes
- `detect_anomalies` - Détecte les anomalies
- `calculate_trend` - Analyse les tendances
- `compare_to_target` - Compare aux objectifs
- `generate_insights` - Génère des recommandations

#### Visualization Tools
- `create_chart` - Génère des graphiques (matplotlib)
- `prepare_chart_data` - Prépare les données
- `suggest_chart_type` - Suggère le type de graphique

## Configuration

### Variables d'environnement

```env
# Activation du module
AI_ASSISTANT_ENABLED=true

# OpenAI
OPENAI_API_KEY=sk-...

# Modèles (optionnel)
AI_MODEL=gpt-4o-mini        # Pour Data Fetcher
AI_ANALYST_MODEL=gpt-4o     # Pour Business Analyst

# Limites
AI_MAX_SQL_RESULTS=1000
AI_SQL_TIMEOUT=30
AI_MAX_HISTORY=50

# Durée de vie des conversations
AI_CONVERSATION_RETENTION_DAYS=30
```

### Installation

```bash
# Avec le module AI complet
pip install -e ".[ai]"

# Ou installation manuelle
pip install openai-agents matplotlib sqlparse
```

### Activation

Le module est **optionnel** et peut être activé/désactivé via la variable `AI_ASSISTANT_ENABLED`.

Quand désactivé :
- Le router n'est pas chargé
- Les endpoints retournent 503 Service Unavailable
- Pas d'erreur d'import si dépendances manquantes

## Endpoints API

```
GET  /api/v1/ai-assistant/health           → Vérifier l'état
POST /api/v1/ai-assistant/chat             → Envoyer un message
GET  /api/v1/ai-assistant/conversations    → Liste conversations
GET  /api/v1/ai-assistant/conversations/{id} → Détail conversation
DEL  /api/v1/ai-assistant/conversations/{id} → Supprimer conversation
```

## Exemples d'utilisation

### Simple
```json
POST /api/v1/ai-assistant/chat
{
  "message": "Combien de ventes cette semaine ?"
}
```

### Avec contexte projet
```json
POST /api/v1/ai-assistant/chat
{
  "message": "Analyse les ventes",
  "project_id": 5,
  "conversation_id": "uuid-continu"
}
```

### Réponse
```json
{
  "conversation_id": "uuid",
  "message": "Cette semaine: 15 ventes pour 450K€...",
  "type": "mixed",
  "chart_url": "data:image/png;base64,...",
  "sql_queries": [...]
}
```

## Sécurité

### SQL Injection Prevention
- Requêtes SELECT uniquement (whitelist)
- Tables autorisées uniquement
- Paramètres préparés
- Validation regex avant exécution
- Mots interdits: DROP, DELETE, UPDATE, INSERT, etc.

### RBAC
- Seuls les rôles `manager` et `commercial` ont accès
- Les commerciaux voient uniquement leurs projets assignés

### Rate Limiting
À implémenter via middleware FastAPI existant.

## Frontend

Le widget React est intégré dans `App.jsx` pour les utilisateurs authentifiés avec les bons rôles.

```jsx
// Visible uniquement pour manager/commercial
{user?.role && ['manager', 'commercial'].includes(user.role) && (
  <AIAssistant />
)}
```

## Développement

### Tests
```bash
pytest app/ai_assistant/tests/
```

### Lint
```bash
ruff check app/ai_assistant/
mypy app/ai_assistant/
```

## Dépannage

### "AI Assistant is not enabled"
→ Vérifier `AI_ASSISTANT_ENABLED=true` dans `.env`

### "OPENAI_API_KEY is required"
→ Ajouter clé API OpenAI valide

### ModuleNotFoundError: No module named 'agents'
→ Installer dépendances: `pip install openai-agents matplotlib sqlparse`

### Erreurs SQL
→ Vérifier les logs, la validation est stricte (SELECT uniquement)
