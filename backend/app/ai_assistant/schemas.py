"""Pydantic schemas for AI Assistant."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    """Message roles in conversation."""
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    """Single chat message."""
    role: MessageRole
    content: str
    tool_name: Optional[str] = None
    tool_output: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    """Request to send a message to AI Assistant."""
    message: str = Field(..., min_length=1, max_length=4000, description="User message")
    conversation_id: Optional[str] = Field(None, description="Existing conversation ID")
    project_id: Optional[int] = Field(None, description="Optional project context")
    language: Optional[str] = Field("fr", description="Language code (fr, en, ar)")
    debug: Optional[bool] = Field(False, description="Include debug information in response")


class ChartData(BaseModel):
    """Chart data for visualization."""
    type: Literal["bar", "line", "pie", "doughnut"]
    title: str
    labels: List[str]
    datasets: List[Dict[str, Any]]
    x_label: Optional[str] = None
    y_label: Optional[str] = None


class ToolCallDebug(BaseModel):
    """Debug info for a single tool call."""
    tool: str
    agent: str
    input: Dict[str, Any]
    output: Optional[str] = None
    output_preview: Optional[str] = None
    duration_ms: int = 0
    sql_query: Optional[str] = None
    timestamp: Optional[str] = None


class AgentExchangeDebug(BaseModel):
    """Debug info for agent-to-agent exchanges."""
    timestamp: str
    from_agent: str
    to_agent: str
    event: str
    duration_ms: Optional[int] = None
    output_preview: Optional[str] = None


class ExcelExport(BaseModel):
    """Excel file export data."""
    excel_base64: str
    filename: str
    row_count: int
    column_count: int


class ChatResponse(BaseModel):
    """Response from AI Assistant."""
    response: str
    conversation_id: str
    type: Literal["text", "chart", "mixed"] = "text"
    chart_data: Optional[ChartData] = None
    chart_url: Optional[str] = None
    sql_queries: Optional[List[Dict[str, str]]] = None  # For debugging
    analysis_summary: Optional[Dict[str, Any]] = None  # Structured analysis if available
    excel_export: Optional[ExcelExport] = None  # Excel file download
    # Debug info (development only)
    debug: Optional[Dict[str, Any]] = None


class ConversationSummary(BaseModel):
    """Summary of a conversation."""
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int
    status: str = "active"


class ConversationDetail(BaseModel):
    """Full conversation with messages."""
    id: str
    title: str
    messages: List[ChatMessage]
    created_at: datetime
    updated_at: datetime
    status: str = "active"


class SQLQueryResult(BaseModel):
    """Result of a SQL query."""
    query: str
    description: str
    row_count: int
    columns: List[str]
    rows: List[Dict[str, Any]]
    execution_time_ms: float


class AnalysisResult(BaseModel):
    """Structured business analysis result."""
    situation: Dict[str, Any] = Field(description="Current situation with key metrics")
    trends: Dict[str, Any] = Field(description="Trends and comparisons")
    alerts: List[Dict[str, Any]] = Field(default_factory=list, description="Warnings and anomalies")
    recommendations: List[Dict[str, str]] = Field(default_factory=list, description="Prioritized actions")
    kpis: Dict[str, float] = Field(default_factory=dict, description="Key performance indicators")


class HealthCheckResponse(BaseModel):
    """Health check response."""
    status: Literal["ok", "error", "disabled"]
    enabled: bool
    version: str = "1.0.0"
    errors: Optional[List[str]] = None
