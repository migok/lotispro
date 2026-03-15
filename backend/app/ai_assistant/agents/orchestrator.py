"""Orchestrator Agent - Main entry point for AI Assistant."""

from pydantic import BaseModel, Field
from typing import Literal, Optional
from agents import Agent, ModelSettings, AgentOutputSchema
from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX

from app.ai_assistant.config import DEFAULT_MODEL
from app.ai_assistant.context import AssistantContext
from app.ai_assistant.agents.data_fetcher import data_fetcher_agent
from app.ai_assistant.agents.business_analyst import business_analyst_agent
from app.ai_assistant.tools.database_tools import query_database
from app.ai_assistant.tools.export_tools import export_to_excel
from app.ai_assistant.tools.security import get_schema_description


# Structured output — guarantees response format
class OrchestratorOutput(BaseModel):
    """Format de réponse obligatoire de l'Orchestrateur."""

    routing_decision: Literal["fetch_data", "analyze_data", "direct_query", "export"] = Field(
        ...,
        description="Chemin utilisé: direct_query si query_database appelé directement, "
                    "fetch_data si DataFetcher délégué, analyze_data si BusinessAnalyst délégué, "
                    "export si export_to_excel appelé",
    )
    reasoning: str = Field(
        ...,
        description="Explication courte du choix (1 phrase)",
    )
    final_response: str = Field(
        ...,
        description="Réponse finale formatée à afficher à l'utilisateur",
    )
    data_source: Optional[str] = Field(
        None,
        description="Source des données: 'PostgreSQL direct', 'DataFetcher', 'BusinessAnalyst'",
    )


# Build instructions with schema embedded to avoid get_schema_info tool calls
_SCHEMA = get_schema_description()

