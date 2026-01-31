import sqlite3
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

# Base de données SQLite dans le dossier backend
DB_PATH = Path(__file__).resolve().parent / "lots.db"


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """
    Initialise la base SQLite avec toutes les tables nécessaires
    """
    conn = connect()
    cur = conn.cursor()

    # Table des utilisateurs
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('manager', 'commercial', 'client')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    # Table des projets (lotissements)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('public', 'private')),
            total_lots INTEGER DEFAULT 0,
            sold_lots INTEGER DEFAULT 0,
            ca_objectif REAL,
            created_by INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
        """
    )

    # Table des assignations (commercial <-> projet)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            assigned_at TEXT NOT NULL,
            assigned_by INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (assigned_by) REFERENCES users(id),
            UNIQUE(user_id, project_id)
        )
        """
    )

    # Table des lots
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS lots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            numero TEXT NOT NULL,
            zone TEXT,
            surface REAL,
            price REAL,
            status TEXT NOT NULL DEFAULT 'available',
            current_reservation_id INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (current_reservation_id) REFERENCES reservations(id),
            UNIQUE(project_id, numero)
        )
        """
    )

    # Table des clients
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            cin TEXT,
            client_type TEXT DEFAULT 'autre' CHECK(client_type IN ('proprietaire', 'revendeur', 'investisseur', 'autre')),
            notes TEXT,
            created_by_user_id INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (created_by_user_id) REFERENCES users(id)
        )
        """
    )

    # Migration: Ajouter client_type si la colonne n'existe pas
    try:
        cur.execute("ALTER TABLE clients ADD COLUMN client_type TEXT DEFAULT 'autre' CHECK(client_type IN ('proprietaire', 'revendeur', 'investisseur', 'autre'))")
    except sqlite3.OperationalError:
        pass  # La colonne existe déjà

    # Migration: Ajouter created_by_user_id si la colonne n'existe pas
    try:
        cur.execute("ALTER TABLE clients ADD COLUMN created_by_user_id INTEGER REFERENCES users(id)")
    except sqlite3.OperationalError:
        pass  # La colonne existe déjà

    # Table des réservations
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            lot_id INTEGER NOT NULL,
            client_id INTEGER NOT NULL,
            reserved_by_user_id INTEGER,
            reservation_date TEXT NOT NULL,
            expiration_date TEXT NOT NULL,
            deposit REAL DEFAULT 0,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (lot_id) REFERENCES lots(id),
            FOREIGN KEY (client_id) REFERENCES clients(id),
            FOREIGN KEY (reserved_by_user_id) REFERENCES users(id)
        )
        """
    )

    # Table des ventes
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            lot_id INTEGER NOT NULL,
            client_id INTEGER NOT NULL,
            reservation_id INTEGER,
            sold_by_user_id INTEGER,
            sale_date TEXT NOT NULL,
            price REAL NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (lot_id) REFERENCES lots(id),
            FOREIGN KEY (client_id) REFERENCES clients(id),
            FOREIGN KEY (reservation_id) REFERENCES reservations(id),
            FOREIGN KEY (sold_by_user_id) REFERENCES users(id)
        )
        """
    )

    # Migration: Ajouter sold_by_user_id si la colonne n'existe pas
    try:
        cur.execute("ALTER TABLE sales ADD COLUMN sold_by_user_id INTEGER REFERENCES users(id)")
    except sqlite3.OperationalError:
        pass  # La colonne existe déjà

    # Ancienne table pour compatibilité (migration)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS lots_status (
            lot_id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'available',
            reserved_by TEXT,
            reserved_until TEXT,
            updated_at TEXT NOT NULL
        )
        """
    )

    # Table des audit logs (historique)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            action TEXT NOT NULL,
            user_id TEXT,
            old_data TEXT,
            new_data TEXT,
            created_at TEXT NOT NULL
        )
        """
    )

    conn.commit()
    conn.close()


