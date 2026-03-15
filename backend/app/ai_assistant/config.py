"""Configuration for AI Assistant module."""

import os
from typing import Optional


# Feature flag to enable/disable AI Assistant completely
AI_ASSISTANT_ENABLED: bool = os.getenv("AI_ASSISTANT_ENABLED", "false").lower() == "true"

# OpenAI Configuration
OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
DEFAULT_MODEL: str = os.getenv("AI_MODEL", "gpt-4o-mini")
ANALYST_MODEL: str = os.getenv("AI_ANALYST_MODEL", "gpt-4o")  # Better reasoning for analyst

# Database query settings
MAX_SQL_RESULTS: int = int(os.getenv("AI_MAX_SQL_RESULTS", "1000"))
SQL_QUERY_TIMEOUT: int = int(os.getenv("AI_SQL_TIMEOUT", "30"))

# Chart generation
CHART_STORAGE_BUCKET: str = os.getenv("AI_CHART_BUCKET", "ai-charts")
CHART_EXPIRY_HOURS: int = int(os.getenv("AI_CHART_EXPIRY_HOURS", "24"))

# Conversation settings
MAX_CONVERSATION_HISTORY: int = int(os.getenv("AI_MAX_HISTORY", "50"))
CONVERSATION_RETENTION_DAYS: int = int(os.getenv("AI_CONVERSATION_RETENTION_DAYS", "30"))

# Per-user rate limiting on AI chat endpoint
AI_RATE_LIMIT_REQUESTS: int = int(os.getenv("AI_RATE_LIMIT_REQUESTS", "20"))
AI_RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("AI_RATE_LIMIT_WINDOW", "60"))

# Security
ALLOWED_SQL_TABLES: set = {
    "sales",
    "lots",
    "reservations",
    "projects",
    "clients",
    "users",
    "payment_installments",
    "payment_schedules",
    "assignments",
    "audit_logs",
}

FORBIDDEN_SQL_KEYWORDS: set = {
    "DROP",
    "DELETE",
    "UPDATE",
    "INSERT",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "GRANT",
    "REVOKE",
    "EXEC",
    "EXECUTE",
    "UNION",
    "--",
    "/*",
    "*/",
}


def validate_config() -> list[str]:
    """Validate AI Assistant configuration.
    
    Returns:
        List of validation errors, empty if valid.
    """
    errors = []
    
    if AI_ASSISTANT_ENABLED:
        if not OPENAI_API_KEY:
            errors.append("OPENAI_API_KEY is required when AI_ASSISTANT_ENABLED=true")
    
    return errors
