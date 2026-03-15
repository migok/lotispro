"""Search tools for AI Assistant - Recherche insensible à la casse et tolérante aux fautes."""

import json
from typing import Optional

from sqlalchemy import text
from agents import RunContextWrapper, function_tool

from app.ai_assistant.context import AssistantContext


def _levenshtein_distance(s1: str, s2: str) -> int:
    """Calcule la distance de Levenshtein entre deux chaînes.
    
    C'est le nombre minimal de caractères à remplacer, insérer ou supprimer
    pour passer de s1 à s2.
    """
    if len(s1) < len(s2):
        return _levenshtein_distance(s2, s1)
    
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1.lower() != c2.lower())
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    
    return previous_row[-1]


def _soundex_fr(name: str) -> str:
    """Simplified Soundex for French names - groups letters by sound.
    
    B, P, V → 1
    C, K, Q, G → 2  
    D, T → 3
    L → 4
    M, N → 5
    R → 6
    S, Z, X → 7
    J, G(e,i) → 8
    """
    if not name:
        return ""
    
    name = name.upper()
    result = name[0]  # Keep first letter
    
    # Sound mapping for French
    sound_map = {
        'B': '1', 'P': '1', 'V': '1',
        'C': '2', 'K': '2', 'Q': '2',
        'D': '3', 'T': '3',
        'L': '4',
        'M': '5', 'N': '5',
        'R': '6',
        'S': '7', 'Z': '7', 'X': '7',
        'J': '8', 'G': '8',
    }
    
    prev_code = None
    for char in name[1:]:
        code = sound_map.get(char)
        if code and code != prev_code:
            result += code
            prev_code = code
        if len(result) >= 4:
            break
    
    # Pad with zeros
    return result.ljust(4, '0')


@function_tool(timeout=30.0)
async def search_person(
    context: RunContextWrapper[AssistantContext],
    name: str,
    search_in: str = "clients",
    include_similar: bool = True,
    max_typo_distance: int = 2,
) -> str:
    """Recherche une personne par nom (insensible à la casse et tolérante aux fautes).
    
    Cet outil gère:
    - Les majuscules/minuscules: "jean" → trouve "Jean", "JEAN"
    - Les fautes de frappe: "Abire" → trouve "Abir" (distance ≤ 2)
    - Les recherches partielles: "bira" → trouve "Sabira"
    - La phonétique: "Jon" → trouve "Jean" (soundex similaire)
    
    Args:
        name: Nom à rechercher (ex: "Jean Dupont", "abire", "jon")
        search_in: Table où chercher ('clients', 'users', 'all')
        include_similar: Si True, inclut les noms similaires (LIKE)
        max_typo_distance: Distance max pour les fautes (défaut: 2 caractères)
    
    Returns:
        Résultats de la recherche au format JSON
    
    Exemples:
        "jean" → trouve "Jean", "JEAN", "jean"
        "marie" → trouve "Marie", "MARIE", "marie", "Marie-Claire"
        "Abire" → trouve "Abir" (1 faute de frappe)
        "Jon" → trouve "Jean", "John" (phonétique)
    """
    
    # Générer toutes les variantes de casse
    variants = [
        name,  # Original
        name.lower(),  # minuscule
        name.upper(),  # MAJUSCULE
        name.capitalize(),  # Première lettre
        name.title(),  # Titre (Jean Dupont)
    ]
    
    # Supprimer les doublons
    variants = list(set(variants))
    
    # Préparer les conditions SQL
    conditions = []
    for variant in variants:
        escaped = variant.replace("'", "''")  # Échapper les quotes
        conditions.append(f"name ILIKE '%{escaped}%'")
    
    # Si recherche similaire activée, ajouter des patterns
    if include_similar:
        words = name.split()
        for word in words:
            if len(word) > 3:  # Éviter les mots trop courts
                escaped_word = word.replace("'", "''")
                conditions.append(f"name ILIKE '%{escaped_word}%'")
    
    # Construire la requête SQL
    where_clause = " OR ".join(conditions)
    
    # Recherche dans clients
    if search_in in ["clients", "all"]:
        sql_clients = f"""
        SELECT 'client' AS person_type, id, name, phone, email, cin, client_type
        FROM clients
        WHERE {where_clause}
        ORDER BY name
        LIMIT 20
        """
    else:
        sql_clients = None

    # Recherche dans users (commerciaux)
    if search_in in ["users", "all"]:
        sql_users = f"""
        SELECT 'commercial' AS person_type, id, name, email, role, company
        FROM users
        WHERE ({where_clause}) AND role IN ('commercial', 'manager')
        ORDER BY name
        LIMIT 20
        """
    else:
        sql_users = None

    # Exécuter les requêtes via SAVEPOINT — isole les échecs sans tuer la transaction parente
    db = context.context.db_session
    results = []

    async def _safe_query(sql: str) -> list:
        try:
            async with db.begin_nested():
                rows = (await db.execute(text(sql))).mappings().fetchall()
                return [dict(r) for r in rows]
        except Exception:
            return []

    if sql_clients:
        results.extend(await _safe_query(sql_clients))

    if sql_users:
        results.extend(await _safe_query(sql_users))
    
    # Si aucun résultat, essayer la recherche fuzzy (tolérance aux fautes)
    if not results and max_typo_distance > 0:
        # Rechercher tous les noms et calculer la distance de Levenshtein
        fuzzy_results = await _fuzzy_search(
            context, name, search_in, max_typo_distance
        )
        results.extend(fuzzy_results)
    
    # Retourner les résultats
    if results:
        best = results[0]
        person_type = best.get("person_type") or best.get("type", "client")
        person_id = best["id"]
        person_name = best.get("name", "")

        # Choose the right FK column depending on entity type
        if person_type == "client":
            sql_filter = f"client_id = {person_id}"
        else:
            sql_filter = f"sold_by_user_id = {person_id}"

        return json.dumps({
            # Top-level fields — MUST be used directly by the agent
            "found": True,
            "person_id": person_id,
            "person_name": person_name,
            "person_type": person_type,
            "sql_filter": sql_filter,
            "instruction": (
                f"OBLIGATOIRE: utiliser '{sql_filter}' dans le WHERE de la prochaine requête SQL. "
                f"Mettre person_id_found={person_id} dans la sortie finale."
            ),
            # Full list for reference only
            "all_matches": results[:3],
        }, ensure_ascii=False)
    else:
        return json.dumps({
            "found": False,
            "person_id": None,
            "search_term": name,
            "instruction": (
                f"Personne '{name}' introuvable. "
                "NE PAS appeler query_database. "
                "Retourner results=[] et person_id_found=null."
            ),
        }, ensure_ascii=False)


