"""API routes for AI Assistant."""

from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_assistant.config import AI_ASSISTANT_ENABLED, validate_config
from app.ai_assistant.dependencies import (
    get_assistant_context,
    require_ai_assistant_enabled,
    require_manager_or_commercial,
    require_rate_limit,
)
from app.ai_assistant.schemas import (
    ChatRequest,
    ChatResponse,
    ConversationDetail,
    ConversationSummary,
    HealthCheckResponse,
)
from app.ai_assistant.service import AIAssistantService, ConversationService
from app.infrastructure.database import get_session
from app.domain.schemas.user import UserResponse

router = APIRouter(
    tags=["AI Assistant"],
    dependencies=[Depends(require_ai_assistant_enabled)],
)


@router.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """Check AI Assistant health status."""
    if not AI_ASSISTANT_ENABLED:
        return HealthCheckResponse(
            status="disabled",
            enabled=False,
            errors=None,
        )
    
    errors = validate_config()
    
    return HealthCheckResponse(
        status="error" if errors else "ok",
        enabled=True,
        errors=errors if errors else None,
    )


@router.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def chat(
    request: ChatRequest,
    current_user: UserResponse = Depends(require_rate_limit),
    db: AsyncSession = Depends(get_session),
):
    """Send a message to the AI Assistant.
    
    This endpoint processes natural language questions about:
    - Sales data and performance
    - Lot availability and status
    - Payment tracking and delays
    - Commercial performance
    - Reservations and expirations
    
    The AI will automatically decide whether to:
    - Fetch raw data for simple questions
    - Perform deep analysis for strategic questions
    - Generate charts when visualization is helpful
    """
    service = AIAssistantService(db)
    
    return await service.chat(
        request=request,
        user_id=current_user.id,
        user_name=current_user.name,
        user_role=current_user.role,
    )


@router.get("/conversations", response_model=List[ConversationSummary])
async def list_conversations(
    current_user: UserResponse = Depends(require_manager_or_commercial),
    db: AsyncSession = Depends(get_session),
    limit: int = 20,
):
    """List user's conversation history."""
    service = ConversationService(db)
    return await service.get_user_conversations(
        user_id=current_user.id,
        limit=limit,
        offset=0,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str,
    current_user: UserResponse = Depends(require_manager_or_commercial),
    db: AsyncSession = Depends(get_session),
):
    """Get a specific conversation with all messages."""
    service = ConversationService(db)
    conversation = await service.get_conversation(
        conversation_id=conversation_id,
        user_id=current_user.id,
    )
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    
    return conversation


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    current_user: UserResponse = Depends(require_manager_or_commercial),
    db: AsyncSession = Depends(get_session),
):
    """Delete a conversation."""
    service = ConversationService(db)
    deleted = await service.delete_conversation(
        conversation_id=conversation_id,
        user_id=current_user.id,
    )
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    
    return None


# Import HTTPException at the end to avoid circular imports
from fastapi import HTTPException
