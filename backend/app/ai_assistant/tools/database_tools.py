"""Database tools for AI Assistant."""

import json
import time
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from agents import RunContextWrapper, function_tool

from app.ai_assistant.config import MAX_SQL_RESULTS
from app.ai_assistant.context import AssistantContext
from app.ai_assistant.tools.security import (
    SQLSecurityError,
    format_sql_for_display,
    get_schema_description,
    sanitize_sql,
    validate_sql,
)


@function_tool
def get_schema_info(
    context: RunContextWrapper[AssistantContext],
    table_name: Optional[str] = None,
) -> str:
    """Get database schema information.
    
    Use this tool when you need to understand the database structure
    before writing a SQL query.
    
    Args:
        table_name: Optional specific table name to get details for.
                   If None, returns schema for all tables.
    
    Returns:
        Schema description as formatted string.
    """
    schema = get_schema_description()
    
    if table_name:
        # Try to extract specific table info
        lines = schema.split('\n')
        table_lines = []
        in_target_table = False
        
        for line in lines:
            if table_name.lower() in line.lower() and '(' in line:
                in_target_table = True
                table_lines.append(line)
            elif in_target_table:
                if line.strip() and not line.startswith(' ') and not line.startswith('-'):
                    # New section
                    break
                table_lines.append(line)
        
        if table_lines:
            return '\n'.join(table_lines)
    
    return schema


@function_tool(timeout=30.0)
async def query_database(
    context: RunContextWrapper[AssistantContext],
    sql_query: str,
    description: str = "",
    parameters_json: Optional[str] = None,
) -> str:
    """Execute a secure SQL query on the database.
    
    This tool executes read-only SQL queries safely. Only SELECT statements
    are allowed. The query is validated for security before execution.
    
    Args:
        sql_query: SQL SELECT query to execute
        description: Description of what the query does (for logging)
        parameters: Optional query parameters for prepared statements
                   Example: {"project_id": 5, "start_date": "2024-01-01"}
    
    Returns:
        Query results as JSON string with format:
        {
            "success": true/false,
            "row_count": N,
            "columns": ["col1", "col2"],
            "rows": [{"col1": val1, "col2": val2}, ...],
            "execution_time_ms": 12.5,
            "error": "error message if failed"
        }
    
    Examples:
        "Get sales this week": 
        sql_query="SELECT COUNT(*), SUM(price) FROM sales WHERE sale_date >= date_trunc('week', CURRENT_DATE)"
        
        "Sales by commercial":
        sql_query="SELECT u.name, COUNT(s.id) as ventes FROM sales s JOIN users u ON s.sold_by_user_id = u.id GROUP BY u.name"
    """
    start_time = time.time()
    
    try:
        # Validate SQL
        is_valid, error_msg = validate_sql(sql_query)
        if not is_valid:
            return json.dumps({
                "success": False,
                "error": f"SQL validation failed: {error_msg}",
                "query": sql_query[:200],
            }, ensure_ascii=False)
        
        # Sanitize
        sql_clean = sanitize_sql(sql_query)
        
        # Execute query
        db = context.context.db_session
        
        # Use parameters if provided
        params = None
        if parameters_json:
            try:
                params = json.loads(parameters_json)
            except json.JSONDecodeError:
                pass
        
        if params:
            result = await db.execute(text(sql_clean), params)
        else:
            result = await db.execute(text(sql_clean))
        
        # Fetch results (limit for safety)
        rows = result.mappings().fetchmany(MAX_SQL_RESULTS + 1)
        
        # Check if we hit the limit
        truncated = len(rows) > MAX_SQL_RESULTS
        rows = rows[:MAX_SQL_RESULTS]
        
        # Convert to dict
        if rows:
            columns = list(rows[0].keys())
            rows_data = [dict(row) for row in rows]
        else:
            columns = []
            rows_data = []
        
        # Convert datetime and other non-serializable types
        for row in rows_data:
            for key, value in row.items():
                if hasattr(value, 'isoformat'):  # datetime
                    row[key] = value.isoformat()
                elif value is None:
                    row[key] = None
        
        execution_time = (time.time() - start_time) * 1000
        
        return json.dumps({
            "success": True,
            "row_count": len(rows_data),
            "columns": columns,
            "rows": rows_data,
            "truncated": truncated,
            "execution_time_ms": round(execution_time, 2),
            "description": description,
            "query_formatted": format_sql_for_display(sql_clean),
        }, ensure_ascii=False, default=str)
        
    except SQLAlchemyError as e:
        return json.dumps({
            "success": False,
            "error": f"Database error: {str(e)}",
            "query": sql_query[:200],
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "query": sql_query[:200],
        }, ensure_ascii=False)


@function_tool
def format_query_results(
    context: RunContextWrapper[AssistantContext],
    query_result_json: str,
    format_type: str = "markdown",
) -> str:
    """Format query results for display.
    
    Args:
        query_result_json: JSON string from query_database result
        format_type: Output format - "markdown", "table", or "summary"
    
    Returns:
        Formatted string
    """
    try:
        result = json.loads(query_result_json)
        
        if not result.get("success"):
            return f"❌ Erreur: {result.get('error', 'Unknown error')}"
        
        rows = result.get("rows", [])
        columns = result.get("columns", [])
        
        if not rows:
            return "📊 Aucun résultat trouvé."
        
        if format_type == "summary":
            # Summary format
            summary = f"📊 {result['row_count']} résultat(s)"
            if result.get('truncated'):
                summary += " (résultats tronqués)"
            
            # Show first few rows as key-value pairs
            for i, row in enumerate(rows[:3], 1):
                summary += f"\n\n**Résultat {i}:**"
                for key, val in row.items():
                    summary += f"\n- {key}: {val}"
            
            if len(rows) > 3:
                summary += f"\n\n... et {len(rows) - 3} autres résultats"
            
            return summary
        
        elif format_type == "markdown":
            # Markdown table
            md = "| " + " | ".join(columns) + " |\n"
            md += "| " + " | ".join(["---"] * len(columns)) + " |\n"
            
            for row in rows[:20]:  # Limit to 20 rows for display
                values = [str(row.get(col, "")) for col in columns]
                md += "| " + " | ".join(values) + " |\n"
            
            if len(rows) > 20:
                md += f"\n*... et {len(rows) - 20} autres lignes*"
            
            return md
        
        else:  # table (simple text)
            lines = []
            lines.append(", ".join(columns))
            lines.append("-" * 50)
            for row in rows[:10]:
                values = [str(row.get(col, "")) for col in columns]
                lines.append(", ".join(values))
            return "\n".join(lines)
            
    except json.JSONDecodeError:
        return "❌ Erreur de format JSON"
    except Exception as e:
        return f"❌ Erreur de formatage: {str(e)}"