async def _fuzzy_search(
    context: RunContextWrapper[AssistantContext],
    name: str,
    search_in: str,
    max_distance: int,
) -> list:
    """Recherche fuzzy avec distance de Levenshtein et Soundex.
    
    Cette fonction est appelée quand la recherche exacte ne trouve rien.
    Elle compare le nom recherché avec tous les noms de la base.
    """
    results = []
    search_soundex = _soundex_fr(name)
    name_lower = name.lower()
    db = context.context.db_session

    async def _fuzzy_rows(sql: str, entity_type: str) -> None:
        try:
            async with db.begin_nested():
                rows = (await db.execute(text(sql))).mappings().fetchall()
        except Exception:
            return
        for row in rows:
            row = dict(row)
            db_name = row.get("name", "")
            if not db_name:
                continue
            distance = _levenshtein_distance(name_lower, db_name.lower())
            db_soundex = _soundex_fr(db_name)
            soundex_match = search_soundex == db_soundex
            is_match = (
                distance <= max_distance
                or soundex_match
                or name_lower in db_name.lower()
                or db_name.lower() in name_lower
            )
            if is_match:
                row["type"] = entity_type
                row["fuzzy_match"] = True
                row["distance"] = distance
                results.append(row)

    if search_in in ["clients", "all"]:
        await _fuzzy_rows(
            "SELECT id, name, phone, email, cin, client_type FROM clients LIMIT 1000",
            "client",
        )
    if search_in in ["users", "all"]:
        await _fuzzy_rows(
            "SELECT id, name, email, role FROM users WHERE role IN ('commercial', 'manager') LIMIT 100",
            "commercial",
        )
    
    # Trier par distance (meilleurs matchs d'abord)
    results.sort(key=lambda x: (x.get('distance', 99), x.get('name', '')))
    
    # Limiter à 5 résultats
    return results[:5]


@function_tool(timeout=30.0)
async def search_by_phone(
    context: RunContextWrapper[AssistantContext],
    phone: str,
) -> str:
    """Recherche une personne par numéro de téléphone.
    
    Args:
        phone: Numéro de téléphone (ex: "0612345678" ou "+212612345678")
    
    Returns:
        Résultats au format JSON
    """
    # Normaliser le numéro (enlever espaces, +, etc.)
    normalized = phone.replace(" ", "").replace("-", "").replace(".", "")
    
    # Générer les variantes
    variants = [normalized]
    if normalized.startswith("0"):
        variants.append("+212" + normalized[1:])  # 0612... → +212612...
    if normalized.startswith("+212"):
        variants.append("0" + normalized[4:])  # +212612... → 0612...
    
    # Construire les conditions
    conditions = []
    for variant in variants:
        escaped = variant.replace("'", "''")
        conditions.append(f"phone ILIKE '%{escaped}%'")
    
    where_clause = " OR ".join(conditions)
    
    # UNION is blocked by the SQL validator — execute two separate queries instead
    sql_clients = f"""
    SELECT 'client' as type, id, name, phone, email, cin, client_type
    FROM clients
    WHERE {where_clause}
    LIMIT 10
    """
    sql_users = f"""
    SELECT 'commercial' as type, id, name, phone, email, role as client_type
    FROM users
    WHERE {where_clause}
    LIMIT 10
    """

    results = []
    for sql, desc in [
        (sql_clients, f"Recherche client par téléphone: {phone}"),
        (sql_users, f"Recherche commercial par téléphone: {phone}"),
    ]:
        try:
            raw = await query_database(context, sql_query=sql, description=desc)
            data = json.loads(raw)
            if data.get("success") and data.get("rows"):
                results.extend(data["rows"])
        except Exception:
            pass

    return json.dumps({
        "success": bool(results),
        "row_count": len(results),
        "columns": list(results[0].keys()) if results else [],
        "rows": results,
    }, ensure_ascii=False, default=str)


