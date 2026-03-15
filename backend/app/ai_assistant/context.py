"""Context for AI Assistant agents."""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class AssistantContext:
    """Shared context passed to all agents.
    
    This context provides access to database, user info, and caching.
    """
    db_session: AsyncSession
    user_id: int
    user_role: str
    user_name: str
    conversation_id: Optional[str] = None
    project_id: Optional[int] = None
    
    # Cache to avoid redundant queries
    _cache: Dict[str, Any] = field(default_factory=dict)
    
    # State tracking for complex analyses
    analysis_state: Dict[str, Any] = field(default_factory=dict)
    
    def get_cached(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        return self._cache.get(key)
    
    def set_cached(self, key: str, value: Any) -> None:
        """Set value in cache."""
        self._cache[key] = value
    
    def clear_cache(self) -> None:
        """Clear the cache."""
        self._cache.clear()