# ============================================================
# LOTS
# ============================================================
def create_lot(
    project_id: int,
    numero: str,
    zone: Optional[str] = None,
    surface: Optional[float] = None,
    price: Optional[float] = None,
    status: str = "available"
) -> Dict[str, Any]:
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    cur.execute(
        """
        INSERT INTO lots (project_id, numero, zone, surface, price, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (project_id, numero, zone, surface, price, status, now, now),
    )
    lot_id = cur.lastrowid
    conn.commit()
    conn.close()

    return get_lot_by_id(lot_id)


def get_lot_by_id(lot_id: int) -> Optional[Dict[str, Any]]:
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM lots WHERE id = ?", (lot_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_lot_by_numero(numero: str, project_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """
    Récupère un lot par son numéro.
    Si project_id est fourni, cherche uniquement dans ce projet.
    """
    conn = connect()
    cur = conn.cursor()
    if project_id:
        cur.execute("SELECT * FROM lots WHERE numero = ? AND project_id = ?", (numero, project_id))
    else:
        cur.execute("SELECT * FROM lots WHERE numero = ?", (numero,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_lots(
    project_id: Optional[int] = None,
    numero: Optional[str] = None,
    zone: Optional[str] = None,
    status: Optional[str] = None,
    surface_min: Optional[float] = None,
    surface_max: Optional[float] = None
) -> List[Dict[str, Any]]:
    conn = connect()
    cur = conn.cursor()

    query = "SELECT * FROM lots WHERE 1=1"
    params = []

    if project_id is not None:
        query += " AND project_id = ?"
        params.append(project_id)
    if numero:
        query += " AND numero LIKE ?"
        params.append(f"%{numero}%")
    if zone:
        query += " AND zone LIKE ?"
        params.append(f"%{zone}%")
    if status:
        query += " AND status = ?"
        params.append(status)
    if surface_min is not None:
        query += " AND surface >= ?"
        params.append(surface_min)
    if surface_max is not None:
        query += " AND surface <= ?"
        params.append(surface_max)

    query += " ORDER BY created_at DESC"

    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def update_lot(
    lot_id: int,
    numero: Optional[str] = None,
    zone: Optional[str] = None,
    surface: Optional[float] = None,
    price: Optional[float] = None,
    status: Optional[str] = None,
    current_reservation_id: Optional[int] = None
) -> Optional[Dict[str, Any]]:
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    updates = ["updated_at = ?"]
    params = [now]

    if numero is not None:
        updates.append("numero = ?")
        params.append(numero)
    if zone is not None:
        updates.append("zone = ?")
        params.append(zone)
    if surface is not None:
        updates.append("surface = ?")
        params.append(surface)
    if price is not None:
        updates.append("price = ?")
        params.append(price)
    if status is not None:
        updates.append("status = ?")
        params.append(status)
    if current_reservation_id is not None:
        updates.append("current_reservation_id = ?")
        params.append(current_reservation_id if current_reservation_id != -1 else None)

    params.append(lot_id)

    cur.execute(
        f"UPDATE lots SET {', '.join(updates)} WHERE id = ?",
        params,
    )
    conn.commit()
    conn.close()

    return get_lot_by_id(lot_id)


def delete_lot(lot_id: int) -> bool:
    conn = connect()
    cur = conn.cursor()
    cur.execute("DELETE FROM lots WHERE id = ?", (lot_id,))
    deleted = cur.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ============================================================
# CLIENTS
# ============================================================
def create_client(
    name: str,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    cin: Optional[str] = None,
    client_type: str = "autre",
    notes: Optional[str] = None,
    created_by_user_id: Optional[int] = None
) -> Dict[str, Any]:
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    cur.execute(
        """
        INSERT INTO clients (name, phone, email, cin, client_type, notes, created_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (name, phone, email, cin, client_type, notes, created_by_user_id, now, now),
    )
    client_id = cur.lastrowid
    conn.commit()
    conn.close()

    return get_client_by_id(client_id)


def get_client_by_id(client_id: int) -> Optional[Dict[str, Any]]:
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM clients WHERE id = ?", (client_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_clients(
    search: Optional[str] = None
) -> List[Dict[str, Any]]:
    conn = connect()
    cur = conn.cursor()

    if search:
        cur.execute(
            """
            SELECT * FROM clients
            WHERE name LIKE ? OR phone LIKE ? OR cin LIKE ?
            ORDER BY created_at DESC
            """,
            (f"%{search}%", f"%{search}%", f"%{search}%"),
        )
    else:
        cur.execute("SELECT * FROM clients ORDER BY created_at DESC")

    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def update_client(
    client_id: int,
    name: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    cin: Optional[str] = None,
    client_type: Optional[str] = None,
    notes: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    updates = ["updated_at = ?"]
    params = [now]

    if name is not None:
        updates.append("name = ?")
        params.append(name)
    if phone is not None:
        updates.append("phone = ?")
        params.append(phone)
    if email is not None:
        updates.append("email = ?")
        params.append(email)
    if cin is not None:
        updates.append("cin = ?")
        params.append(cin)
    if client_type is not None:
        updates.append("client_type = ?")
        params.append(client_type)
    if notes is not None:
        updates.append("notes = ?")
        params.append(notes)

    params.append(client_id)

    cur.execute(
        f"UPDATE clients SET {', '.join(updates)} WHERE id = ?",
        params,
    )
    conn.commit()
    conn.close()

    return get_client_by_id(client_id)


def get_client_details(client_id: int) -> Optional[Dict[str, Any]]:
    """Récupère les détails complets d'un client avec son historique d'achat"""
    conn = connect()
    cur = conn.cursor()

    # Récupérer les infos de base du client
    cur.execute("SELECT * FROM clients WHERE id = ?", (client_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return None

    client = dict(row)

    # Récupérer le commercial qui a créé le client
    if client.get("created_by_user_id"):
        cur.execute("SELECT id, name, email FROM users WHERE id = ?", (client["created_by_user_id"],))
        creator_row = cur.fetchone()
        if creator_row:
            client["created_by"] = dict(creator_row)

    # Récupérer l'historique des ventes
    cur.execute("""
        SELECT
            s.id,
            s.sale_date,
            s.price,
            s.notes,
            l.numero as lot_numero,
            l.surface as lot_surface,
            l.zone as lot_zone,
            p.id as project_id,
            p.name as project_name,
            u.id as sold_by_user_id,
            u.name as sold_by_name
        FROM sales s
        JOIN lots l ON s.lot_id = l.id
        JOIN projects p ON s.project_id = p.id
        LEFT JOIN users u ON s.sold_by_user_id = u.id
        WHERE s.client_id = ?
        ORDER BY s.sale_date DESC
    """, (client_id,))
    client["sales_history"] = [dict(row) for row in cur.fetchall()]

    # Récupérer l'historique des réservations
    cur.execute("""
        SELECT
            r.id,
            r.reservation_date,
            r.expiration_date,
            r.deposit,
            r.status,
            r.notes,
            l.numero as lot_numero,
            l.surface as lot_surface,
            l.zone as lot_zone,
            l.price as lot_price,
            p.id as project_id,
            p.name as project_name,
            u.id as reserved_by_user_id,
            u.name as reserved_by_name
        FROM reservations r
        JOIN lots l ON r.lot_id = l.id
        JOIN projects p ON r.project_id = p.id
        LEFT JOIN users u ON r.reserved_by_user_id = u.id
        WHERE r.client_id = ?
        ORDER BY r.reservation_date DESC
    """, (client_id,))
    client["reservations_history"] = [dict(row) for row in cur.fetchall()]

    # Calculer les statistiques
    total_purchases = sum(s.get("price", 0) or 0 for s in client["sales_history"])
    total_lots = len(client["sales_history"])
    total_deposit = sum(r.get("deposit", 0) or 0 for r in client["reservations_history"] if r.get("status") == "active")
    active_reservations = len([r for r in client["reservations_history"] if r.get("status") == "active"])

    client["stats"] = {
        "total_purchases": total_purchases,
        "total_lots": total_lots,
        "total_deposit": total_deposit,
        "active_reservations": active_reservations,
        "total_reservations": len(client["reservations_history"]),
        "converted_reservations": len([r for r in client["reservations_history"] if r.get("status") == "converted"]),
    }

    conn.close()
    return client


# ============================================================
# RESERVATIONS
# ============================================================
def create_reservation(
    project_id: int,
    lot_id: int,
    client_id: int,
    reserved_by_user_id: Optional[int] = None,
    expiration_date: Optional[str] = None,
    deposit: float = 0,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    # Par défaut, expiration dans 7 jours
    if not expiration_date:
        from datetime import timedelta
        exp = datetime.now(timezone.utc) + timedelta(days=7)
        expiration_date = exp.isoformat()

    cur.execute(
        """
        INSERT INTO reservations
        (project_id, lot_id, client_id, reserved_by_user_id, reservation_date, expiration_date, deposit, notes, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        """,
        (project_id, lot_id, client_id, reserved_by_user_id, now, expiration_date, deposit, notes, now, now),
    )
    reservation_id = cur.lastrowid
    conn.commit()
    conn.close()

    return get_reservation_by_id(reservation_id)


def get_reservation_by_id(reservation_id: int) -> Optional[Dict[str, Any]]:
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_reservations(
    status: Optional[str] = None,
    lot_id: Optional[int] = None,
    client_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    conn = connect()
    cur = conn.cursor()

    query = "SELECT * FROM reservations WHERE 1=1"
    params = []

    if status:
        query += " AND status = ?"
        params.append(status)
    if lot_id:
        query += " AND lot_id = ?"
        params.append(lot_id)
    if client_id:
        query += " AND client_id = ?"
        params.append(client_id)

    query += " ORDER BY created_at DESC"

    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def update_reservation(
    reservation_id: int,
    status: Optional[str] = None,
    expiration_date: Optional[str] = None,
    deposit: Optional[float] = None,
    notes: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    updates = ["updated_at = ?"]
    params = [now]

    if status is not None:
        updates.append("status = ?")
        params.append(status)
    if expiration_date is not None:
        updates.append("expiration_date = ?")
        params.append(expiration_date)
    if deposit is not None:
        updates.append("deposit = ?")
        params.append(deposit)
    if notes is not None:
        updates.append("notes = ?")
        params.append(notes)

    params.append(reservation_id)

    cur.execute(
        f"UPDATE reservations SET {', '.join(updates)} WHERE id = ?",
        params,
    )
    conn.commit()
    conn.close()

    return get_reservation_by_id(reservation_id)


def get_expired_reservations() -> List[Dict[str, Any]]:
    """Récupère les réservations actives dont la date d'expiration est dépassée"""
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    cur.execute(
        """
        SELECT * FROM reservations
        WHERE status = 'active' AND expiration_date < ?
        """,
        (now,),
    )
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============================================================
# SALES
# ============================================================
def create_sale(
    project_id: int,
    lot_id: int,
    client_id: int,
    price: float,
    reservation_id: Optional[int] = None,
    sold_by_user_id: Optional[int] = None,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    cur.execute(
        """
        INSERT INTO sales (project_id, lot_id, client_id, reservation_id, sold_by_user_id, sale_date, price, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (project_id, lot_id, client_id, reservation_id, sold_by_user_id, now, price, notes, now),
    )
    sale_id = cur.lastrowid
    conn.commit()
    conn.close()

    return get_sale_by_id(sale_id)


def get_sale_by_id(sale_id: int) -> Optional[Dict[str, Any]]:
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM sales WHERE id = ?", (sale_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_sales(
    lot_id: Optional[int] = None,
    client_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    conn = connect()
    cur = conn.cursor()

    query = "SELECT * FROM sales WHERE 1=1"
    params = []

    if lot_id:
        query += " AND lot_id = ?"
        params.append(lot_id)
    if client_id:
        query += " AND client_id = ?"
        params.append(client_id)

    query += " ORDER BY created_at DESC"

    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============================================================
# LEGACY - Compatibilité avec l'ancien système
# ============================================================
def upsert_lot_status(
    lot_id: str,
    status: str,
    reserved_by: Optional[str] = None,
    reserved_until: Optional[str] = None,
) -> None:
    """
    Crée ou met à jour le statut d'un lot (ancienne méthode pour compatibilité)
    """
    conn = connect()
    cur = conn.cursor()
    updated_at = datetime.now(timezone.utc).isoformat()

    cur.execute(
        """
        INSERT INTO lots_status (lot_id, status, reserved_by, reserved_until, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(lot_id) DO UPDATE SET
            status=excluded.status,
            reserved_by=excluded.reserved_by,
            reserved_until=excluded.reserved_until,
            updated_at=excluded.updated_at
        """,
        (lot_id, status, reserved_by, reserved_until, updated_at),
    )

    conn.commit()
    conn.close()


def get_lot_status(lot_id: str) -> Optional[Dict[str, Any]]:
    """
    Retourne le statut d'un lot ou None (ancienne méthode pour compatibilité)
    """
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM lots_status WHERE lot_id = ?", (lot_id,))
    row = cur.fetchone()
    conn.close()

    return dict(row) if row else None


def get_all_statuses() -> Dict[str, Dict[str, Any]]:
    """
    Retourne tous les statuts sous forme dict {lot_id: {...}} (ancienne méthode pour compatibilité)
    """
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM lots_status")
    rows = cur.fetchall()
    conn.close()

    return {row["lot_id"]: dict(row) for row in rows}


# ============================================================
# AUDIT LOGS
# ============================================================
def create_audit_log(
    entity_type: str,
    entity_id: str,
    action: str,
    user_id: Optional[str] = None,
    old_data: Optional[Dict[str, Any]] = None,
    new_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    import json
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    cur.execute(
        """
        INSERT INTO audit_logs (entity_type, entity_id, action, user_id, old_data, new_data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            entity_type,
            entity_id,
            action,
            user_id,
            json.dumps(old_data) if old_data else None,
            json.dumps(new_data) if new_data else None,
            now
        ),
    )
    log_id = cur.lastrowid
    conn.commit()
    conn.close()

    return get_audit_log_by_id(log_id)


def get_audit_log_by_id(log_id: int) -> Optional[Dict[str, Any]]:
    import json
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM audit_logs WHERE id = ?", (log_id,))
    row = cur.fetchone()
    conn.close()

    if row:
        result = dict(row)
        if result.get("old_data"):
            result["old_data"] = json.loads(result["old_data"])
        if result.get("new_data"):
            result["new_data"] = json.loads(result["new_data"])
        return result
    return None


def get_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    import json
    conn = connect()
    cur = conn.cursor()

    query = "SELECT * FROM audit_logs WHERE 1=1"
    params = []

    if entity_type:
        query += " AND entity_type = ?"
        params.append(entity_type)
    if entity_id:
        query += " AND entity_id = ?"
        params.append(entity_id)
    if action:
        query += " AND action = ?"
        params.append(action)

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()

    results = []
    for row in rows:
        result = dict(row)
        if result.get("old_data"):
            result["old_data"] = json.loads(result["old_data"])
        if result.get("new_data"):
            result["new_data"] = json.loads(result["new_data"])
        results.append(result)

    return results


# ============================================================
# USERS
# ============================================================
def create_user(
    email: str,
    password_hash: str,
    name: str,
    role: str
) -> Dict[str, Any]:
    """Crée un nouvel utilisateur"""
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    cur.execute(
        """
        INSERT INTO users (email, password_hash, name, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (email, password_hash, name, role, now, now),
    )
    user_id = cur.lastrowid
    conn.commit()
    conn.close()

    return get_user_by_id(user_id)


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """Récupère un utilisateur par son ID"""
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Récupère un utilisateur par son email"""
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = ?", (email,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_users(role: Optional[str] = None) -> List[Dict[str, Any]]:
    """Récupère tous les utilisateurs, optionnellement filtrés par rôle"""
    conn = connect()
    cur = conn.cursor()

    if role:
        cur.execute("SELECT * FROM users WHERE role = ? ORDER BY created_at DESC", (role,))
    else:
        cur.execute("SELECT * FROM users ORDER BY created_at DESC")

    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def update_user(
    user_id: int,
    name: Optional[str] = None,
    email: Optional[str] = None,
    role: Optional[str] = None,
    password_hash: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Met à jour un utilisateur"""
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    updates = ["updated_at = ?"]
    params = [now]

    if name is not None:
        updates.append("name = ?")
        params.append(name)
    if email is not None:
        updates.append("email = ?")
        params.append(email)
    if role is not None:
        updates.append("role = ?")
        params.append(role)
    if password_hash is not None:
        updates.append("password_hash = ?")
        params.append(password_hash)

    params.append(user_id)

    cur.execute(
        f"UPDATE users SET {', '.join(updates)} WHERE id = ?",
        params,
    )
    conn.commit()
    conn.close()

    return get_user_by_id(user_id)


def delete_user(user_id: int) -> bool:
    """Supprime un utilisateur"""
    conn = connect()
    cur = conn.cursor()
    cur.execute("DELETE FROM users WHERE id = ?", (user_id,))
    deleted = cur.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ============================================================
# PROJECTS
# ============================================================
def create_project(
    name: str,
    created_by: int,
    description: Optional[str] = None,
    visibility: str = "private",
    ca_objectif: Optional[float] = None
) -> Dict[str, Any]:
    """Crée un nouveau projet"""
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    cur.execute(
        """
        INSERT INTO projects (name, description, visibility, ca_objectif, created_by, total_lots, sold_lots, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
        """,
        (name, description, visibility, ca_objectif, created_by, now, now),
    )
    project_id = cur.lastrowid
    conn.commit()
    conn.close()

    return get_project_by_id(project_id)


def get_project_by_id(project_id: int) -> Optional[Dict[str, Any]]:
    """Récupère un projet par son ID"""
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_projects(
    visibility: Optional[str] = None,
    created_by: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Récupère tous les projets avec filtres optionnels"""
    conn = connect()
    cur = conn.cursor()

    query = "SELECT * FROM projects WHERE 1=1"
    params = []

    if visibility:
        query += " AND visibility = ?"
        params.append(visibility)
    if created_by:
        query += " AND created_by = ?"
        params.append(created_by)

    query += " ORDER BY created_at DESC"

    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def update_project(
    project_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    visibility: Optional[str] = None,
    ca_objectif: Optional[float] = None,
    total_lots: Optional[int] = None,
    sold_lots: Optional[int] = None
) -> Optional[Dict[str, Any]]:
    """Met à jour un projet"""
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    updates = ["updated_at = ?"]
    params = [now]

    if name is not None:
        updates.append("name = ?")
        params.append(name)
    if description is not None:
        updates.append("description = ?")
        params.append(description)
    if visibility is not None:
        updates.append("visibility = ?")
        params.append(visibility)
    if ca_objectif is not None:
        updates.append("ca_objectif = ?")
        params.append(ca_objectif)
    if total_lots is not None:
        updates.append("total_lots = ?")
        params.append(total_lots)
    if sold_lots is not None:
        updates.append("sold_lots = ?")
        params.append(sold_lots)

    params.append(project_id)

    cur.execute(
        f"UPDATE projects SET {', '.join(updates)} WHERE id = ?",
        params,
    )
    conn.commit()
    conn.close()

    return get_project_by_id(project_id)


def delete_project(project_id: int) -> bool:
    """Supprime un projet"""
    conn = connect()
    cur = conn.cursor()
    cur.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    deleted = cur.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ============================================================
# ASSIGNMENTS
# ============================================================
def create_assignment(
    user_id: int,
    project_id: int,
    assigned_by: int
) -> Dict[str, Any]:
    """Assigne un commercial à un projet"""
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    cur.execute(
        """
        INSERT INTO assignments (user_id, project_id, assigned_at, assigned_by)
        VALUES (?, ?, ?, ?)
        """,
        (user_id, project_id, now, assigned_by),
    )
    assignment_id = cur.lastrowid
    conn.commit()
    conn.close()

    # Retourne l'assignment avec détails
    return get_assignment_by_id(assignment_id)


def get_assignment_by_id(assignment_id: int) -> Optional[Dict[str, Any]]:
    """Récupère une assignation par son ID"""
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM assignments WHERE id = ?", (assignment_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_assignments(
    user_id: Optional[int] = None,
    project_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Récupère les assignations avec filtres optionnels"""
    conn = connect()
    cur = conn.cursor()

    query = "SELECT * FROM assignments WHERE 1=1"
    params = []

    if user_id:
        query += " AND user_id = ?"
        params.append(user_id)
    if project_id:
        query += " AND project_id = ?"
        params.append(project_id)

    query += " ORDER BY assigned_at DESC"

    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def delete_assignment(user_id: int, project_id: int) -> bool:
    """Supprime une assignation"""
    conn = connect()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM assignments WHERE user_id = ? AND project_id = ?",
        (user_id, project_id)
    )
    deleted = cur.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def get_user_projects(user_id: int) -> List[Dict[str, Any]]:
    """Récupère tous les projets assignés à un utilisateur"""
    conn = connect()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT p.*, a.assigned_at
        FROM projects p
        JOIN assignments a ON p.id = a.project_id
        WHERE a.user_id = ?
        ORDER BY p.created_at DESC
        """,
        (user_id,)
    )

    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_project_users(project_id: int) -> List[Dict[str, Any]]:
    """Récupère tous les utilisateurs assignés à un projet"""
    conn = connect()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT u.*, a.assigned_at, a.assigned_by
        FROM users u
        JOIN assignments a ON u.id = a.user_id
        WHERE a.project_id = ?
        ORDER BY a.assigned_at DESC
        """,
        (project_id,)
    )

    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============================================================
# DASHBOARD STATISTICS
# ============================================================
def get_dashboard_stats(project_id: Optional[int] = None, user_id: Optional[int] = None) -> Dict[str, Any]:
    """Retourne les statistiques complètes pour le dashboard

    Args:
        project_id: Filtre optionnel par projet
        user_id: Filtre optionnel par utilisateur (commercial)
    """
    conn = connect()
    cur = conn.cursor()

    # Construire les conditions WHERE
    where_conditions = []
    params = []

    if project_id is not None:
        where_conditions.append("l.project_id = ?")
        params.append(project_id)

    if user_id is not None:
        # Filtrer par lots assignés à un commercial via les projets
        where_conditions.append("""
            l.project_id IN (
                SELECT project_id FROM assignments WHERE user_id = ?
            )
        """)
        params.append(user_id)

    where_clause = f"WHERE {' AND '.join(where_conditions)}" if where_conditions else ""

    # Comptages par statut
    cur.execute(f"""
        SELECT
            COUNT(*) as total,
            COALESCE(SUM(CASE WHEN l.status = 'available' THEN 1 ELSE 0 END), 0) as available,
            COALESCE(SUM(CASE WHEN l.status = 'reserved' THEN 1 ELSE 0 END), 0) as reserved,
            COALESCE(SUM(CASE WHEN l.status = 'sold' THEN 1 ELSE 0 END), 0) as sold,
            COALESCE(SUM(CASE WHEN l.status = 'blocked' THEN 1 ELSE 0 END), 0) as blocked
        FROM lots l
        {where_clause}
    """, params)
    counts = dict(cur.fetchone())

    # CA réalisé (ventes)
    sales_where = where_clause.replace("l.", "s.")
    cur.execute(f"""
        SELECT COALESCE(SUM(s.price), 0) as ca_realise
        FROM sales s
        {sales_where}
    """, params)
    ca_realise = cur.fetchone()["ca_realise"]

    # CA potentiel (lots disponibles + réservés)
    cur.execute(f"""
        SELECT COALESCE(SUM(l.price), 0) as ca_potentiel
        FROM lots l
        {where_clause}
        {'AND' if where_clause else 'WHERE'} l.status IN ('available', 'reserved') AND l.price IS NOT NULL
    """, params)
    ca_potentiel = cur.fetchone()["ca_potentiel"]

    # Taux de vente
    total = counts["total"] or 1
    taux_vente = round((counts["sold"] / total) * 100, 1) if total > 0 else 0

    # Taux de transformation (ventes / réservations créées)
    reservations_where = where_clause.replace("l.", "r.")
    cur.execute(f"""
        SELECT COUNT(*) as total_reservations
        FROM reservations r
        {reservations_where}
    """, params)
    total_reservations = cur.fetchone()["total_reservations"]

    cur.execute(f"""
        SELECT COUNT(*) as converted
        FROM reservations r
        {reservations_where}
        {'AND' if reservations_where else 'WHERE'} r.status = 'converted'
    """, params)
    converted = cur.fetchone()["converted"]

    taux_transformation = round((converted / total_reservations) * 100, 1) if total_reservations > 0 else 0

    conn.close()

    return {
        "counts": counts,
        "ca_realise": ca_realise,
        "ca_potentiel": ca_potentiel,
        "taux_vente": taux_vente,
        "taux_transformation": taux_transformation,
        "percentages": {
            "available": round((counts["available"] / total) * 100, 1) if total > 0 else 0,
            "reserved": round((counts["reserved"] / total) * 100, 1) if total > 0 else 0,
            "sold": round((counts["sold"] / total) * 100, 1) if total > 0 else 0,
            "blocked": round((counts["blocked"] / total) * 100, 1) if total > 0 else 0,
        }
    }


def get_lots_with_details(project_id: Optional[int] = None, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Retourne tous les lots avec les détails de réservation/client

    Args:
        project_id: Filtre optionnel par projet
        user_id: Filtre optionnel par utilisateur (commercial)
    """
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    # Construire les conditions WHERE
    where_conditions = []
    params = [now]

    if project_id is not None:
        where_conditions.append("l.project_id = ?")
        params.append(project_id)

    if user_id is not None:
        where_conditions.append("""
            l.project_id IN (
                SELECT project_id FROM assignments WHERE user_id = ?
            )
        """)
        params.append(user_id)

    where_clause = f"WHERE {' AND '.join(where_conditions)}" if where_conditions else ""

    cur.execute(f"""
        SELECT
            l.*,
            r.id as reservation_id,
            r.client_id,
            r.reservation_date,
            r.expiration_date,
            r.deposit,
            r.status as reservation_status,
            c.name as client_name,
            c.phone as client_phone,
            julianday(?) - julianday(l.updated_at) as days_in_status
        FROM lots l
        LEFT JOIN reservations r ON l.current_reservation_id = r.id AND r.status = 'active'
        LEFT JOIN clients c ON r.client_id = c.id
        {where_clause}
        ORDER BY
            CASE l.status
                WHEN 'available' THEN 1
                WHEN 'reserved' THEN 2
                WHEN 'blocked' THEN 3
                WHEN 'sold' THEN 4
            END,
            days_in_status DESC
    """, params)

    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_reservations_at_risk(days_threshold: int = 3, project_id: Optional[int] = None, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Retourne les réservations à risque (expirant bientôt ou expirées)

    Args:
        days_threshold: Nombre de jours avant expiration
        project_id: Filtre optionnel par projet
        user_id: Filtre optionnel par utilisateur (commercial)
    """
    conn = connect()
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    from datetime import timedelta
    threshold_date = (datetime.now(timezone.utc) + timedelta(days=days_threshold)).isoformat()

    # Construire les conditions WHERE supplémentaires
    where_conditions = ["r.status = 'active'", "r.expiration_date <= ?"]
    params = [now, now, threshold_date]

    if project_id is not None:
        where_conditions.append("l.project_id = ?")
        params.append(project_id)

    if user_id is not None:
        where_conditions.append("""
            l.project_id IN (
                SELECT project_id FROM assignments WHERE user_id = ?
            )
        """)
        params.append(user_id)

    where_clause = " AND ".join(where_conditions)

    cur.execute(f"""
        SELECT
            r.*,
            l.numero as lot_numero,
            l.price as lot_price,
            l.surface as lot_surface,
            c.name as client_name,
            c.phone as client_phone,
            c.email as client_email,
            CASE
                WHEN r.expiration_date < ? THEN 'expired'
                ELSE 'expiring_soon'
            END as risk_type,
            julianday(r.expiration_date) - julianday(?) as days_remaining
        FROM reservations r
        JOIN lots l ON r.lot_id = l.id
        JOIN clients c ON r.client_id = c.id
        WHERE {where_clause}
        ORDER BY r.expiration_date ASC
    """, params)

    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_sales_by_period(period: str = "month", project_id: Optional[int] = None, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Retourne les ventes groupées par période

    Args:
        period: Période de groupage (day, week, month)
        project_id: Filtre optionnel par projet
        user_id: Filtre optionnel par utilisateur (commercial)
    """
    conn = connect()
    cur = conn.cursor()

    if period == "week":
        date_format = "%Y-%W"
    elif period == "day":
        date_format = "%Y-%m-%d"
    else:  # month
        date_format = "%Y-%m"

    # Construire les conditions WHERE
    where_conditions = []
    params = []

    if project_id is not None:
        where_conditions.append("s.project_id = ?")
        params.append(project_id)

    if user_id is not None:
        where_conditions.append("""
            s.project_id IN (
                SELECT project_id FROM assignments WHERE user_id = ?
            )
        """)
        params.append(user_id)

    where_clause = f"WHERE {' AND '.join(where_conditions)}" if where_conditions else ""

    cur.execute(f"""
        SELECT
            strftime('{date_format}', s.sale_date) as period,
            COUNT(*) as count,
            SUM(s.price) as total_amount
        FROM sales s
        {where_clause}
        GROUP BY strftime('{date_format}', s.sale_date)
        ORDER BY period DESC
        LIMIT 12
    """, params)

    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_reservations_vs_sales_by_period(period: str = "month", project_id: Optional[int] = None, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Retourne les réservations vs ventes par période

    Args:
        period: Période de groupage (week, month)
        project_id: Filtre optionnel par projet
        user_id: Filtre optionnel par utilisateur (commercial)
    """
    conn = connect()
    cur = conn.cursor()

    if period == "week":
        date_format = "%Y-%W"
    else:  # month
        date_format = "%Y-%m"

    # Construire les conditions WHERE
    where_conditions = []
    params = []

    if project_id is not None:
        where_conditions.append("project_id = ?")
        params.append(project_id)

    if user_id is not None:
        where_conditions.append("""
            project_id IN (
                SELECT project_id FROM assignments WHERE user_id = ?
            )
        """)
        params.append(user_id)

    where_clause = f"WHERE {' AND '.join(where_conditions)}" if where_conditions else ""

    cur.execute(f"""
        SELECT
            period,
            SUM(reservations) as reservations,
            SUM(sales) as sales
        FROM (
            SELECT
                strftime('{date_format}', reservation_date) as period,
                1 as reservations,
                0 as sales,
                project_id
            FROM reservations
            UNION ALL
            SELECT
                strftime('{date_format}', sale_date) as period,
                0 as reservations,
                1 as sales,
                project_id
            FROM sales
        )
        {where_clause}
        GROUP BY period
        ORDER BY period DESC
        LIMIT 12
    """, params)

    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_clients_pipeline(project_id: Optional[int] = None, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Retourne le pipeline clients avec leurs statistiques

    Args:
        project_id: Filtre optionnel par projet
        user_id: Filtre optionnel par utilisateur (commercial)
    """
    conn = connect()
    cur = conn.cursor()

    # Construire les conditions WHERE
    where_conditions = []
    params = []

    if project_id is not None:
        where_conditions.append("(r.project_id = ? OR s.project_id = ?)")
        params.extend([project_id, project_id])

    if user_id is not None:
        where_conditions.append("""
            (r.project_id IN (SELECT project_id FROM assignments WHERE user_id = ?)
             OR s.project_id IN (SELECT project_id FROM assignments WHERE user_id = ?))
        """)
        params.extend([user_id, user_id])

    where_clause = f"AND ({' AND '.join(where_conditions)})" if where_conditions else ""

    cur.execute(f"""
        SELECT
            c.*,
            COUNT(DISTINCT CASE WHEN r.status = 'active' THEN r.id END) as active_reservations,
            COUNT(DISTINCT s.id) as total_sales,
            COALESCE(SUM(CASE WHEN r.status = 'active' THEN r.deposit END), 0) as total_deposit,
            COALESCE(SUM(s.price), 0) as total_purchases,
            MAX(COALESCE(r.reservation_date, s.sale_date)) as last_activity,
            CASE
                WHEN COUNT(DISTINCT s.id) > 0 THEN 'buyer'
                WHEN COUNT(DISTINCT CASE WHEN r.status = 'active' THEN r.id END) > 0 THEN 'active_reservation'
                WHEN COUNT(DISTINCT r.id) > 0 THEN 'past_reservation'
                ELSE 'prospect'
            END as pipeline_status
        FROM clients c
        LEFT JOIN reservations r ON c.id = r.client_id
        LEFT JOIN sales s ON c.id = s.client_id
        WHERE 1=1 {where_clause}
        GROUP BY c.id
        ORDER BY
            CASE
                WHEN COUNT(DISTINCT CASE WHEN r.status = 'active' THEN r.id END) > 0 THEN 1
                WHEN COUNT(DISTINCT s.id) > 0 THEN 2
                ELSE 3
            END,
            last_activity DESC
    """, params)

    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_average_durations(project_id: Optional[int] = None, user_id: Optional[int] = None) -> Dict[str, Any]:
    """Retourne les durées moyennes des différentes étapes

    Args:
        project_id: Filtre optionnel par projet
        user_id: Filtre optionnel par utilisateur (commercial)
    """
    conn = connect()
    cur = conn.cursor()

    # Construire les conditions WHERE
    where_conditions = []
    params = []

    if project_id is not None:
        where_conditions.append("l.project_id = ?")
        params.append(project_id)

    if user_id is not None:
        where_conditions.append("""
            l.project_id IN (
                SELECT project_id FROM assignments WHERE user_id = ?
            )
        """)
        params.append(user_id)

    where_clause = f"AND {' AND '.join(where_conditions)}" if where_conditions else ""

    # Durée moyenne disponible -> réservé
    cur.execute(f"""
        SELECT AVG(julianday(r.reservation_date) - julianday(l.created_at)) as avg_days
        FROM reservations r
        JOIN lots l ON r.lot_id = l.id
        WHERE r.reservation_date IS NOT NULL {where_clause}
    """, params)
    row = cur.fetchone()
    available_to_reserved = round(row["avg_days"], 1) if row["avg_days"] else 0

    # Durée moyenne réservé -> vendu
    cur.execute(f"""
        SELECT AVG(julianday(s.sale_date) - julianday(r.reservation_date)) as avg_days
        FROM sales s
        JOIN reservations r ON s.reservation_id = r.id
        JOIN lots l ON r.lot_id = l.id
        WHERE s.reservation_id IS NOT NULL {where_clause}
    """, params)
    row = cur.fetchone()
    reserved_to_sold = round(row["avg_days"], 1) if row["avg_days"] else 0

    conn.close()

    return {
        "available_to_reserved": available_to_reserved,
        "reserved_to_sold": reserved_to_sold
    }


def get_project_history(
    project_id: int,
    limit: int = 50,
    user_id: int = None,
    date_from: str = None,
    date_to: str = None
) -> List[Dict[str, Any]]:
    """Retourne l'historique des actions sur un projet

    Combine les réservations, ventes et modifications de lots
    pour créer un historique chronologique.

    Args:
        project_id: ID du projet
        limit: Nombre maximum d'entrées à retourner
        user_id: Filtrer par ID utilisateur (pour les commerciaux)
        date_from: Date de début (format YYYY-MM-DD)
        date_to: Date de fin (format YYYY-MM-DD)
    """
    conn = connect()
    cur = conn.cursor()

    # Construire les conditions WHERE supplémentaires
    extra_conditions_r = ""
    extra_conditions_s = ""
    params_r = [project_id]
    params_s = [project_id]

    if user_id:
        extra_conditions_r += " AND r.reserved_by_user_id = ?"
        extra_conditions_s += " AND s.sold_by_user_id = ?"
        params_r.append(user_id)
        params_s.append(user_id)

    if date_from:
        extra_conditions_r += " AND DATE(r.created_at) >= ?"
        extra_conditions_s += " AND DATE(s.created_at) >= ?"
        params_r.append(date_from)
        params_s.append(date_from)

    if date_to:
        extra_conditions_r += " AND DATE(r.created_at) <= ?"
        extra_conditions_s += " AND DATE(s.created_at) <= ?"
        params_r.append(date_to)
        params_s.append(date_to)

    # Récupérer les réservations avec info utilisateur et client
    cur.execute(f"""
        SELECT
            r.id,
            'reservation' as type,
            CASE r.status
                WHEN 'active' THEN 'reserve'
                WHEN 'converted' THEN 'sell'
                WHEN 'released' THEN 'cancel'
                WHEN 'expired' THEN 'expire'
                ELSE 'reserve'
            END as action,
            r.created_at,
            r.lot_id,
            l.numero as lot_numero,
            c.name as client_name,
            u.name as user_name,
            u.id as user_id,
            r.deposit,
            r.status as reservation_status
        FROM reservations r
        JOIN lots l ON r.lot_id = l.id
        LEFT JOIN clients c ON r.client_id = c.id
        LEFT JOIN users u ON r.reserved_by_user_id = u.id
        WHERE r.project_id = ?{extra_conditions_r}
    """, params_r)
    reservations = [dict(row) for row in cur.fetchall()]

    # Récupérer les ventes avec info utilisateur et client
    cur.execute(f"""
        SELECT
            s.id,
            'sale' as type,
            'sell' as action,
            s.created_at,
            s.lot_id,
            l.numero as lot_numero,
            c.name as client_name,
            u.name as user_name,
            u.id as user_id,
            s.price
        FROM sales s
        JOIN lots l ON s.lot_id = l.id
        LEFT JOIN clients c ON s.client_id = c.id
        LEFT JOIN users u ON s.sold_by_user_id = u.id
        WHERE s.project_id = ?{extra_conditions_s}
    """, params_s)
    sales = [dict(row) for row in cur.fetchall()]

    conn.close()

    # Combiner et formater les résultats
    history = []

    for r in reservations:
        action = r['action']
        if action == 'reserve':
            description = f"Réservation du lot {r['lot_numero']}"
            if r['client_name']:
                description += f" pour {r['client_name']}"
            if r['deposit']:
                description += f" (acompte: {r['deposit']} MAD)"
        elif action == 'sell':
            description = f"Conversion de réservation en vente - Lot {r['lot_numero']}"
        elif action == 'cancel':
            description = f"Annulation de la réservation du lot {r['lot_numero']}"
        elif action == 'expire':
            description = f"Expiration de la réservation du lot {r['lot_numero']}"
        else:
            description = f"Action sur le lot {r['lot_numero']}"

        history.append({
            'id': f"r_{r['id']}",
            'action': action,
            'description': description,
            'user_name': r['user_name'] or 'Système',
            'user_id': r['user_id'],
            'created_at': r['created_at'],
            'lot_numero': r['lot_numero'],
            'client_name': r['client_name']
        })

    for s in sales:
        description = f"Vente du lot {s['lot_numero']}"
        if s['client_name']:
            description += f" à {s['client_name']}"
        if s['price']:
            description += f" pour {s['price']:,.0f} MAD"

        history.append({
            'id': f"s_{s['id']}",
            'action': 'sell',
            'description': description,
            'user_name': s['user_name'] or 'Système',
            'user_id': s['user_id'],
            'created_at': s['created_at'],
            'lot_numero': s['lot_numero'],
            'client_name': s['client_name']
        })

    # Trier par date décroissante
    history.sort(key=lambda x: x['created_at'], reverse=True)

    return history[:limit]


def get_project_kpis(project_id: int) -> Dict[str, Any]:
    """Retourne les KPIs spécifiques à un projet

    Args:
        project_id: ID du projet
    """
    from datetime import datetime, timedelta

    conn = connect()
    cur = conn.cursor()

    # Comptages des lots par statut et surfaces
    cur.execute("""
        SELECT
            COUNT(*) as total_lots,
            COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) as lots_disponibles,
            COALESCE(SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END), 0) as lots_reserves,
            COALESCE(SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END), 0) as lots_vendus,
            COALESCE(SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END), 0) as lots_bloques,
            COALESCE(SUM(surface), 0) as surface_totale,
            COALESCE(SUM(CASE WHEN status = 'available' THEN surface ELSE 0 END), 0) as surface_disponible,
            COALESCE(SUM(CASE WHEN status = 'reserved' THEN surface ELSE 0 END), 0) as surface_reservee,
            COALESCE(SUM(CASE WHEN status = 'sold' THEN surface ELSE 0 END), 0) as surface_vendue
        FROM lots
        WHERE project_id = ?
    """, (project_id,))
    counts = dict(cur.fetchone())

    # CA réalisé (ventes du projet)
    cur.execute("""
        SELECT COALESCE(SUM(price), 0) as ca_realise
        FROM sales
        WHERE project_id = ?
    """, (project_id,))
    ca_realise = cur.fetchone()["ca_realise"]

    # CA potentiel (lots disponibles + réservés avec prix)
    cur.execute("""
        SELECT COALESCE(SUM(price), 0) as ca_potentiel
        FROM lots
        WHERE project_id = ? AND status IN ('available', 'reserved') AND price IS NOT NULL
    """, (project_id,))
    ca_potentiel = cur.fetchone()["ca_potentiel"]

    # Taux de vente et taux de réservation
    total = counts["total_lots"] or 1
    taux_vente = round((counts["lots_vendus"] / total) * 100, 1) if total > 0 else 0
    taux_reservation = round((counts["lots_reserves"] / total) * 100, 1) if total > 0 else 0

    # Prix moyen par lot vendu
    prix_moyen_lot = round(ca_realise / counts["lots_vendus"], 2) if counts["lots_vendus"] > 0 else 0

    # Prix moyen au m²
    surface_vendue = counts["surface_vendue"] or 0
    prix_moyen_m2 = round(ca_realise / surface_vendue, 2) if surface_vendue > 0 else 0

    # Réservations actives
    cur.execute("""
        SELECT COUNT(*) as active_reservations
        FROM reservations
        WHERE project_id = ? AND status = 'active'
    """, (project_id,))
    active_reservations = cur.fetchone()["active_reservations"]

    # Total acomptes
    cur.execute("""
        SELECT COALESCE(SUM(deposit), 0) as total_deposits
        FROM reservations
        WHERE project_id = ? AND status = 'active'
    """, (project_id,))
    total_deposits = cur.fetchone()["total_deposits"]

    # Taux de conversion (réservations converties / total réservations terminées)
    cur.execute("""
        SELECT
            COUNT(*) as total_reservations,
            COALESCE(SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END), 0) as converted
        FROM reservations
        WHERE project_id = ? AND status IN ('converted', 'expired', 'released')
    """, (project_id,))
    res_stats = dict(cur.fetchone())
    taux_conversion = round((res_stats["converted"] / res_stats["total_reservations"]) * 100, 1) if res_stats["total_reservations"] > 0 else 0

    # Ventes et CA du mois en cours
    now = datetime.now()
    debut_mois = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    cur.execute("""
        SELECT
            COUNT(*) as ventes_mois,
            COALESCE(SUM(price), 0) as ca_mois
        FROM sales
        WHERE project_id = ? AND sale_date >= ?
    """, (project_id, debut_mois.isoformat()))
    mois_actuel = dict(cur.fetchone())

    # Ventes et CA du mois précédent (pour la tendance)
    debut_mois_precedent = (debut_mois - timedelta(days=1)).replace(day=1)
    fin_mois_precedent = debut_mois - timedelta(seconds=1)
    cur.execute("""
        SELECT
            COUNT(*) as ventes_mois,
            COALESCE(SUM(price), 0) as ca_mois
        FROM sales
        WHERE project_id = ? AND sale_date >= ? AND sale_date <= ?
    """, (project_id, debut_mois_precedent.isoformat(), fin_mois_precedent.isoformat()))
    mois_precedent = dict(cur.fetchone())

    # Calcul de la tendance
    if mois_precedent["ventes_mois"] > 0:
        tendance_ventes = round(((mois_actuel["ventes_mois"] - mois_precedent["ventes_mois"]) / mois_precedent["ventes_mois"]) * 100, 1)
    else:
        tendance_ventes = 100 if mois_actuel["ventes_mois"] > 0 else 0

    if mois_precedent["ca_mois"] > 0:
        tendance_ca = round(((mois_actuel["ca_mois"] - mois_precedent["ca_mois"]) / mois_precedent["ca_mois"]) * 100, 1)
    else:
        tendance_ca = 100 if mois_actuel["ca_mois"] > 0 else 0

    # Récupérer l'objectif CA du projet
    cur.execute("SELECT ca_objectif FROM projects WHERE id = ?", (project_id,))
    project_row = cur.fetchone()
    ca_objectif = project_row["ca_objectif"] if project_row and project_row["ca_objectif"] else 0

    # Progression CA (% de l'objectif atteint)
    progression_ca = round((ca_realise / ca_objectif) * 100, 1) if ca_objectif > 0 else 0

    conn.close()

    return {
        # Stock
        "total_lots": counts["total_lots"],
        "lots_disponibles": counts["lots_disponibles"],
        "lots_reserves": counts["lots_reserves"],
        "lots_vendus": counts["lots_vendus"],
        "lots_bloques": counts["lots_bloques"],
        # Surfaces
        "surface_totale": round(counts["surface_totale"], 2),
        "surface_disponible": round(counts["surface_disponible"], 2),
        "surface_reservee": round(counts["surface_reservee"], 2),
        "surface_vendue": round(counts["surface_vendue"], 2),
        # Financiers
        "ca_realise": ca_realise,
        "ca_potentiel": ca_potentiel,
        "ca_objectif": ca_objectif,
        "progression_ca": progression_ca,
        "prix_moyen_lot": prix_moyen_lot,
        "prix_moyen_m2": prix_moyen_m2,
        # Taux
        "taux_vente": taux_vente,
        "taux_reservation": taux_reservation,
        "taux_conversion": taux_conversion,
        # Réservations
        "active_reservations": active_reservations,
        "total_deposits": total_deposits,
        # Mensuel
        "ventes_mois": mois_actuel["ventes_mois"],
        "ca_mois": mois_actuel["ca_mois"],
        "tendance_ventes": tendance_ventes,
        "tendance_ca": tendance_ca
    }


def get_project_performance(project_id: int) -> Dict[str, Any]:
    """Retourne les performances commerciales d'un projet

    Args:
        project_id: ID du projet
    """
    conn = connect()
    cur = conn.cursor()

    # Performance par commercial sur ce projet
    cur.execute("""
        SELECT
            u.id as user_id,
            u.name,
            u.email,
            COUNT(DISTINCT s.id) as ventes_count,
            COALESCE(SUM(s.price), 0) as ca_realise
        FROM users u
        JOIN assignments a ON u.id = a.user_id AND a.project_id = ?
        LEFT JOIN sales s ON s.sold_by_user_id = u.id AND s.project_id = ?
        WHERE u.role = 'commercial'
        GROUP BY u.id, u.name, u.email
        ORDER BY ca_realise DESC
    """, (project_id, project_id))
    commercials = [dict(row) for row in cur.fetchall()]

    # Ajouter le taux de transformation pour chaque commercial
    for commercial in commercials:
        cur.execute("""
            SELECT
                COUNT(*) as total_reservations,
                SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted
            FROM reservations
            WHERE project_id = ? AND reserved_by_user_id = ?
        """, (project_id, commercial['user_id']))
        res = dict(cur.fetchone())
        total_res = res['total_reservations'] or 0
        converted = res['converted'] or 0
        commercial['reservations_count'] = total_res
        commercial['taux_transformation'] = round((converted / total_res) * 100, 1) if total_res > 0 else 0

    conn.close()

    return {
        "commercials": commercials
    }


def get_commercials_performance(project_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Retourne les performances de chaque commercial

    Pour chaque commercial, retourne :
    - Nombre de ventes réalisées
    - CA total réalisé
    - Nombre de réservations créées
    - Taux de transformation (ventes / réservations)
    - CA moyen par vente

    Args:
        project_id: Filtre optionnel par projet
    """
    conn = connect()
    cur = conn.cursor()

    # Construire les conditions WHERE
    sales_where = ""
    reservations_where = ""
    params_sales = []
    params_reservations = []

    if project_id is not None:
        sales_where = "AND s.project_id = ?"
        params_sales.append(project_id)
        reservations_where = "AND r.project_id = ?"
        params_reservations.append(project_id)

    # Récupérer tous les commerciaux
    cur.execute("SELECT id, name, email FROM users WHERE role = 'commercial' ORDER BY name")
    commercials = [dict(row) for row in cur.fetchall()]

    results = []

    for commercial in commercials:
        user_id = commercial["id"]

        # Ventes réalisées par ce commercial
        cur.execute(f"""
            SELECT
                COUNT(*) as total_sales,
                COALESCE(SUM(s.price), 0) as ca_total
            FROM sales s
            WHERE s.sold_by_user_id = ? {sales_where}
        """, [user_id] + params_sales)
        sales_data = dict(cur.fetchone())

        # Réservations créées par ce commercial
        cur.execute(f"""
            SELECT COUNT(*) as total_reservations
            FROM reservations r
            WHERE r.reserved_by_user_id = ? {reservations_where}
        """, [user_id] + params_reservations)
        reservations_data = dict(cur.fetchone())

        # Réservations converties en ventes par ce commercial
        cur.execute(f"""
            SELECT COUNT(*) as converted
            FROM reservations r
            WHERE r.reserved_by_user_id = ? AND r.status = 'converted' {reservations_where}
        """, [user_id] + params_reservations)
        converted_data = dict(cur.fetchone())

        total_sales = sales_data["total_sales"] or 0
        ca_total = sales_data["ca_total"] or 0
        total_reservations = reservations_data["total_reservations"] or 0
        converted = converted_data["converted"] or 0

        # Calculer le taux de transformation
        taux_transformation = round((converted / total_reservations) * 100, 1) if total_reservations > 0 else 0

        # CA moyen par vente
        ca_moyen = round(ca_total / total_sales, 2) if total_sales > 0 else 0

        results.append({
            "user_id": user_id,
            "name": commercial["name"],
            "email": commercial["email"],
            "total_sales": total_sales,
            "ca_total": ca_total,
            "total_reservations": total_reservations,
            "converted_reservations": converted,
            "taux_transformation": taux_transformation,
            "ca_moyen": ca_moyen
        })

    conn.close()

    # Trier par CA total décroissant
    results.sort(key=lambda x: x["ca_total"], reverse=True)

    return results