@function_tool(timeout=30.0)
async def search_by_cin(
    context: RunContextWrapper[AssistantContext],
    cin: str,
) -> str:
    """Recherche une personne par CIN (Carte d'Identité Nationale).
    
    Args:
        cin: Numéro CIN (ex: "AE123456")
    
    Returns:
        Résultats au format JSON
    """
    # Normaliser (majuscules, sans espaces)
    normalized = cin.upper().replace(" ", "")
    
    # Recherche avec LIKE pour être flexible
    sql = f"""
    SELECT id, name, phone, email, cin, client_type 
    FROM clients 
    WHERE cin ILIKE '%{normalized}%'
    ORDER BY name
    LIMIT 10
    """
    
    return await query_database(
        context,
        sql_query=sql,
        description=f"Recherche par CIN: {cin}",
        parameters_json=None,
    )


@function_tool(timeout=30.0)
async def search_project(
    context: RunContextWrapper[AssistantContext],
    name: str,
    max_typo_distance: int = 2,
) -> str:
    """Recherche un projet par nom (insensible à la casse, tolérant aux fautes de frappe).

    Gère:
    - Majuscules/minuscules: "jardin blanc" → trouve "Jardin Blanc"
    - Recherche partielle: "jardin" → trouve "Jardin Blanc Phase 1"
    - Tolérance aux fautes: "jardin blanck" → trouve "Jardin Blanc" (distance ≤ 2)

    Args:
        name: Nom du projet à rechercher (ex: "jardin blanc", "RÉSIDENCE ATLAS")
        max_typo_distance: Distance de Levenshtein max pour les fautes (défaut: 2)

    Returns:
        Résultats au format JSON avec project_id et sql_filter prêt à l'emploi
    """
    db = context.context.db_session
    escaped = name.replace("'", "''")

    sql = f"""
    SELECT id, name
    FROM projects
    WHERE name ILIKE '%{escaped}%'
    ORDER BY name
    LIMIT 10
    """

    results: list[dict] = []

    async def _safe_query_proj(sql_q: str) -> list:
        try:
            async with db.begin_nested():
                rows = (await db.execute(text(sql_q))).mappings().fetchall()
                return [dict(r) for r in rows]
        except Exception:
            return []

    results = await _safe_query_proj(sql)

    # Fallback fuzzy si aucun résultat ILIKE
    if not results and max_typo_distance > 0:
        name_lower = name.lower()
        try:
            async with db.begin_nested():
                all_rows = (
                    await db.execute(text("SELECT id, name FROM projects LIMIT 500"))
                ).mappings().fetchall()
            fuzzy: list[dict] = []
            for row in all_rows:
                row_dict = dict(row)
                db_name = row_dict.get("name", "")
                if not db_name:
                    continue
                distance = _levenshtein_distance(name_lower, db_name.lower())
                if (
                    distance <= max_typo_distance
                    or name_lower in db_name.lower()
                    or db_name.lower() in name_lower
                ):
                    row_dict["_distance"] = distance
                    fuzzy.append(row_dict)
            fuzzy.sort(key=lambda x: x.get("_distance", 99))
            results = fuzzy[:5]
        except Exception:
            pass

    if results:
        best = results[0]
        project_id = best["id"]
        project_name = best["name"]
        sql_filter = f"project_id = {project_id}"

        return json.dumps({
            "found": True,
            "project_id": project_id,
            "project_name": project_name,
            "sql_filter": sql_filter,
            "instruction": (
                f"OBLIGATOIRE: utiliser '{sql_filter}' dans le WHERE de la prochaine requête SQL."
            ),
            "all_matches": [{"id": r["id"], "name": r["name"]} for r in results[:3]],
        }, ensure_ascii=False)
    else:
        return json.dumps({
            "found": False,
            "project_id": None,
            "search_term": name,
            "instruction": (
                f"Projet '{name}' introuvable. "
                "NE PAS appeler query_database. "
                "Retourner results=[] et project_id_found=null."
            ),
        }, ensure_ascii=False)
