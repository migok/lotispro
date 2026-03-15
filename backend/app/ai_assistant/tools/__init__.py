"""Tools for AI Assistant agents."""

from app.ai_assistant.tools.database_tools import get_schema_info, query_database
from app.ai_assistant.tools.analysis_tools import (
    calculate_kpis,
    compare_periods,
    detect_anomalies,
    calculate_trend,
    compare_to_target,
    generate_insights,
    fetch_data_for_analysis,
)
from app.ai_assistant.tools.visualization_tools import create_chart
from app.ai_assistant.tools.search_tools import (
    search_person,
    search_by_phone,
    search_by_cin,
)

__all__ = [
    # Database tools
    "get_schema_info",
    "query_database",
    # Analysis tools
    "calculate_kpis",
    "compare_periods",
    "detect_anomalies",
    "calculate_trend",
    "compare_to_target",
    "generate_insights",
    "fetch_data_for_analysis",
    # Visualization tools
    "create_chart",
    # Search tools
    "search_person",
    "search_by_phone",
    "search_by_cin",
]
