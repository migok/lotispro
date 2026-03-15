"""Analysis tools for Business Analyst agent."""

import json
from typing import Any, Dict, List, Literal, Optional

from agents import RunContextWrapper, function_tool

from app.ai_assistant.context import AssistantContext
from app.ai_assistant.tools.database_tools import query_database


@function_tool
async def fetch_data_for_analysis(
    context: RunContextWrapper[AssistantContext],
    data_need_description: str,
    time_period: Optional[str] = None,
    filters_json: Optional[str] = None,
) -> str:
    """Fetch data from database for analysis purposes.
    
    This tool allows the analyst to get additional data without writing SQL directly.
    The tool will generate appropriate SQL based on the description.
    
    Args:
        data_need_description: Description in natural language of what data is needed
        time_period: Optional time period (e.g., "this_week", "this_month", "last_quarter")
        filters: Optional filters like {"project_id": 5, "user_id": 3}
    
    Returns:
        JSON string with query results
    """
    # This is a simplified version - in production, you might want to
    # have the LLM generate SQL based on the description
    # For now, we'll return a helpful message
    
    # Parse filters if provided
    filters = None
    if filters_json:
        try:
            filters = json.loads(filters_json)
        except json.JSONDecodeError:
            pass
    
    return json.dumps({
        "info": "Use query_database tool with appropriate SQL to fetch this data.",
        "hint": f"For '{data_need_description}', consider querying relevant tables.",
        "time_period": time_period,
        "filters": filters,
    }, ensure_ascii=False)