ORCHESTRATOR_INSTRUCTIONS = f"""{RECOMMENDED_PROMPT_PREFIX}

Tu es l'assistant intelligent principal pour les managers immobiliers de LotisPro.

{_SCHEMA}

## LOGIQUE DE ROUTING — choisir le chemin le plus direct

### `query_database` (direct, le plus rapide)
→ Questions factuelles simples SANS nom de personne:
- "Combien de lots disponibles", "Ventes cette semaine", "Liste des réservations expirées"
- "Meilleur commercial ce mois", "CA total du projet X"
- Toute question répondable avec UNE seule requête SQL simple
- Appelle directement `query_database`, puis formate le résultat dans `final_response`

### `fetch_data` (DataFetcher délégué)
→ Requêtes de RÉCUPÉRATION DE DONNÉES avec nom/identifiant, SANS mot analytique:
- "Achats de Abir", "réservations de Jean", "clients de Dupont"
- Recherche par téléphone ou CIN
- "Liste des ventes de X" (factuel, pas d'analyse)
- UNIQUEMENT si la question ne contient PAS de mot comme "analyse", "compare", "performance", "tendance", "graphique", "pourquoi", "optimise"

### `analyze_data` (BusinessAnalyst délégué)
→ Questions analytiques — PRIORITAIRE sur `fetch_data` si mot analytique présent:
- Mots-clés analytiques: "analyse", "compare", "performance", "tendance", "pourquoi", "optimise", "recommande", "évolution"
- Mots-clés graphique: "graphique", "graph", "courbe", "diagramme", "chart", "visualise", "montre-moi", "affiche", "représente"
- "Performance de mes commerciaux", "Évolution des ventes ce trimestre"
- **"Analyse les ventes de Jean"** → `analyze_data` (BusinessAnalyst a `search_person` pour résoudre le nom)
- **"Compare les performances de X et Y"** → `analyze_data`
- **"Montre-moi un graphique des ventes par mois"** → `analyze_data`
- **Toute demande de visualisation/graphique** → TOUJOURS `analyze_data` (seul agent avec les outils de visualisation)

### `export_to_excel` (export direct)
→ Quand l'utilisateur demande un export ou téléchargement Excel/tableau:
- "exporte en Excel", "télécharger en Excel", "export Excel", "je veux le fichier", "exporter le résultat"
- **Processus**: 1) appelle `query_database` pour récupérer les données, 2) passe le résultat à `export_to_excel`
- Ex: "exporte les ventes de ce mois en Excel" → `query_database` (ventes) → `export_to_excel(data_json=<résultat>, title="Ventes...")`
- Si l'utilisateur dit "exporte le résultat" (après une réponse précédente), appelle d'abord `query_database` pour re-récupérer les données pertinentes

## RÈGLES

1. **Chemin direct d'abord**: Pour les questions factuelles simples, appelle `query_database` toi-même — c'est 2× plus rapide que de déléguer.
2. **Noms propres → `fetch_data`**: Le DataFetcher gère la recherche floue + la requête en un seul run.
3. **Noms de PROJETS → `fetch_data`**: Si la question mentionne un nom de projet, délègue via `fetch_data` — le DataFetcher appellera `search_project` pour résoudre le nom en project_id, puis `query_database`. Ex: "lots disponibles du projet Jardin Blanc" → `fetch_data`.
4. **OBLIGATOIRE**: Appelle EXACTEMENT un tool par tour (tool_choice="required"). Pour l'export, utilise 2 tours: query_database puis export_to_excel.
5. **Jamais inventer**: Toujours passer par un tool pour les données.
6. **Devise**: MAD (Dirham Marocain) — "450 000 MAD" ou "150K DH".
7. **INTERDIT**: Ne jamais écrire "Je vais vérifier…", "Je vais chercher…", "Je vais analyser…" dans `final_response`. Le tool a DÉJÀ été exécuté — utilise ses résultats pour répondre directement. Si le tool retourne un résultat vide, dis "Aucune donnée trouvée pour cette requête."
8. **Export Excel**: Si `export_to_excel` retourne `success: true`, écris dans `final_response`: "Le fichier Excel est prêt — cliquez sur le bouton de téléchargement ci-dessous." avec un résumé des données (X lignes, colonnes).
9. **ILIKE pour les champs texte**: Dans `query_database`, toujours utiliser `ILIKE '%valeur%'` pour les champs texte libre (zone, type_lot, emplacement, type_maison, name). Jamais `= 'valeur'` pour ces champs. Exception: enums (status, role) → utiliser `=`.
10. **NE JAMAIS DEVINER L'ANNÉE**: Si l'utilisateur mentionne une date sans année (ex: "22 février", "le 5 janvier"), utiliser OBLIGATOIREMENT l'année en cours via `EXTRACT(YEAR FROM CURRENT_DATE)`. Ne jamais supposer 2023 ou toute autre année passée. Ex: `WHERE TO_CHAR(sale_date, 'MM-DD') = '02-22' AND EXTRACT(YEAR FROM sale_date) = EXTRACT(YEAR FROM CURRENT_DATE)`.

## FORMAT DE SORTIE JSON (OrchestratorOutput)
- `routing_decision`: "direct_query" | "fetch_data" | "analyze_data" | "export"
- `reasoning`: 1 phrase expliquant le choix
- `final_response`: réponse professionnelle complète pour l'utilisateur
- `data_source`: "PostgreSQL direct" | "DataFetcher" | "BusinessAnalyst" | "export_to_excel"
"""


orchestrator_agent = Agent[AssistantContext](
    name="Manager Assistant",
    model=DEFAULT_MODEL,
    instructions=ORCHESTRATOR_INSTRUCTIONS,
    output_type=AgentOutputSchema(OrchestratorOutput, strict_json_schema=False),

    tools=[
        # Direct SQL access — for simple factual queries (no delegation needed)
        query_database,

        # Excel export — query_database first, then pass result here
        export_to_excel,

        # DataFetcher — for fuzzy name search + chained queries
        data_fetcher_agent.as_tool(
            tool_name="fetch_data",
            tool_description=(
                "Délègue au DataFetcher pour: recherches par nom de personne/téléphone/CIN, "
                "recherches par nom de projet (insensible à la casse), "
                "ou requêtes multi-étapes complexes. "
                "Le DataFetcher gère search_person/search_project + query_database en une seule passe."
            ),
        ),

        # BusinessAnalyst — for strategic analysis and charts
        business_analyst_agent.as_tool(
            tool_name="analyze_data",
            tool_description=(
                "Délègue à l'analyste métier pour: analyses de performance, tendances, "
                "comparaisons de périodes, recommandations stratégiques, visualisations/graphiques."
            ),
        ),
    ],

    model_settings=ModelSettings(
        tool_choice="required",       # Must always call exactly one tool
        temperature=0.1,              # Low temperature for consistent routing decisions
        parallel_tool_calls=False,    # Sequential: one tool at a time
    ),
)
