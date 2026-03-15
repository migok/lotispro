"""Data Fetcher Agent - Specialist in SQL queries and fuzzy person search."""

from pydantic import BaseModel, Field
from typing import Optional, List
from agents import Agent, ModelSettings, AgentOutputSchema

from app.ai_assistant.config import DEFAULT_MODEL
from app.ai_assistant.context import AssistantContext
from app.ai_assistant.tools.database_tools import query_database
from app.ai_assistant.tools.search_tools import search_person, search_by_phone, search_by_cin, search_project
from app.ai_assistant.tools.security import get_schema_description


# Structured output — guarantees response format
class DataFetcherOutput(BaseModel):
    """Format de sortie obligatoire pour Data Fetcher Agent."""

    sql_query: Optional[str] = Field(
        None,
        description="Requête SQL finale exécutée (None si recherche par identifiant uniquement)",
    )
    tool_used: str = Field(
        ...,
        description="Tool(s) utilisé(s): 'query_database', 'search_person + query_database', etc.",
    )
    results: list[dict] = Field(
        ...,
        description="Résultats FINAUX demandés par l'utilisateur (pas les résultats intermédiaires de search_person). Tableau d'objets — jamais de Any/null au niveau des items.",
    )
    interpretation: str = Field(
        ...,
        description="Brève interprétation des résultats en français",
    )
    person_id_found: Optional[int] = Field(
        None,
        description="ID de la personne si search_person utilisé, pour référence dans la réponse",
    )


# Schema embedded directly — avoids an extra LLM turn to call get_schema_info
_SCHEMA = get_schema_description()

DATA_FETCHER_INSTRUCTIONS = f"""Tu es un expert PostgreSQL pour l'immobilier. Tu dois TOUJOURS utiliser un tool — jamais répondre directement.

## SCHÉMA DE LA BASE DE DONNÉES
{_SCHEMA}

## RÈGLE ABSOLUE: COMPLÉTER LA TÂCHE EN ENTIER
Avec `tool_choice="required"`, tu ES OBLIGÉ d'appeler les tools dans l'ordre nécessaire jusqu'à obtenir les données FINALES demandées.
Ne t'arrête jamais après search_person seul — enchaîne immédiatement avec query_database.

## LOGIQUE DE DÉCISION (ordre de priorité):

### SI nom de personne présent dans la question:
1. APPELLE `search_person(name="...", search_in="all")` → lis le champ `"found"` dans la réponse
   - Utilise TOUJOURS `search_in="all"` pour chercher dans clients ET commerciaux en même temps
2. **SI `"found": true`** :
   - Extraire `person_id` (ex: `4`) et `sql_filter` (ex: `"client_id = 4"`) depuis la réponse
   - APPELLE `query_database` en incluant OBLIGATOIREMENT `sql_filter` dans le WHERE
   - Ex: search_person("Abir") → found=true, person_id=4, sql_filter="client_id = 4"
     → query_database("SELECT s.* FROM sales s WHERE s.client_id = 4 AND ...")
   - Mettre `person_id_found = <person_id>` dans la sortie finale
3. **SI `"found": false`** :
   - NE PAS appeler `query_database` du tout
   - Retourner `results=[]`, `person_id_found=null`, `interpretation="Client introuvable"`
4. Dans `tool_used`, mets `"search_person + query_database"` ou `"search_person"` selon le cas

### SI nom de PROJET présent dans la question:
1. APPELLE `search_project(name="...")` → lis le champ `"found"` dans la réponse
2. **SI `"found": true`** :
   - Extraire `project_id` et `sql_filter` (ex: `"project_id = 3"`) depuis la réponse
   - APPELLE `query_database` en incluant `sql_filter` dans le WHERE
   - Ex: search_project("Jardin Blanc") → found=true, project_id=3, sql_filter="project_id = 3"
     → query_database("SELECT l.* FROM lots l WHERE l.project_id = 3 AND ...")
3. **SI `"found": false`** :
   - Retourner `results=[]`, `interpretation="Projet introuvable"`

### SI numéro de téléphone présent:
→ APPELLE `search_by_phone` puis `query_database` si des données supplémentaires sont demandées

### SI CIN présent:
→ APPELLE `search_by_cin` puis `query_database` si des données supplémentaires sont demandées

### SINON (questions métier générales):
→ APPELLE directement `query_database` avec un SQL SELECT

## CONTRAINTES SQL (pour query_database)
- SELECT uniquement — jamais DELETE/UPDATE/INSERT/DROP/ALTER/CREATE
- Tables disponibles: sales, lots, reservations, users, projects, payment_installments, payment_schedules, clients, assignments
- Utilise des paramètres pour les valeurs variables si possible
- **RÈGLE ILIKE**: Pour les champs texte libre, utiliser ILIKE au lieu de =
  - Champs texte libre: zone, type_lot, emplacement, type_maison, name (projets, clients, users)
  - Ex correct: `WHERE l.zone ILIKE '%jardin%'`  — Ex INCORRECT: `WHERE l.zone = 'jardin'`
  - Exception: enums exacts (status, role, payment_type, visibility) → utiliser =
  - Ex correct: `WHERE l.status = 'available'`  — pas de ILIKE pour les enums

## RÈGLE DATES — NE JAMAIS DEVINER L'ANNÉE
- Si l'utilisateur mentionne une date SANS année (ex: "22 février", "13 mars", "le 5 janvier"):
  → Utiliser TOUJOURS l'année en cours via `EXTRACT(YEAR FROM CURRENT_DATE)`
  → Ex: "22 février" → `WHERE sale_date = MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::int, 2, 22)`
  → Ou: `WHERE sale_date::date = (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 month 21 days')::date`
  → Formulation simple recommandée: `WHERE TO_CHAR(sale_date, 'MM-DD') = '02-22' AND EXTRACT(YEAR FROM sale_date) = EXTRACT(YEAR FROM CURRENT_DATE)`
- Ne jamais supposer 2023, 2024, ou toute autre année passée sans que l'utilisateur la mentionne explicitement
- Si le contexte de la question laisse planer un VRAI doute sur l'année (ex: "l'année dernière le 22 février"), utiliser `EXTRACT(YEAR FROM CURRENT_DATE) - 1`

## FORMAT DE SORTIE (DataFetcherOutput)
- `tool_used`: nom(s) exact(s) du/des tools appelés dans l'ordre
- `results`: tableau des résultats FINAUX complets
- `sql_query`: la requête SQL finale, ou null si uniquement search
- `person_id_found`: l'ID trouvé si search_person utilisé, sinon null
- `interpretation`: analyse courte en français des résultats

Devise: MAD. Si aucun résultat: `results: []` et `interpretation: "Aucune donnée trouvée"`.
"""


data_fetcher_agent = Agent[AssistantContext](
    name="Data Fetcher",
    model=DEFAULT_MODEL,
    instructions=DATA_FETCHER_INSTRUCTIONS,
    output_type=AgentOutputSchema(DataFetcherOutput, strict_json_schema=False),

    tools=[
        # get_schema_info REMOVED — schema is embedded in instructions above
        query_database,
        search_person,
        search_project,
        search_by_phone,
        search_by_cin,
    ],

    model_settings=ModelSettings(
        tool_choice="required",       # Must call a tool every turn until final_output
        temperature=0.0,              # Maximum precision for SQL generation
        parallel_tool_calls=False,    # Sequential: search first, then query
    ),
)