@function_tool
def calculate_kpis(
    context: RunContextWrapper[AssistantContext],
    data_json: str,
    kpi_types: str,
) -> str:
    """Calculate business KPIs from data.
    
    Args:
        data_json: JSON string containing the raw data
        kpi_types: List of KPIs to calculate
    
    Returns:
        JSON string with calculated KPIs
    """
    try:
        data = json.loads(data_json)
        kpi_list = json.loads(kpi_types) if kpi_types else []
        
        if not data.get("success", False):
            return json.dumps({"error": "Invalid data provided"}, ensure_ascii=False)
        
        rows = data.get("rows", [])
        kpis = {}
        
        for kpi_type in kpi_list:
            if kpi_type == "revenue_per_lot" and rows:
                # Calculate average revenue
                total = sum(float(row.get('price', 0) or row.get('total', 0) or 0) for row in rows)
                count = len(rows)
                kpis[kpi_type] = round(total / count, 2) if count > 0 else 0
            
            elif kpi_type == "conversion_rate":
                # Would need reservations and sales data
                kpis[kpi_type] = "N/A - requires reservation data"
            
            elif kpi_type == "performance_index":
                # Normalize performance (0-100 scale)
                if rows and any('price' in str(row.keys()).lower() for row in rows[:1]):
                    values = [float(row.get('price', 0) or 0) for row in rows]
                    max_val = max(values) if values else 1
                    kpis[kpi_type] = round((sum(values) / len(values)) / max_val * 100, 2) if max_val else 0
                else:
                    kpis[kpi_type] = 50  # Neutral
            
            elif kpi_type == "occupation_rate":
                kpis[kpi_type] = "Calculate from lots status data"
            
            else:
                kpis[kpi_type] = "Calculation not implemented for this data"
        
        return json.dumps({
            "success": True,
            "kpis": kpis,
            "data_points": len(rows),
        }, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@function_tool
def compare_periods(
    context: RunContextWrapper[AssistantContext],
    current_data_json: str,
    previous_data_json: str,
    metric_column: str,
) -> str:
    """Compare data between two periods.
    
    Args:
        current_data_json: JSON data for current period
        previous_data_json: JSON data for previous period
        metric_column: Column name to compare
    
    Returns:
        Comparison results with evolution percentage
    """
    try:
        current = json.loads(current_data_json)
        previous = json.loads(previous_data_json)
        
        if not (current.get("success") and previous.get("success")):
            return json.dumps({"error": "Invalid data"}, ensure_ascii=False)
        
        curr_rows = current.get("rows", [])
        prev_rows = previous.get("rows", [])
        
        # Extract values
        curr_values = [float(row.get(metric_column, 0) or 0) for row in curr_rows]
        prev_values = [float(row.get(metric_column, 0) or 0) for row in prev_rows]
        
        curr_total = sum(curr_values)
        prev_total = sum(prev_values)
        
        # Calculate evolution
        if prev_total > 0:
            evolution_pct = ((curr_total - prev_total) / prev_total) * 100
        else:
            evolution_pct = 100 if curr_total > 0 else 0
        
        # Determine trend
        if evolution_pct > 10:
            trend = "strong_increase"
        elif evolution_pct > 0:
            trend = "slight_increase"
        elif evolution_pct > -10:
            trend = "slight_decrease"
        else:
            trend = "strong_decrease"
        
        return json.dumps({
            "success": True,
            "current_period": {
                "total": round(curr_total, 2),
                "count": len(curr_rows),
            },
            "previous_period": {
                "total": round(prev_total, 2),
                "count": len(prev_rows),
            },
            "evolution_percentage": round(evolution_pct, 2),
            "trend": trend,
            "assessment": "positive" if evolution_pct > 0 else "negative" if evolution_pct < 0 else "stable",
        }, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@function_tool
def detect_anomalies(
    context: RunContextWrapper[AssistantContext],
    data_json: str,
    value_column: str,
    sensitivity: Literal["low", "medium", "high"] = "medium",
) -> str:
    """Detect anomalies in data.
    
    Args:
        data_json: JSON data to analyze
        value_column: Column to check for anomalies
        sensitivity: Detection sensitivity
    
    Returns:
        List of detected anomalies
    """
    try:
        data = json.loads(data_json)
        
        if not data.get("success"):
            return json.dumps({"error": "Invalid data"}, ensure_ascii=False)
        
        rows = data.get("rows", [])
        values = [float(row.get(value_column, 0) or 0) for row in rows]
        
        if len(values) < 3:
            return json.dumps({
                "success": True,
                "anomalies": [],
                "message": "Not enough data for anomaly detection",
            }, ensure_ascii=False)
        
        # Calculate mean and standard deviation
        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        std_dev = variance ** 0.5
        
        # Set threshold based on sensitivity
        thresholds = {"low": 3.0, "medium": 2.0, "high": 1.5}
        threshold = thresholds.get(sensitivity, 2.0)
        
        # Detect anomalies
        anomalies = []
        for i, (row, value) in enumerate(zip(rows, values)):
            z_score = abs((value - mean) / std_dev) if std_dev > 0 else 0
            
            if z_score > threshold:
                anomalies.append({
                    "index": i,
                    "row": row,
                    "value": value,
                    "z_score": round(z_score, 2),
                    "deviation_from_mean": round(value - mean, 2),
                    "severity": "high" if z_score > threshold + 1 else "medium",
                })
        
        return json.dumps({
            "success": True,
            "anomalies_count": len(anomalies),
            "anomalies": anomalies[:10],  # Limit to top 10
            "statistics": {
                "mean": round(mean, 2),
                "std_dev": round(std_dev, 2),
                "min": min(values),
                "max": max(values),
            },
        }, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@function_tool
def calculate_trend(
    context: RunContextWrapper[AssistantContext],
    time_series_data_json: str,
    date_column: str = "date",
    value_column: str = "value",
    forecast_periods: Optional[int] = None,
) -> str:
    """Calculate trend from time series data.
    
    Args:
        time_series_data_json: JSON with time series data
        date_column: Name of date column
        value_column: Name of value column
        forecast_periods: Optional number of periods to forecast
    
    Returns:
        Trend analysis and optional forecast
    """
    try:
        data = json.loads(time_series_data_json)
        
        if not data.get("success"):
            return json.dumps({"error": "Invalid data"}, ensure_ascii=False)
        
        rows = data.get("rows", [])
        
        if len(rows) < 2:
            return json.dumps({
                "success": False,
                "error": "Need at least 2 data points for trend",
            }, ensure_ascii=False)
        
        # Extract values
        values = [float(row.get(value_column, 0) or 0) for row in rows]
        
        # Simple linear regression
        n = len(values)
        x = list(range(n))
        
        mean_x = sum(x) / n
        mean_y = sum(values) / n
        
        # Calculate slope
        numerator = sum((x[i] - mean_x) * (values[i] - mean_y) for i in range(n))
        denominator = sum((x[i] - mean_x) ** 2 for i in range(n))
        
        slope = numerator / denominator if denominator != 0 else 0
        intercept = mean_y - slope * mean_x
        
        # Determine trend direction
        if slope > 0.01:
            trend_direction = "increasing"
        elif slope < -0.01:
            trend_direction = "decreasing"
        else:
            trend_direction = "stable"
        
        # Calculate R-squared
        ss_res = sum((values[i] - (intercept + slope * x[i])) ** 2 for i in range(n))
        ss_tot = sum((values[i] - mean_y) ** 2 for i in range(n))
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        
        result = {
            "success": True,
            "trend": {
                "direction": trend_direction,
                "slope": round(slope, 4),
                "intercept": round(intercept, 2),
                "r_squared": round(r_squared, 4),
                "strength": "strong" if r_squared > 0.7 else "moderate" if r_squared > 0.3 else "weak",
            },
            "data_points": n,
            "first_value": values[0],
            "last_value": values[-1],
            "overall_change": round(values[-1] - values[0], 2),
            "overall_change_pct": round(((values[-1] - values[0]) / values[0] * 100), 2) if values[0] != 0 else 0,
        }
        
        # Simple forecast if requested
        if forecast_periods and forecast_periods > 0:
            forecast = []
            last_x = n - 1
            for i in range(1, forecast_periods + 1):
                predicted = intercept + slope * (last_x + i)
                forecast.append({
                    "period": i,
                    "predicted_value": round(max(0, predicted), 2),  # Ensure non-negative
                })
            result["forecast"] = forecast
        
        return json.dumps(result, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@function_tool
def compare_to_target(
    context: RunContextWrapper[AssistantContext],
    actual_value: float,
    target_value: float,
    metric_name: str = "metric",
) -> str:
    """Compare actual value to target.
    
    Args:
        actual_value: Actual achieved value
        target_value: Target value
        metric_name: Name of the metric for display
    
    Returns:
        Comparison result with achievement status
    """
    if target_value == 0:
        achievement_pct = 100 if actual_value > 0 else 0
    else:
        achievement_pct = (actual_value / target_value) * 100
    
    # Determine status
    if achievement_pct >= 100:
        status = "success"
        emoji = "✅"
    elif achievement_pct >= 80:
        status = "warning"
        emoji = "⚠️"
    else:
        status = "danger"
        emoji = "🔴"
    
    gap = actual_value - target_value
    
    return json.dumps({
        "success": True,
        "metric": metric_name,
        "actual": round(actual_value, 2),
        "target": round(target_value, 2),
        "achievement_percentage": round(achievement_pct, 2),
        "gap": round(gap, 2),
        "status": status,
        "emoji": emoji,
        "assessment": "Objective atteinte !" if status == "success" else f"Écart de {abs(round(gap, 2))} à combler",
    }, ensure_ascii=False)


@function_tool
def generate_insights(
    context: RunContextWrapper[AssistantContext],
    data_json: str,
    context_description: str,
    analysis_types: str,
) -> str:
    """Generate business insights from data.
    
    Args:
        data_json: Data to analyze
        context_description: Context of the analysis (e.g., "performance commerciaux mensuelle")
        analysis_types: Types of insights to generate
    
    Returns:
        Structured insights
    """
    try:
        data = json.loads(data_json)
        analysis_list = json.loads(analysis_types) if analysis_types else []
        
        if not data.get("success"):
            return json.dumps({"error": "Invalid data"}, ensure_ascii=False)
        
        rows = data.get("rows", [])
        
        insights = {
            "context": context_description,
            "data_summary": {
                "total_records": len(rows),
                "columns": data.get("columns", []),
            },
            "insights": {},
        }
        
        # Generate basic insights based on data patterns
        if "strengths" in analysis_list:
            strengths = []
            if rows:
                # Find highest values
                strengths.append("Données disponibles pour analyse complète")
            insights["insights"]["strengths"] = strengths
        
        if "weaknesses" in analysis_list:
            weaknesses = []
            if len(rows) < 5:
                weaknesses.append("Volume de données limité pour une analyse robuste")
            insights["insights"]["weaknesses"] = weaknesses
        
        if "recommendations" in analysis_list:
            recommendations = [
                {
                    "priority": "high",
                    "action": "Monitorer les tendances sur plusieurs périodes",
                    "rationale": "Nécessite des données historiques pour validation",
                },
                {
                    "priority": "medium",
                    "action": "Comparer avec objectifs définis",
                    "rationale": "Mettre en perspective les résultats",
                },
            ]
            insights["insights"]["recommendations"] = recommendations
        
        return json.dumps(insights, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)
