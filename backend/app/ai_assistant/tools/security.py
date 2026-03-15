"""SQL security utilities for AI Assistant."""

import re
import sqlparse
from typing import Set, Tuple

from app.ai_assistant.config import ALLOWED_SQL_TABLES, FORBIDDEN_SQL_KEYWORDS


class SQLSecurityError(Exception):
    """Raised when SQL validation fails."""
    pass


def extract_table_names(sql: str) -> Set[str]:
    """Extract table names from SQL query using regex on comment-stripped SQL.

    Handles SQL functions that use the FROM keyword internally
    (e.g., EXTRACT(YEAR FROM col), TRIM(... FROM str)) by blanking their
    content before applying FROM/JOIN pattern matching, preventing false positives.

    Args:
        sql: SQL query string (already stripped of comments)

    Returns:
        Set of lowercase table names found
    """
    tables: Set[str] = set()

    # Blank out SQL functions that use FROM internally to avoid false positives.
    # e.g. EXTRACT(YEAR FROM sale_date) → "()" so 'sale_date' is not mistaken for a table.
    # [^)]* is sufficient since EXTRACT/TRIM args never contain nested parentheses.
    sql_clean = re.sub(
        r'\b(?:EXTRACT|TRIM|OVERLAY|POSITION)\s*\([^)]*\)',
        '()',
        sql,
        flags=re.IGNORECASE,
    )

    patterns = [
        r'\bFROM\s+(\w+)',
        r'\bJOIN\s+(\w+)',
        r'\bINTO\s+(\w+)',
        r'\bUPDATE\s+(\w+)',
        r'\bTABLE\s+(\w+)',
    ]

    for pattern in patterns:
        for match in re.findall(pattern, sql_clean, re.IGNORECASE):
            tables.add(match.lower())

    return tables


def _collect_token_values(parsed) -> list[str]:  # type: ignore[no-untyped-def]
    """Recursively collect normalised token string values from a parsed statement."""
    return [token.normalized.upper() for token in parsed.flatten() if token.ttype is not None]


def validate_sql(sql: str) -> Tuple[bool, str]:
    """Validate SQL query for security using sqlparse AST traversal.

    Approach:
    1. Strip comments first (eliminates obfuscation via --comment or /* */)
    2. Enforce single SELECT statement via sqlparse
    3. Walk flattened token list and block forbidden keywords at token level
    4. Validate referenced tables against the allowlist

    Args:
        sql: SQL query to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not sql or not sql.strip():
        return False, "SQL query is empty"

    sql_clean = sql.strip().rstrip(';')

    # 1. Strip all comments before further analysis
    sql_no_comments = sqlparse.format(sql_clean, strip_comments=True).strip()
    if not sql_no_comments:
        return False, "SQL is empty after stripping comments"

    # 2. Enforce single statement
    statements = [s for s in sqlparse.split(sql_no_comments) if s.strip()]
    if len(statements) > 1:
        return False, "Multiple SQL statements are not allowed"

    # 3. Parse and validate statement type
    parsed = sqlparse.parse(sql_no_comments)[0]  # type: ignore[misc]
    stmt_type = parsed.get_type()
    if stmt_type != 'SELECT':
        return False, f"Only SELECT statements are allowed, got: {stmt_type or 'UNKNOWN'}"

    # 4. Walk token tree and check for forbidden keywords
    token_values = _collect_token_values(parsed)
    for keyword in FORBIDDEN_SQL_KEYWORDS:
        if keyword.upper() in token_values:
            return False, f"Forbidden keyword detected: {keyword}"

    # 5. Validate table names against allowlist
    tables = extract_table_names(sql_no_comments)
    for table in tables:
        if table not in ALLOWED_SQL_TABLES:
            return False, f"Table not allowed: {table}"

    return True, "OK"


def sanitize_sql(sql: str) -> str:
    """Sanitize SQL query before execution.
    
    Args:
        sql: SQL query to sanitize
        
    Returns:
        Sanitized SQL query
    """
    # Remove trailing semicolon
    sql = sql.strip().rstrip(';')
    
    # Ensure single statement
    statements = sqlparse.split(sql)
    if statements:
        sql = statements[0]
    
    return sql.strip()


def format_sql_for_display(sql: str) -> str:
    """Format SQL for display/logging.
    
    Args:
        sql: SQL query
        
    Returns:
        Formatted SQL string
    """
    return sqlparse.format(sql, reindent=True, keyword_case='upper')


def get_schema_description() -> str:
    """Get schema description for LLM context.
    
    Returns:
        Schema description string
    """
    return """
=== DATABASE SCHEMA ===

sales (VENTES):
- id: INTEGER PRIMARY KEY
- project_id: INTEGER → projects.id
- lot_id: INTEGER → lots.id
- client_id: INTEGER → clients.id
- sold_by_user_id: INTEGER → users.id (commercial qui a vendu)
- sale_date: TIMESTAMP (date de la vente)
- price: FLOAT (prix de vente)
- notes: TEXT

