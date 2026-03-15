# Lancer l'AI Assistant avec Docker Compose

## Prérequis

1. **Supabase local démarré** :
```bash
npx supabase start
```

2. **Variables d'environnement configurées** dans `.env` :
```env
AI_ASSISTANT_ENABLED=true
OPENAI_API_KEY=sk-...
```

## Lancement

### Option 1: Avec Supabase (recommandé)

```bash
cd backend
docker compose -f docker-compose.supabase.yml up -d
```

### Option 2: Rebuild après modification

```bash
cd backend
docker compose -f docker-compose.supabase.yml up -d --build
```

### Option 3: Voir les logs

```bash
docker compose -f docker-compose.supabase.yml logs -f api
```

## Vérification

```bash
# Health check
curl http://localhost:8000/api/health

# AI Assistant health
curl http://localhost:8000/api/v1/ai-assistant/health
```

## Arrêt

```bash
docker compose -f docker-compose.supabase.yml down
```

## Notes

- Le module AI est **optionnel** - si `AI_ASSISTANT_ENABLED=false` ou absent, les endpoints retourneront 503
- Si `OPENAI_API_KEY` n'est pas configuré mais `AI_ASSISTANT_ENABLED=true`, l'API démarrera mais l'assistant ne fonctionnera pas
- Les dépendances AI (`openai-agents`, `matplotlib`, `sqlparse`) sont incluses dans l'image Docker
