"""Visualization tools for AI Assistant."""

import base64
import io
import json
import uuid
from typing import Any, Dict, List, Literal, Optional

import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt

from agents import RunContextWrapper, function_tool

from app.ai_assistant.config import CHART_EXPIRY_HOURS
from app.ai_assistant.context import AssistantContext


@function_tool
def create_chart(
    context: RunContextWrapper[AssistantContext],
    chart_type: Literal["bar", "line", "pie", "doughnut", "horizontal_bar"],
    data_json: str,
    title: str,
    x_label: Optional[str] = None,
    y_label: Optional[str] = None,
    colors: Optional[List[str]] = None,
    height: int = 6,
    width: int = 10,
) -> str:
    """Create a chart from data.
    
    This tool generates a chart image using matplotlib and returns it as base64.
    The chart can be displayed in the frontend.
    
    Args:
        chart_type: Type of chart (bar, line, pie, doughnut, horizontal_bar)
        data_json: JSON string with format: [{"label": "A", "value": 10}, ...]
                  or for multi-series: [{"label": "A", "series1": 10, "series2": 20}, ...]
        title: Chart title
        x_label: Label for X axis
        y_label: Label for Y axis
        colors: Optional custom colors (hex codes)
        height: Chart height in inches
        width: Chart width in inches
    
    Returns:
        JSON with chart data including base64 image and metadata
    
    Examples:
        Simple bar chart:
        data_json = '[{"label": "Jan", "value": 10}, {"label": "Fév", "value": 15}]'
        
        Multi-series line chart:
        data_json = '[{"label": "Jan", "Jean": 10, "Marie": 12}, ...]'
    """
    try:
        # Parse data
        data = json.loads(data_json)
        
        if not data:
            return json.dumps({
                "success": False,
                "error": "No data provided for chart",
            }, ensure_ascii=False)
        
        # Setup figure
        fig, ax = plt.subplots(figsize=(width, height))
        
        # Default colors
        default_colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4']
        chart_colors = colors or default_colors
        
        # Extract labels and values
        labels = [item.get('label', str(i)) for i, item in enumerate(data)]
        
        # Determine if multi-series
        keys = set(data[0].keys()) - {'label'}
        is_multi_series = len(keys) > 1 and all(isinstance(data[0].get(k), (int, float)) for k in keys)
        
        if chart_type == "bar":
            if is_multi_series:
                x = range(len(labels))
                width_bar = 0.8 / len(keys)
                for i, key in enumerate(keys):
                    values = [item.get(key, 0) for item in data]
                    ax.bar([xi + i * width_bar for xi in x], values, width_bar, 
                           label=key, color=chart_colors[i % len(chart_colors)])
                ax.set_xticks([xi + width_bar * (len(keys) - 1) / 2 for xi in x])
                ax.set_xticklabels(labels, rotation=45, ha='right')
                ax.legend()
            else:
                values = [item.get('value', 0) for item in data]
                bars = ax.bar(labels, values, color=chart_colors[0])
                # Add value labels on bars
                for bar in bars:
                    height_bar = bar.get_height()
                    ax.text(bar.get_x() + bar.get_width()/2., height_bar,
                           f'{int(height_bar)}',
                           ha='center', va='bottom', fontsize=9)
            
        elif chart_type == "horizontal_bar":
            values = [item.get('value', 0) for item in data]
            colors_mapped = [chart_colors[i % len(chart_colors)] for i in range(len(labels))]
            bars = ax.barh(labels, values, color=colors_mapped)
            # Add value labels
            for i, bar in enumerate(bars):
                width_bar = bar.get_width()
                ax.text(width_bar, bar.get_y() + bar.get_height()/2.,
                       f' {int(width_bar)}',
                       ha='left', va='center', fontsize=9)
            
        elif chart_type == "line":
            if is_multi_series:
                for i, key in enumerate(keys):
                    values = [item.get(key, 0) for item in data]
                    ax.plot(labels, values, marker='o', label=key, 
                           color=chart_colors[i % len(chart_colors)], linewidth=2)
                ax.legend()
            else:
                values = [item.get('value', 0) for item in data]
                ax.plot(labels, values, marker='o', color=chart_colors[0], linewidth=2)
            ax.grid(True, alpha=0.3)
            
        elif chart_type in ["pie", "doughnut"]:
            values = [item.get('value', 0) for item in data]
            colors_mapped = [chart_colors[i % len(chart_colors)] for i in range(len(labels))]
            
            if chart_type == "doughnut":
                wedgeprops = dict(width=0.5)
            else:
                wedgeprops = None
            
            wedges, texts, autotexts = ax.pie(values, labels=labels, autopct='%1.1f%%',
                                               colors=colors_mapped, wedgeprops=wedgeprops,
                                               startangle=90)
            # Style percentage text
            for autotext in autotexts:
                autotext.set_color('white')
                autotext.set_fontweight('bold')
                autotext.set_fontsize(9)
        
        # Styling
        ax.set_title(title, fontsize=14, fontweight='bold', pad=20)
        
        if chart_type not in ["pie", "doughnut"]:
            if x_label:
                ax.set_xlabel(x_label, fontsize=11)
            if y_label:
                ax.set_ylabel(y_label, fontsize=11)
            
            # Rotate x labels if many items
            if len(labels) > 5:
                plt.xticks(rotation=45, ha='right')
        
        # Add grid for readability (except pie charts)
        if chart_type not in ["pie", "doughnut"]:
            ax.grid(True, alpha=0.3, linestyle='--')
            ax.set_axisbelow(True)
        
        # Tight layout to prevent label cutoff
        plt.tight_layout()
        
        # Save to buffer
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)

        # Encode to base64
        image_base64 = base64.b64encode(buffer.read()).decode('utf-8')

        plt.close(fig)

        # Generate chart metadata
        chart_id = str(uuid.uuid4())

        # Store image in context cache — NOT in tool output to avoid token explosion.
        # A base64 PNG is ~50K-200K chars (~15K-60K tokens) which triggers OpenAI 429
        # rate_limit_exceeded and causes an infinite retry loop.
        context.context.set_cached(f"chart_{chart_id}", image_base64)

        # Return only lightweight metadata to the agent (~50 tokens)
        return json.dumps({
            "success": True,
            "chart_id": chart_id,
            "chart_type": chart_type,
            "title": title,
            "message": f"Graphique '{title}' généré avec succès ({len(data)} points de données). Il sera affiché automatiquement dans l'interface.",
            "data_points": len(data),
        }, ensure_ascii=False)
        
    except json.JSONDecodeError as e:
        return json.dumps({
            "success": False,
            "error": f"Invalid JSON data: {str(e)}",
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Chart generation failed: {str(e)}",
        }, ensure_ascii=False)


