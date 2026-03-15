"""Dependencies for AI Assistant module."""

import time
from collections import defaultdict
from typing import AsyncGenerator, Dict, List, Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_assistant.config import (
    AI_ASSISTANT_ENABLED,
    AI_RATE_LIMIT_REQUESTS,
    AI_RATE_LIMIT_WINDOW_SECONDS,
)
from app.ai_assistant.context import AssistantContext
from app.api.dependencies import get_current_user
from app.infrastructure.database import get_session
from app.core.exceptions import AuthorizationError, AIRateLimitError
from app.domain.schemas.user import UserResponse

# In-memory per-user request log: {user_id: [timestamp, ...]}
_ai_request_log: Dict[int, List[float]] = defaultdict(list)


async def require_ai_assistant_enabled() -> None:
    """Dependency to check if AI Assistant is enabled."""
    if not AI_ASSISTANT_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Assistant is not enabled. Set AI_ASSISTANT_ENABLED=true to enable."
        )


async def require_manager_or_commercial(
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    """Dependency to check if user is manager or commercial."""
    if current_user.role not in ["manager", "commercial"]:
        raise AuthorizationError("AI Assistant is only available for managers and commercials")
    return current_user


async def require_rate_limit(
    current_user: UserResponse = Depends(require_manager_or_commercial),
) -> UserResponse:
    """Per-user rate limiter for the AI chat endpoint."""
    now = time.time()
    window_start = now - AI_RATE_LIMIT_WINDOW_SECONDS
    # Keep only timestamps within the current window
    _ai_request_log[current_user.id] = [
        t for t in _ai_request_log[current_user.id] if t > window_start
    ]
    if len(_ai_request_log[current_user.id]) >= AI_RATE_LIMIT_REQUESTS:
        raise AIRateLimitError(limit=AI_RATE_LIMIT_REQUESTS, window=AI_RATE_LIMIT_WINDOW_SECONDS)
    _ai_request_log[current_user.id].append(now)
    return current_user


async def get_assistant_context(
    db: AsyncSession = Depends(get_session),
    current_user: UserResponse = Depends(require_manager_or_commercial),
    conversation_id: Optional[str] = None,
    project_id: Optional[int] = None,
) -> AssistantContext:
    """Create assistant context for agents."""
    from dataclasses import dataclass, field
    from typing import Dict, Any
    
    @dataclass
    class Context:
        db_session: AsyncSession
        user_id: int
        user_role: str
        user_name: str
        conversation_id: Optional[str]
        project_id: Optional[int]
        _cache: Dict[str, Any] = field(default_factory=dict)
        analysis_state: Dict[str, Any] = field(default_factory=dict)
    
    return Context(
        db_session=db,
        user_id=current_user.id,
        user_role=current_user.role,
        user_name=current_user.name,
        conversation_id=conversation_id,
        project_id=project_id,
    )


async def verify_conversation_access(
    conversation_id: str,
    current_user: UserResponse = Depends(require_manager_or_commercial),
    db: AsyncSession = Depends(get_session),
) -> bool:
    """Verify that the user owns the conversation."""
    # Will be implemented with actual DB check
    return True
