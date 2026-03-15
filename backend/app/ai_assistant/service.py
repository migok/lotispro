"""Service layer for AI Assistant."""

import json
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

import time
from datetime import datetime
from typing import Any, Dict, List

import openai
import tiktoken
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from agents import Runner, RunHooks, RunContextWrapper
from agents.tracing import Trace
from agents.run import RunResult
from agents.result import RunResult as RunResultTyped
from agents.tool import FunctionToolResult

from app.ai_assistant.agents.orchestrator import orchestrator_agent
from app.ai_assistant.context import AssistantContext
from app.core.logging import get_logger

logger = get_logger(__name__)
from app.ai_assistant.schemas import (
    AgentExchangeDebug,
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ConversationDetail,
    ConversationSummary,
    ExcelExport,
    MessageRole,
    ToolCallDebug,
)
from app.infrastructure.database.models import AIConversationModel


class DebugRunHooks(RunHooks):
    """Hooks to capture all agent activity for debugging."""
    
    def __init__(self):
        self.tool_calls: List[Dict[str, Any]] = []
        self.agent_exchanges: List[Dict[str, Any]] = []
        self.current_agent = "Orchestrator"
        self.start_time = None
        self._pending_tool_inputs: Dict[str, Dict[str, Any]] = {}
    
    async def on_agent_start(self, context, agent):
        self.current_agent = agent.name
        self.start_time = time.time()
        self.agent_exchanges.append({
            "timestamp": datetime.utcnow().isoformat(),
            "from_agent": "User",
            "to_agent": agent.name,
            "event": "start",
        })
    
    async def on_agent_end(self, context, agent, output):
        duration = int((time.time() - self.start_time) * 1000) if self.start_time else 0
        self.agent_exchanges.append({
            "timestamp": datetime.utcnow().isoformat(),
            "from_agent": agent.name,
            "to_agent": "System",
            "event": "end",
            "duration_ms": duration,
            "output_preview": str(output)[:200] if output else None,
        })
    
    async def on_tool_start(self, context, agent, tool):
        """Capture tool start - input will be captured from result."""
        self.current_agent = agent.name
        tool_name = tool.name if hasattr(tool, 'name') else str(tool)
        
        # Add placeholder - will be updated in on_tool_end
        self.tool_calls.append({
            "tool": tool_name,
            "agent": agent.name,
            "timestamp": datetime.utcnow().isoformat(),
            "input": {},
            "output": None,
            "output_preview": None,
            "duration_ms": 0,
            "sql_query": None,
        })
    
    async def on_tool_end(self, context, agent, tool, result):
        """Capture tool output when tool ends."""
        tool_name = tool.name if hasattr(tool, 'name') else str(tool)
        duration = 0
        output_str = None
        sql_query = None
        
        # Extract output from result
        if result:
            if isinstance(result, str):
                output_str = result
                # Try to extract SQL
                try:
                    data = json.loads(result)
                    if isinstance(data, dict):
                        sql_query = data.get("query_executed") or data.get("sql_query")
                except:
                    pass
            else:
                output_str = str(result)
        
        # Update the most recent tool call for this tool
        for call in reversed(self.tool_calls):
            if call["tool"] == tool_name and call["output"] is None:
                call["output"] = output_str
                call["output_preview"] = output_str[:500] if output_str else None
                call["sql_query"] = sql_query
                break