@function_tool
def prepare_chart_data(
    context: RunContextWrapper[AssistantContext],
    query_result_json: str,
    label_column: str,
    value_column: str,
    series_column: Optional[str] = None,
    top_n: Optional[int] = None,
    sort_by: Literal["value", "label", "none"] = "value",
    sort_order: Literal["asc", "desc"] = "desc",
) -> str:
    """Prepare database query results for charting.
    
    Args:
        query_result_json: Result from query_database
        label_column: Column to use for labels (X-axis or pie labels)
        value_column: Column to use for values
        series_column: Optional column for multi-series data
        top_n: Keep only top N items (rest grouped as "Autres")
        sort_by: How to sort data
        sort_order: Sort direction
    
    Returns:
        JSON formatted for create_chart
    """
    try:
        result = json.loads(query_result_json)
        
        if not result.get("success"):
            return json.dumps({"error": "Invalid query result"}, ensure_ascii=False)
        
        rows = result.get("rows", [])
        
        if not rows:
            return json.dumps([], ensure_ascii=False)
        
        # Transform data
        chart_data = []
        for row in rows:
            item = {
                "label": str(row.get(label_column, "")),
                "value": float(row.get(value_column, 0) or 0),
            }
            if series_column:
                item["series"] = str(row.get(series_column, ""))
            chart_data.append(item)
        
        # Sort
        if sort_by == "value":
            chart_data.sort(key=lambda x: x["value"], reverse=(sort_order == "desc"))
        elif sort_by == "label":
            chart_data.sort(key=lambda x: x["label"], reverse=(sort_order == "desc"))
        
        # Top N filtering
        if top_n and len(chart_data) > top_n:
            top_items = chart_data[:top_n]
            others_sum = sum(item["value"] for item in chart_data[top_n:])
            if others_sum > 0:
                top_items.append({"label": "Autres", "value": others_sum})
            chart_data = top_items
        
        return json.dumps(chart_data, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@function_tool
def suggest_chart_type(
    context: RunContextWrapper[AssistantContext],
    data_description: str,
    question_context: str,
) -> str:
    """Suggest the best chart type for given data and context.
    
    Args:
        data_description: Description of data (e.g., "sales by month, 12 data points")
        question_context: Context of the question (e.g., "show evolution over time")
    
    Returns:
        Suggested chart type with rationale
    """
    data_lower = data_description.lower()
    context_lower = question_context.lower()
    
    # Time series detection
    time_indicators = ["temps", "time", "mois", "month", "semaine", "week", "jour", "day", "année", "year", "évolution", "evolution", "trend"]
    is_time_series = any(ind in data_lower or ind in context_lower for ind in time_indicators)
    
    # Composition detection
    composition_indicators = ["répartition", "proportion", "pourcentage", "part", "distribution"]
    is_composition = any(ind in context_lower for ind in composition_indicators)
    
    # Comparison detection
    comparison_indicators = ["comparer", "comparaison", "classement", "ranking", "versus", "vs"]
    is_comparison = any(ind in context_lower for ind in comparison_indicators)
    
    # Few categories detection
    few_categories = "2 catégories" in data_lower or "3 catégories" in data_lower or "4 catégories" in data_lower
    
    if is_time_series and not is_composition:
        suggestion = {
            "chart_type": "line",
            "rationale": "Line chart is best for showing trends over time",
            "alternative": "bar",
        }
    elif is_composition and few_categories:
        suggestion = {
            "chart_type": "pie",
            "rationale": "Pie chart works well for showing proportions with few categories",
            "alternative": "doughnut",
        }
    elif is_comparison:
        suggestion = {
            "chart_type": "horizontal_bar",
            "rationale": "Horizontal bar chart is best for comparing values and showing rankings",
            "alternative": "bar",
        }
    else:
        suggestion = {
            "chart_type": "bar",
            "rationale": "Bar chart is versatile for most data visualization needs",
            "alternative": "line" if len(data_description) > 10 else "horizontal_bar",
        }
    
    return json.dumps(suggestion, ensure_ascii=False)