lots (LOTS):
- id: INTEGER PRIMARY KEY
- project_id: INTEGER → projects.id
- numero: VARCHAR (numéro du lot)
- zone: VARCHAR (zone géographique)
- surface: FLOAT (surface en m²)
- price: FLOAT (prix de base)
- status: ENUM ('available', 'reserved', 'sold', 'blocked')
- type_lot: VARCHAR (type de lot)
- geometry: TEXT (GeoJSON)

reservations (RÉSERVATIONS):
- id: INTEGER PRIMARY KEY
- project_id: INTEGER → projects.id
- lot_id: INTEGER → lots.id
- client_id: INTEGER → clients.id
- reserved_by_user_id: INTEGER → users.id (commercial)
- reservation_date: TIMESTAMP
- expiration_date: TIMESTAMP
- deposit: FLOAT (acompte versé)
- status: ENUM ('active', 'validated', 'expired', 'released', 'converted')
- release_reason: TEXT (raison de libération)

users (UTILISATEURS/COMMERCIAUX):
- id: INTEGER PRIMARY KEY
- email: VARCHAR
- name: VARCHAR
- role: ENUM ('manager', 'commercial', 'client')
- company: VARCHAR

projects (PROJETS):
- id: INTEGER PRIMARY KEY
- name: VARCHAR
- total_lots: INTEGER  ← KPI dénormalisé, NE PAS utiliser dans les calculs — utiliser COUNT(*) FROM lots à la place
- sold_lots: INTEGER   ← KPI dénormalisé, NE PAS utiliser dans les calculs — utiliser COUNT(*) FROM lots WHERE status='sold'
- ca_objectif: FLOAT (objectif CA du projet)
- geojson_file_url: VARCHAR

payment_installments (ÉCHÉANCES DE PAIEMENT):
- id: INTEGER PRIMARY KEY
- schedule_id: INTEGER → payment_schedules.id
- payment_type: ENUM ('deposit', 'balance')
- amount: FLOAT
- due_date: TIMESTAMP (date d'échéance)
- paid_date: TIMESTAMP (date de paiement)
- status: ENUM ('pending', 'paid')

payment_schedules (PLANS DE PAIEMENT):
- id: INTEGER PRIMARY KEY
- reservation_id: INTEGER → reservations.id
- lot_price: FLOAT
- deposit_total: FLOAT
- balance_total: FLOAT

clients (CLIENTS):
- id: INTEGER PRIMARY KEY
- name: VARCHAR
- phone: VARCHAR
- email: VARCHAR
- cin: VARCHAR (carte d'identité)
- client_type: ENUM ('proprietaire', 'revendeur', 'investisseur', 'autre')

assignments (ATTRIBUTIONS PROJET):
- id: INTEGER PRIMARY KEY
- user_id: INTEGER → users.id
- project_id: INTEGER → projects.id
- assigned_at: TIMESTAMP

=== COMMON QUERIES ===

Ventes cette semaine:
SELECT COUNT(*), SUM(price) FROM sales 
WHERE sale_date >= date_trunc('week', CURRENT_DATE);

Ventes par commercial ce mois:
SELECT u.name, COUNT(s.id), SUM(s.price)
FROM sales s
JOIN users u ON s.sold_by_user_id = u.id
WHERE s.sale_date >= date_trunc('month', CURRENT_DATE)
GROUP BY u.name;

Lots disponibles:
SELECT numero, zone, price FROM lots WHERE status = 'available';

Réservations expirant:
SELECT r.id, l.numero, c.name, r.expiration_date
FROM reservations r
JOIN lots l ON r.lot_id = l.id
JOIN clients c ON r.client_id = c.id
WHERE r.status = 'active' AND r.expiration_date < CURRENT_DATE + INTERVAL '7 days';

Paiements en retard:
SELECT pi.amount, pi.due_date, c.name
FROM payment_installments pi
JOIN payment_schedules ps ON pi.schedule_id = ps.id
JOIN reservations r ON ps.reservation_id = r.id
JOIN clients c ON r.client_id = c.id
WHERE pi.status = 'pending' AND pi.due_date < CURRENT_DATE;

Prédiction CA d'un projet avec un prix au m² donné (ex: 4000 MAD/m²):
-- IMPORTANT: total_lots sur projects est un KPI dénormalisé → toujours compter via lots
SELECT COUNT(*) AS nb_lots, SUM(l.surface) AS surface_totale, AVG(l.surface) AS surface_moyenne,
       COUNT(*) * AVG(l.surface) * 4000 AS ca_predit
FROM lots l
JOIN projects p ON l.project_id = p.id
WHERE p.name ILIKE '%Jardin Blanc%';

Lots d'un projet avec leur surface (pour calcul CA):
SELECT l.numero, l.zone, l.surface, l.status
FROM lots l
JOIN projects p ON l.project_id = p.id
WHERE p.name ILIKE '%nom_projet%'
ORDER BY l.zone, l.numero;
"""