class ConversationService:
    """Service for managing AI conversation persistence."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_conversation(
        self, 
        user_id: int, 
        title: str = "Nouvelle conversation",
        language: str = "fr",
    ) -> ConversationSummary:
        """Create a new conversation."""
        conversation_id = str(uuid.uuid4())
        
        conversation = AIConversationModel(
            id=conversation_id,
            user_id=user_id,
            title=title,
            language=language,
            status="active",
        )
        
        self.db.add(conversation)
        await self.db.commit()
        await self.db.refresh(conversation)
        
        logger.info(f"Created conversation {conversation_id} for user {user_id}")
        
        return ConversationSummary(
            id=conversation.id,
            title=conversation.title,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            message_count=0,
            status=conversation.status,
        )
    
    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Add a message to a conversation."""
        # Get current conversation to access messages
        result = await self.db.execute(
            select(AIConversationModel).where(AIConversationModel.id == conversation_id)
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            logger.error(f"Conversation {conversation_id} not found")
            return
        
        # Parse existing messages or initialize
        messages = []
        if conversation.messages:
            try:
                messages = json.loads(conversation.messages)
            except json.JSONDecodeError:
                messages = []
        
        # Add new message
        messages.append({
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": metadata or {},
        })

        # Cap to MAX_CONVERSATION_HISTORY to prevent unbounded JSON growth
        from app.ai_assistant.config import MAX_CONVERSATION_HISTORY
        if len(messages) > MAX_CONVERSATION_HISTORY:
            messages = messages[-MAX_CONVERSATION_HISTORY:]

        # Update conversation
        conversation.messages = json.dumps(messages)
        conversation.updated_at = datetime.utcnow()
        
        await self.db.commit()
    
    async def get_conversation(self, conversation_id: str, user_id: int) -> Optional[ConversationDetail]:
        """Get a conversation by ID."""
        result = await self.db.execute(
            select(AIConversationModel).where(
                AIConversationModel.id == conversation_id,
                AIConversationModel.user_id == user_id,
            )
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            return None
        
        # Parse messages
        messages = []
        if conversation.messages:
            try:
                raw_messages = json.loads(conversation.messages)
                for msg in raw_messages:
                    messages.append(ChatMessage(
                        role=msg.get("role", "user"),
                        content=msg.get("content", ""),
                        timestamp=msg.get("timestamp", ""),
                        metadata=msg.get("metadata"),
                    ))
            except json.JSONDecodeError:
                pass
        
        return ConversationDetail(
            id=conversation.id,
            title=conversation.title,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            messages=messages,
            status=conversation.status,
        )
    
    async def get_user_conversations(
        self, 
        user_id: int, 
        limit: int = 20,
        offset: int = 0,
    ) -> List[ConversationSummary]:
        """Get all conversations for a user."""
        from sqlalchemy import desc
        
        result = await self.db.execute(
            select(AIConversationModel)
            .where(AIConversationModel.user_id == user_id)
            .order_by(desc(AIConversationModel.updated_at))
            .limit(limit)
            .offset(offset)
        )
        conversations = result.scalars().all()
        
        summaries = []
        for conv in conversations:
            message_count = 0
            if conv.messages:
                try:
                    message_count = len(json.loads(conv.messages))
                except:
                    pass
            
            summaries.append(ConversationSummary(
                id=conv.id,
                title=conv.title,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                message_count=message_count,
                status=conv.status,
            ))
        
        return summaries
    
    async def update_conversation_title(
        self,
        conversation_id: str,
        user_id: int,
        title: str,
    ) -> bool:
        """Update conversation title."""
        result = await self.db.execute(
            select(AIConversationModel).where(
                AIConversationModel.id == conversation_id,
                AIConversationModel.user_id == user_id,
            )
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            return False
        
        conversation.title = title
        conversation.updated_at = datetime.utcnow()
        await self.db.commit()
        
        return True
    
    async def delete_conversation(self, conversation_id: str, user_id: int) -> bool:
        """Delete a conversation."""
        result = await self.db.execute(
            delete(AIConversationModel).where(
                AIConversationModel.id == conversation_id,
                AIConversationModel.user_id == user_id,
            )
        )
        await self.db.commit()
        
        return result.rowcount > 0
    
    async def update_metadata(
        self,
        conversation_id: str,
        user_id: int,
        key: str,
        value: Any,
    ) -> bool:
        """Update conversation metadata."""
        result = await self.db.execute(
            select(AIConversationModel).where(
                AIConversationModel.id == conversation_id,
                AIConversationModel.user_id == user_id,
            )
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            return False
        
        # Parse existing metadata
        metadata = {}
        if conversation.metadata:
            try:
                metadata = json.loads(conversation.metadata)
            except:
                pass
        
        # Update and save
        metadata[key] = value
        conversation.metadata = json.dumps(metadata)
        await self.db.commit()
        
        return True


def _truncate_history_to_token_budget(
    messages: List[Any],
    max_tokens: int = 3000,
    model: str = "gpt-4o-mini",
) -> List[Any]:
    """Keep the most recent messages that fit within max_tokens.

    Counts tokens using tiktoken and trims from the oldest end so the agent
    never receives a history that overflows the context window.
    """
    try:
        enc = tiktoken.encoding_for_model(model)
    except Exception:
        # Fall back to a safe slice if tiktoken cannot find the model encoding
        return messages[-10:]

    total = 0
    result: List[Any] = []
    for msg in reversed(messages):
        chunk = f"{getattr(msg, 'role', 'user')}: {getattr(msg, 'content', str(msg))}"
        token_count = len(enc.encode(chunk))
        if total + token_count > max_tokens:
            break
        result.insert(0, msg)
        total += token_count

    return result or messages[-1:]  # always return at least the last message


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(
        (openai.RateLimitError, openai.APITimeoutError, openai.APIConnectionError)
    ),
    reraise=True,
)
async def _run_agent_with_retry(**run_params: Any) -> Any:
    """Run the agent orchestrator with automatic retry on transient OpenAI errors."""
    return await Runner.run(**run_params)


class AIAssistantService:
    """Main service for AI Assistant chat functionality."""
    
    # Class-level storage for conversation state (previous_response_id)
    # In production, this should be in Redis or database
    _conversation_state: Dict[str, Dict[str, Any]] = {}
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.conversation_service = ConversationService(db)
    
    async def chat(
        self,
        request: ChatRequest,
        user_id: int,
        user_name: Optional[str] = None,
        user_role: Optional[str] = None,
        client_info: Optional[Dict[str, Any]] = None,
    ) -> ChatResponse:
        """Process a chat message and return AI response."""
        
        # Get or create conversation
        conversation = None
        if request.conversation_id:
            conversation = await self.conversation_service.get_conversation(
                request.conversation_id, user_id
            )
        
        if not conversation:
            # Create new conversation
            title = request.message[:50] + "..." if len(request.message) > 50 else request.message
            conversation = await self.conversation_service.create_conversation(
                user_id=user_id,
                title=title,
                language=request.language or "fr",
            )
        
        # Build conversation history for context — truncated to token budget
        history = []
        messages = getattr(conversation, 'messages', []) or []
        for msg in _truncate_history_to_token_budget(messages, max_tokens=3000):
            history.append(f"{msg.role}: {msg.content}")

        conversation_history = "\n".join(history) if history else ""
        
        # Get previous_response_id for context persistence
        previous_response_id = None
        if conversation.id in self._conversation_state:
            previous_response_id = self._conversation_state[conversation.id].get("last_response_id")
            logger.info(f"Using previous_response_id: {previous_response_id}")
        
        # Create context for the run
        context = AssistantContext(
            db_session=self.db,
            user_id=user_id,
            user_name=user_name or "",
            user_role=user_role or "",
            conversation_id=conversation.id,
        )
        
        # Setup debug hooks
        debug_hooks = DebugRunHooks()
        
        # Prepare run parameters
        run_params = {
            "starting_agent": orchestrator_agent,
            "input": request.message,
            "context": context,
            "hooks": debug_hooks,
            "max_turns": 15,  # Prevent infinite tool loops
        }
        
        # Add previous_response_id for context persistence if available
        if previous_response_id:
            run_params["previous_response_id"] = previous_response_id
            logger.info(f"Continuing conversation with previous_response_id: {previous_response_id}")
        
        try:
            # Run the orchestrator with retry on transient OpenAI errors
            result = await _run_agent_with_retry(**run_params)

            # Store the response_id for next turn
            if hasattr(result, 'last_response_id') and result.last_response_id:
                self._conversation_state[conversation.id] = {
                    "last_response_id": result.last_response_id,
                    "updated_at": datetime.utcnow().isoformat(),
                }
                self._evict_stale_conversation_state()
                logger.info(f"Stored response_id: {result.last_response_id}")

            # Extract final response — OrchestratorOutput is a Pydantic model, not a str
            raw_output = result.final_output
            if hasattr(raw_output, "final_response"):
                response_text = raw_output.final_response
            else:
                response_text = str(raw_output)

        except openai.AuthenticationError as e:
            logger.error(f"OpenAI authentication error: {e}")
            response_text = (
                "Erreur de configuration de l'assistant IA. "
                "Veuillez contacter l'administrateur."
            )
        except Exception as e:
            logger.error(f"Error running agent: {e}", exc_info=True)
            response_text = (
                "Je suis désolé, j'ai rencontré une erreur lors du traitement de votre demande. "
                "Veuillez réessayer ou contacter le support si le problème persiste."
            )
        
        # Ensure the session is in a clean state before writing
        # (agent tools may have left the transaction in a failed state)
        try:
            await self.db.rollback()
        except Exception:
            pass

        # Save user message
        await self.conversation_service.add_message(
            conversation_id=conversation.id,
            role="user",
            content=request.message,
            metadata=client_info,
        )
        
        # Save assistant response
        await self.conversation_service.add_message(
            conversation_id=conversation.id,
            role="assistant",
            content=response_text,
            metadata={
                "tool_calls": len(debug_hooks.tool_calls),
                "agent_exchanges": len(debug_hooks.agent_exchanges),
            },
        )
        
        # Build response with debug info
        tool_calls_debug = [
            ToolCallDebug(
                tool=call["tool"],
                agent=call["agent"],
                input=call.get("input", {}),
                output=call.get("output"),
                output_preview=call.get("output_preview"),
                duration_ms=call.get("duration_ms", 0),
                sql_query=call.get("sql_query"),
                timestamp=call.get("timestamp"),
            )
            for call in debug_hooks.tool_calls
        ]
        
        agent_exchanges_debug = [
            AgentExchangeDebug(
                timestamp=ex["timestamp"],
                from_agent=ex["from_agent"],
                to_agent=ex["to_agent"],
                event=ex["event"],
                duration_ms=ex.get("duration_ms"),
                output_preview=ex.get("output_preview"),
            )
            for ex in debug_hooks.agent_exchanges
        ]
        
        # Extract Excel export if export_to_excel was called successfully
        excel_export = None
        for call in debug_hooks.tool_calls:
            if call.get("tool") == "export_to_excel" and call.get("output"):
                try:
                    export_data = json.loads(call["output"])
                    if export_data.get("success") and export_data.get("excel_base64"):
                        excel_export = ExcelExport(
                            excel_base64=export_data["excel_base64"],
                            filename=export_data.get("filename", "export"),
                            row_count=export_data.get("row_count", 0),
                            column_count=export_data.get("column_count", 0),
                        )
                        break  # Use the first successful export
                except (json.JSONDecodeError, KeyError):
                    pass

        # Extract chart from context cache — the image was stored there by create_chart
        # to avoid injecting base64 (~50K tokens) into the OpenAI context which causes
        # 429 rate_limit_exceeded errors and an infinite retry loop.
        chart_url = None
        for key, value in context._cache.items():
            if key.startswith("chart_"):
                chart_url = f"data:image/png;base64,{value}"
                break

        response_type = "text"
        if chart_url and excel_export:
            response_type = "mixed"
        elif chart_url:
            response_type = "chart"

        return ChatResponse(
            response=response_text,
            conversation_id=conversation.id,
            type=response_type,
            chart_url=chart_url,
            excel_export=excel_export,
            debug={
                "tool_calls": tool_calls_debug,
                "agent_exchanges": agent_exchanges_debug,
            } if request.debug else None,
        )
    
    async def get_conversation_history(
        self,
        conversation_id: str,
        user_id: int,
    ) -> Optional[ConversationDetail]:
        """Get full conversation history."""
        return await self.conversation_service.get_conversation(conversation_id, user_id)
    
    async def get_user_conversations(
        self,
        user_id: int,
        limit: int = 20,
        offset: int = 0,
    ) -> List[ConversationSummary]:
        """Get all conversations for a user."""
        return await self.conversation_service.get_user_conversations(user_id, limit, offset)
    
    def _evict_stale_conversation_state(self) -> None:
        """Remove conversation state entries older than CONVERSATION_RETENTION_DAYS."""
        from app.ai_assistant.config import CONVERSATION_RETENTION_DAYS
        cutoff = datetime.utcnow() - timedelta(days=CONVERSATION_RETENTION_DAYS)
        stale_keys = [
            k for k, v in self._conversation_state.items()
            if datetime.fromisoformat(v["updated_at"]) < cutoff
        ]
        for k in stale_keys:
            del self._conversation_state[k]

    async def delete_conversation(self, conversation_id: str, user_id: int) -> bool:
        """Delete a conversation."""
        # Also clean up conversation state
        if conversation_id in self._conversation_state:
            del self._conversation_state[conversation_id]

        return await self.conversation_service.delete_conversation(conversation_id, user_id)
