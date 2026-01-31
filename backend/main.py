import json
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Literal, List

from fastapi import FastAPI, HTTPException, Query, Depends, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
import jwt
import bcrypt

from db import (
    init_db,
    # Users
    create_user as db_create_user,
    get_user_by_id,
    get_user_by_email,
    get_users as db_get_users,
    update_user as db_update_user,
    delete_user as db_delete_user,
    # Projects
    create_project as db_create_project,
    get_project_by_id,
    get_projects as db_get_projects,
    update_project as db_update_project,
    delete_project as db_delete_project,
    # Assignments
    create_assignment as db_create_assignment,
    get_assignments as db_get_assignments,
    delete_assignment as db_delete_assignment,
    get_user_projects,
    get_project_users,
    # Lots
    create_lot as db_create_lot,
    get_lot_by_id,
    get_lot_by_numero,
    get_lots as db_get_lots,
    update_lot as db_update_lot,
    delete_lot as db_delete_lot,
    # Clients
    create_client as db_create_client,
    get_client_by_id,
    get_clients as db_get_clients,
    update_client as db_update_client,
    get_client_details as db_get_client_details,
    # Reservations
    create_reservation as db_create_reservation,
    get_reservation_by_id,
    get_reservations as db_get_reservations,
    update_reservation as db_update_reservation,
    get_expired_reservations,
    # Sales
    create_sale as db_create_sale,
    get_sales as db_get_sales,
    # Audit logs
    create_audit_log as db_create_audit_log,
    get_audit_logs as db_get_audit_logs,
    # Dashboard
    get_dashboard_stats as db_get_dashboard_stats,
    get_lots_with_details as db_get_lots_with_details,
    get_reservations_at_risk as db_get_reservations_at_risk,
    get_sales_by_period as db_get_sales_by_period,
    get_reservations_vs_sales_by_period as db_get_reservations_vs_sales,
    get_clients_pipeline as db_get_clients_pipeline,
    get_average_durations as db_get_average_durations,
    get_commercials_performance as db_get_commercials_performance,
    # Project-specific
    get_project_kpis as db_get_project_kpis,
    get_project_performance as db_get_project_performance,
    get_project_history as db_get_project_history,
)

# ------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

# JWT Configuration
SECRET_KEY = "votre_secret_key_tres_securise_a_changer_en_production"  # TODO: Mettre dans variables d'environnement
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 heures

# Security
security = HTTPBearer()

LotStatus = Literal["available", "reserved", "sold", "blocked"]
ReservationStatus = Literal["active", "expired", "released", "converted"]
UserRole = Literal["manager", "commercial", "client"]

# ------------------------------------------------------------
# APP
# ------------------------------------------------------------
app = FastAPI(title="Lots API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------
# PYDANTIC MODELS
# ------------------------------------------------------------

# === Auth ===
class UserRegister(BaseModel):
    email: str = Field(..., description="Email de l'utilisateur")
    password: str = Field(..., min_length=6, description="Mot de passe (min 6 caractères)")
    name: str = Field(..., min_length=1, description="Nom complet")
    role: UserRole = Field(..., description="Rôle (manager, commercial, client)")


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    created_at: str
    updated_at: str


# === Projects ===
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, description="Nom du projet")
    description: Optional[str] = None
    visibility: Literal["public", "private"] = "private"
    ca_objectif: Optional[float] = Field(None, ge=0, description="Objectif de CA")


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    visibility: Optional[Literal["public", "private"]] = None
    ca_objectif: Optional[float] = Field(None, ge=0)


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    visibility: str
    total_lots: int
    sold_lots: int
    ca_objectif: Optional[float]
    created_by: int
    created_at: str
    updated_at: str


# === Assignments ===
class AssignmentCreate(BaseModel):
    user_id: int = Field(..., description="ID de l'utilisateur à assigner")
    project_id: int = Field(..., description="ID du projet")


class AssignmentResponse(BaseModel):
    id: int
    user_id: int
    project_id: int
    assigned_at: str
    assigned_by: int


# === Lots ===
class LotCreate(BaseModel):
    numero: str = Field(..., min_length=1, description="Numéro unique du lot")
    zone: Optional[str] = None
    surface: Optional[float] = Field(None, ge=0)
    price: Optional[float] = Field(None, ge=0)
    status: LotStatus = "available"


class LotUpdate(BaseModel):
    numero: Optional[str] = Field(None, min_length=1)
    zone: Optional[str] = None
    surface: Optional[float] = Field(None, ge=0)
    price: Optional[float] = Field(None, ge=0)
    status: Optional[LotStatus] = None


class LotResponse(BaseModel):
    id: int
    numero: str
    zone: Optional[str]
    surface: Optional[float]
    price: Optional[float]
    status: str
    current_reservation_id: Optional[int]
    created_at: str
    updated_at: str


# === Clients ===
ClientType = Literal["proprietaire", "revendeur", "investisseur", "autre"]


class ClientCreate(BaseModel):
    name: str = Field(..., min_length=1, description="Nom du client")
    phone: Optional[str] = None
    email: Optional[str] = None
    cin: Optional[str] = None
    client_type: ClientType = Field("autre", description="Type de client")
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    phone: Optional[str] = None
    email: Optional[str] = None
    cin: Optional[str] = None
    client_type: Optional[ClientType] = None
    notes: Optional[str] = None


class ClientResponse(BaseModel):
    id: int
    name: str
    phone: Optional[str]
    email: Optional[str]
    cin: Optional[str]
    client_type: Optional[str]
    notes: Optional[str]
    created_by_user_id: Optional[int]
    created_at: str
    updated_at: str


# === Reservations ===
class ReservationCreate(BaseModel):
    lot_id: int
    client_id: int
    reserved_by_user_id: Optional[str] = None
    expiration_date: Optional[str] = None  # ISO format, défaut +7 jours
    deposit: float = Field(0, ge=0, description="Acompte")
    notes: Optional[str] = None


class ReservationResponse(BaseModel):
    id: int
    lot_id: int
    client_id: int
    reserved_by_user_id: Optional[str]
    reservation_date: str
    expiration_date: str
    deposit: float
    notes: Optional[str]
    status: str
    created_at: str
    updated_at: str


# === Sales ===
class SaleCreate(BaseModel):
    lot_id: int
    client_id: int
    price: float = Field(..., ge=0)
    notes: Optional[str] = None


class SaleFromReservation(BaseModel):
    price: float = Field(..., ge=0)
    notes: Optional[str] = None


class SaleResponse(BaseModel):
    id: int
    lot_id: int
    client_id: int
    reservation_id: Optional[int]
    sale_date: str
    price: float
    notes: Optional[str]
    created_at: str


# ------------------------------------------------------------
# STARTUP
# ------------------------------------------------------------
@app.on_event("startup")
def startup() -> None:
    init_db()
    DATA_DIR.mkdir(parents=True, exist_ok=True)


# ------------------------------------------------------------
# AUTH HELPERS
# ------------------------------------------------------------
def hash_password(password: str) -> str:
    """Hash un mot de passe avec bcrypt"""
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe"""
    password_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)


def create_access_token(data: dict) -> str:
    """Crée un token JWT"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Décode un token JWT"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Token invalide")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """Récupère l'utilisateur courant depuis le token JWT"""
    token = credentials.credentials
    payload = decode_access_token(token)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalide")

    user = get_user_by_id(int(user_id))
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur non trouvé")

    return user


def require_role(*allowed_roles: str):
    """Décorateur pour vérifier le rôle de l'utilisateur"""
    async def role_checker(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Accès interdit. Rôles autorisés: {', '.join(allowed_roles)}"
            )
        return current_user
    return role_checker


# ------------------------------------------------------------
# ROUTES - Health
# ------------------------------------------------------------
@app.get("/health")
def health() -> Dict[str, bool]:
    return {"ok": True}


# ------------------------------------------------------------
# ROUTES - Authentication
# ------------------------------------------------------------
@app.post("/api/auth/register", response_model=UserResponse, status_code=201)
def register(body: UserRegister):
    """
    Inscription d'un nouvel utilisateur.

    Note: En production, l'inscription devrait être restreinte aux managers
    ou nécessiter une validation.
    """
    # Vérifier que l'email n'existe pas déjà
    existing = get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Cet email est déjà utilisé")

    # Hasher le mot de passe
    password_hash = hash_password(body.password)

    # Créer l'utilisateur
    user = db_create_user(
        email=body.email,
        password_hash=password_hash,
        name=body.name,
        role=body.role,
    )

    # Ne pas retourner le password_hash
    user_response = {k: v for k, v in user.items() if k != "password_hash"}
    return user_response


@app.post("/api/auth/login", response_model=TokenResponse)
def login(body: UserLogin):
    """
    Connexion d'un utilisateur.

    Retourne un token JWT valide pour 24h.
    """
    # Récupérer l'utilisateur par email
    user = get_user_by_email(body.email)
    if not user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    # Vérifier le mot de passe
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    # Créer le token
    access_token = create_access_token(data={"sub": str(user["id"]), "role": user["role"]})

    # Retourner le token et les infos utilisateur (sans password_hash)
    user_data = {k: v for k, v in user.items() if k != "password_hash"}

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_data,
    }


@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Récupère les informations de l'utilisateur connecté.
    """
    user_response = {k: v for k, v in current_user.items() if k != "password_hash"}
    return user_response


# ------------------------------------------------------------
# ROUTES - Projects API
# ------------------------------------------------------------
@app.get("/api/projects", response_model=List[ProjectResponse])
async def get_projects(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Liste des projets accessibles selon le rôle de l'utilisateur:
    - MANAGER: tous les projets
    - COMMERCIAL: projets assignés + projets publics
    - CLIENT: projets publics uniquement
    """
    role = current_user["role"]
    user_id = current_user["id"]

    if role == "manager":
        # Manager voit tous les projets
        projects = db_get_projects()
    elif role == "commercial":
        # Commercial voit ses projets assignés + les projets publics
        assigned_projects = get_user_projects(user_id)
        public_projects = db_get_projects(visibility="public")
        # Fusionner sans doublons
        project_ids = {p["id"] for p in assigned_projects}
        for p in public_projects:
            if p["id"] not in project_ids:
                assigned_projects.append(p)
        projects = assigned_projects
    else:  # client
        # Client voit uniquement les projets publics
        projects = db_get_projects(visibility="public")

    return projects


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Détail d'un projet"""
    project = get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    # Vérifier les permissions
    role = current_user["role"]
    user_id = current_user["id"]

    if role == "manager":
        # Manager a accès à tout
        pass
    elif role == "commercial":
        # Commercial doit être assigné au projet ou le projet doit être public
        user_projects = get_user_projects(user_id)
        project_ids = [p["id"] for p in user_projects]
        if project_id not in project_ids and project["visibility"] != "public":
            raise HTTPException(status_code=403, detail="Accès interdit à ce projet")
    else:  # client
        # Client ne peut voir que les projets publics
        if project["visibility"] != "public":
            raise HTTPException(status_code=403, detail="Accès interdit à ce projet")

    return project


# ------------------------------------------------------------
# ROUTES - Project KPIs, Performance, History
# ------------------------------------------------------------
@app.get("/api/projects/{project_id}/kpis")
async def get_project_kpis(
    project_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Retourne les KPIs d'un projet spécifique:
    - Total des lots et répartition par statut
    - CA réalisé et potentiel
    - Taux de vente
    - Réservations actives et acomptes
    """
    # Vérifier que le projet existe
    project = get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    # Vérifier les permissions
    role = current_user["role"]
    user_id = current_user["id"]

    if role == "manager":
        pass
    elif role == "commercial":
        user_projects = get_user_projects(user_id)
        project_ids = [p["id"] for p in user_projects]
        if project_id not in project_ids and project["visibility"] != "public":
            raise HTTPException(status_code=403, detail="Accès interdit à ce projet")
    else:
        if project["visibility"] != "public":
            raise HTTPException(status_code=403, detail="Accès interdit à ce projet")

    return db_get_project_kpis(project_id)


@app.get("/api/projects/{project_id}/performance")
async def get_project_performance(
    project_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Retourne les performances commerciales d'un projet:
    - Liste des commerciaux assignés avec leurs stats
    - Nombre de ventes et CA par commercial
    - Taux de transformation des réservations
    """
    # Vérifier que le projet existe
    project = get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    # Vérifier les permissions
    role = current_user["role"]
    user_id = current_user["id"]

    if role == "manager":
        pass
    elif role == "commercial":
        user_projects = get_user_projects(user_id)
        project_ids = [p["id"] for p in user_projects]
        if project_id not in project_ids and project["visibility"] != "public":
            raise HTTPException(status_code=403, detail="Accès interdit à ce projet")
    else:
        if project["visibility"] != "public":
            raise HTTPException(status_code=403, detail="Accès interdit à ce projet")

    return db_get_project_performance(project_id)


@app.get("/api/projects/{project_id}/history")
async def get_project_history(
    project_id: int,
    limit: int = Query(50, ge=1, le=200, description="Nombre maximum d'entrées"),
    user_id: int = Query(None, description="Filtrer par ID utilisateur"),
    date_from: str = Query(None, description="Date de début (YYYY-MM-DD)"),
    date_to: str = Query(None, description="Date de fin (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Retourne l'historique des actions sur un projet:
    - Réservations créées, converties, annulées, expirées
    - Ventes réalisées
    - Nom de l'utilisateur et du client pour chaque action

    Les commerciaux ne voient que leur propre historique.
    """
    # Vérifier que le projet existe
    project = get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    # Vérifier les permissions
    role = current_user["role"]
    current_user_id = current_user["id"]

    if role == "manager":
        pass
    elif role == "commercial":
        user_projects = get_user_projects(current_user_id)
        project_ids = [p["id"] for p in user_projects]
        if project_id not in project_ids and project["visibility"] != "public":
            raise HTTPException(status_code=403, detail="Accès interdit à ce projet")
        # Les commerciaux ne peuvent voir que leur propre historique
        user_id = current_user_id
    else:
        if project["visibility"] != "public":
            raise HTTPException(status_code=403, detail="Accès interdit à ce projet")

    return db_get_project_history(project_id, limit, user_id, date_from, date_to)


@app.post("/api/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    body: ProjectCreate,
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """Créer un nouveau projet (manager uniquement)"""
    project = db_create_project(
        name=body.name,
        description=body.description,
        visibility=body.visibility,
        ca_objectif=body.ca_objectif,
        created_by=current_user["id"],
    )
    return project


@app.put("/api/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """Modifier un projet (manager uniquement)"""
    existing = get_project_by_id(project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    project = db_update_project(
        project_id=project_id,
        name=body.name,
        description=body.description,
        visibility=body.visibility,
        ca_objectif=body.ca_objectif,
    )
    return project


@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: int,
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """Supprimer un projet (manager uniquement)"""
    existing = get_project_by_id(project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    # Vérifier qu'il n'y a pas de lots associés
    lots = db_get_lots()
    project_lots = [l for l in lots if l.get("project_id") == project_id]
    if project_lots:
        raise HTTPException(
            status_code=409,
            detail=f"Impossible de supprimer un projet contenant {len(project_lots)} lot(s)"
        )

    db_delete_project(project_id)
    return {"message": "Projet supprimé avec succès"}


# ------------------------------------------------------------
# ROUTES - Assignments API
# ------------------------------------------------------------
@app.get("/api/projects/{project_id}/users", response_model=List[UserResponse])
async def get_project_assigned_users(
    project_id: int,
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """Liste des commerciaux assignés à un projet (manager uniquement)"""
    project = get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    users = get_project_users(project_id)
    # Ne pas retourner les password_hash
    return [{k: v for k, v in u.items() if k != "password_hash"} for u in users]


@app.post("/api/projects/{project_id}/assign", response_model=AssignmentResponse, status_code=201)
async def assign_user_to_project(
    project_id: int,
    body: AssignmentCreate,
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """Assigner un commercial à un projet (manager uniquement)"""
    # Vérifier que le projet existe
    project = get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    # Vérifier que l'utilisateur existe et est un commercial
    user = get_user_by_id(body.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if user["role"] != "commercial":
        raise HTTPException(status_code=400, detail="Seuls les commerciaux peuvent être assignés à un projet")

    # Créer l'assignation
    try:
        assignment = db_create_assignment(
            user_id=body.user_id,
            project_id=project_id,
            assigned_by=current_user["id"],
        )
        return assignment
    except Exception as e:
        # Si l'assignation existe déjà (UNIQUE constraint)
        raise HTTPException(status_code=409, detail="Cet utilisateur est déjà assigné à ce projet")


@app.delete("/api/projects/{project_id}/users/{user_id}")
async def unassign_user_from_project(
    project_id: int,
    user_id: int,
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """Retirer un commercial d'un projet (manager uniquement)"""
    success = db_delete_assignment(user_id, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Assignation non trouvée")
    return {"message": "Utilisateur retiré du projet avec succès"}


@app.get("/api/users/{user_id}/projects", response_model=List[ProjectResponse])
async def get_user_assigned_projects(
    user_id: int,
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """Liste des projets assignés à un utilisateur (manager uniquement)"""
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    projects = get_user_projects(user_id)
    return projects


# ------------------------------------------------------------
# ROUTES - Users API
# ------------------------------------------------------------
@app.get("/api/users", response_model=List[UserResponse])
async def get_users(
    role: Optional[UserRole] = Query(None, description="Filtre par rôle"),
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """Liste des utilisateurs (manager uniquement)"""
    users = db_get_users(role=role)
    # Ne pas retourner les password_hash
    return [{k: v for k, v in u.items() if k != "password_hash"} for u in users]


@app.get("/api/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """Détail d'un utilisateur (manager uniquement)"""
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return {k: v for k, v in user.items() if k != "password_hash"}


@app.delete("/api/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """Supprimer un utilisateur (manager uniquement)"""
    if user_id == current_user["id"]:
        raise HTTPException(status_code=409, detail="Impossible de supprimer votre propre compte")

    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    db_delete_user(user_id)
    return {"message": "Utilisateur supprimé avec succès"}


# ------------------------------------------------------------
# ROUTES - GeoJSON Upload (Manager only)
# ------------------------------------------------------------
@app.post("/api/projects/{project_id}/upload-geojson")
async def upload_geojson(
    project_id: int,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """
    Upload un fichier GeoJSON et génère automatiquement les lots pour le projet.

    Le fichier GeoJSON doit contenir un FeatureCollection avec des polygones.
    Chaque feature doit avoir les propriétés suivantes (optionnelles):
    - lot_id ou parcelid: numéro du lot
    - Shape_Area: surface du lot
    - zone: zone du lot
    - price: prix du lot

    Manager uniquement.
    """
    # Vérifier que le projet existe
    project = get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    # Vérifier le type de fichier
    if not file.filename.endswith('.geojson') and not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Le fichier doit être au format GeoJSON (.geojson ou .json)")

    try:
        # Lire le contenu du fichier
        contents = await file.read()
        geojson_data = json.loads(contents.decode('utf-8'))

        # Vérifier la structure GeoJSON
        if geojson_data.get("type") != "FeatureCollection":
            raise HTTPException(status_code=400, detail="Le GeoJSON doit être un FeatureCollection")

        features = geojson_data.get("features", [])
        if not features:
            raise HTTPException(status_code=400, detail="Le GeoJSON ne contient aucune feature")

        # Générer les lots depuis le GeoJSON
        created_lots = []
        errors = []

        for idx, feature in enumerate(features):
            try:
                props = feature.get("properties", {})

                # Extraire le numéro de lot
                lot_numero = props.get("lot_id") or props.get("parcelid")
                if not lot_numero:
                    lot_numero = f"LOT-{idx + 1}"
                lot_numero = str(lot_numero)

                # Extraire les autres propriétés
                surface = props.get("Shape_Area")
                if surface:
                    surface = float(surface)

                zone = props.get("zone")
                price = props.get("price")
                if price:
                    price = float(price)

                # Créer le lot dans la base de données
                lot = db_create_lot(
                    project_id=project_id,
                    numero=lot_numero,
                    zone=zone,
                    surface=surface,
                    price=price,
                    status="available"
                )
                created_lots.append(lot)

            except Exception as e:
                errors.append({
                    "feature_index": idx,
                    "lot_numero": lot_numero if 'lot_numero' in locals() else f"LOT-{idx + 1}",
                    "error": str(e)
                })

        # Mettre à jour le nombre total de lots dans le projet
        db_update_project(
            project_id=project_id,
            total_lots=len(created_lots)
        )

        # Sauvegarder le GeoJSON dans le dossier data
        # S'assurer que le dossier existe
        DATA_DIR.mkdir(parents=True, exist_ok=True)

        geojson_filename = f"project_{project_id}.geojson"
        geojson_path = DATA_DIR / geojson_filename
        with open(geojson_path, 'w', encoding='utf-8') as f:
            json.dump(geojson_data, f, ensure_ascii=False, indent=2)

        return {
            "message": f"{len(created_lots)} lot(s) créé(s) avec succès",
            "project_id": project_id,
            "lots_created": len(created_lots),
            "errors": errors if errors else None,
            "geojson_file": geojson_filename
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Le fichier n'est pas un JSON valide")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement du fichier: {str(e)}")


# ------------------------------------------------------------
# ROUTES - Project GeoJSON
# ------------------------------------------------------------
@app.get("/api/projects/{project_id}/lots.geojson")
async def get_project_geojson(
    project_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Retourne le fichier GeoJSON d'un projet avec les statuts des lots enrichis.

    Le GeoJSON est chargé depuis data/project_{project_id}.geojson et enrichi
    avec les statuts actuels des lots depuis la base de données.
    """
    # Vérifier que le projet existe
    project = get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    # Vérifier les permissions (même logique que get_project)
    role = current_user["role"]
    user_id = current_user["id"]

    if role == "manager":
        pass  # Manager a accès à tout
    elif role == "commercial":
        # Commercial doit être assigné au projet ou le projet doit être public
        user_projects = get_user_projects(user_id)
        project_ids = [p["id"] for p in user_projects]
        if project_id not in project_ids and project["visibility"] != "public":
            raise HTTPException(status_code=403, detail="Accès interdit à ce projet")
    else:  # client
        # Client ne peut voir que les projets publics
        if project["visibility"] != "public":
            raise HTTPException(status_code=403, detail="Accès interdit à ce projet")

    # Charger le fichier GeoJSON du projet
    geojson_filename = f"project_{project_id}.geojson"
    geojson_path = DATA_DIR / geojson_filename

    if not geojson_path.exists():
        # Si le fichier n'existe pas, retourner un FeatureCollection vide
        return {
            "type": "FeatureCollection",
            "features": []
        }

    try:
        with geojson_path.open("r", encoding="utf-8") as f:
            geojson_data = json.load(f)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la lecture du fichier GeoJSON: {str(e)}"
        )

    # Enrichir avec les statuts des lots depuis la base de données
    lots = db_get_lots()
    project_lots = {lot["numero"]: lot for lot in lots if lot.get("project_id") == project_id}

    features = geojson_data.get("features", [])
    for feature in features:
        props = feature.setdefault("properties", {})
        lot_numero = str(props.get("lot_id") or props.get("parcelid", ""))

        # Trouver le lot correspondant dans la base de données
        lot = project_lots.get(lot_numero)
        if lot:
            # Enrichir avec les informations du lot
            props["db_id"] = lot["id"]
            props["status"] = lot["status"]
            props["price"] = lot.get("price")
            props["zone"] = lot.get("zone")

            # Si le lot est réservé, ajouter les infos de réservation
            if lot.get("current_reservation_id"):
                reservations = db_get_reservations(lot_id=lot["id"])
                if reservations:
                    reservation = reservations[0]  # La première devrait être l'active

                    # Charger les infos client
                    client = get_client_by_id(reservation["client_id"])
                    if client:
                        props["client_name"] = client["name"]
                        props["client_phone"] = client.get("phone")

                    props["reservation_id"] = reservation["id"]
                    props["reservation_date"] = reservation["reservation_date"]
                    props["expiration_date"] = reservation["expiration_date"]
                    props["deposit"] = reservation.get("deposit", 0)

            # Si le lot est vendu, ajouter les infos de vente
            if lot["status"] == "sold":
                sales = db_get_sales(lot_id=lot["id"])
                if sales:
                    sale = sales[0]  # La première vente (la plus récente)
                    props["sale_date"] = sale.get("sale_date")
                    props["sale_price"] = sale.get("price")

                    # Récupérer le nom du commercial qui a vendu
                    if sale.get("sold_by_user_id"):
                        seller = get_user_by_id(sale["sold_by_user_id"])
                        if seller:
                            props["sold_by_name"] = seller.get("name", seller.get("email"))
                            props["sold_by_id"] = seller["id"]

                    # Récupérer les infos client de la vente
                    if sale.get("client_id"):
                        client = get_client_by_id(sale["client_id"])
                        if client:
                            props["client_name"] = client["name"]
                            props["client_phone"] = client.get("phone")
        else:
            # Lot pas encore dans la base de données
            props["status"] = "available"

    return geojson_data


# ------------------------------------------------------------
# ROUTES - Lots API
# ------------------------------------------------------------
@app.get("/api/lots", response_model=List[LotResponse])
def get_lots(
    numero: Optional[str] = Query(None, description="Recherche par numéro de lot"),
    zone: Optional[str] = Query(None, description="Recherche par zone"),
    status: Optional[LotStatus] = Query(None, description="Filtre par statut"),
    surface_min: Optional[float] = Query(None, ge=0, description="Surface minimum"),
    surface_max: Optional[float] = Query(None, ge=0, description="Surface maximum"),
):
    """Liste des lots avec filtres optionnels"""
    lots = db_get_lots(
        numero=numero,
        zone=zone,
        status=status,
        surface_min=surface_min,
        surface_max=surface_max,
    )
    return lots


@app.get("/api/lots/{lot_id}", response_model=LotResponse)
def get_lot(lot_id: int):
    """Détail d'un lot par ID"""
    lot = get_lot_by_id(lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot non trouvé")
    return lot


@app.post("/api/lots", response_model=LotResponse, status_code=201)
def create_lot(body: LotCreate):
    """Créer un nouveau lot"""
    existing = get_lot_by_numero(body.numero)
    if existing:
        raise HTTPException(status_code=409, detail=f"Un lot avec le numéro '{body.numero}' existe déjà")

    lot = db_create_lot(
        numero=body.numero,
        zone=body.zone,
        surface=body.surface,
        price=body.price,
        status=body.status,
    )
    return lot


@app.put("/api/lots/{lot_id}", response_model=LotResponse)
def update_lot(lot_id: int, body: LotUpdate):
    """Modifier un lot"""
    existing = get_lot_by_id(lot_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Lot non trouvé")

    if body.numero and body.numero != existing["numero"]:
        duplicate = get_lot_by_numero(body.numero)
        if duplicate:
            raise HTTPException(status_code=409, detail=f"Un lot avec le numéro '{body.numero}' existe déjà")

    lot = db_update_lot(
        lot_id=lot_id,
        numero=body.numero,
        zone=body.zone,
        surface=body.surface,
        price=body.price,
        status=body.status,
    )
    return lot


@app.delete("/api/lots/{lot_id}")
def delete_lot(lot_id: int):
    """Supprimer un lot"""
    existing = get_lot_by_id(lot_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Lot non trouvé")

    if existing.get("status") in ["reserved", "sold"]:
        raise HTTPException(status_code=409, detail="Impossible de supprimer un lot réservé ou vendu")

    db_delete_lot(lot_id)
    return {"message": "Lot supprimé avec succès"}


# ------------------------------------------------------------
# ROUTES - Clients API
# ------------------------------------------------------------
@app.get("/api/clients", response_model=List[ClientResponse])
def get_clients(
    search: Optional[str] = Query(None, description="Recherche par nom, téléphone ou CIN"),
):
    """Liste des clients avec recherche optionnelle"""
    clients = db_get_clients(search=search)
    return clients


@app.get("/api/clients/{client_id}", response_model=ClientResponse)
def get_client(client_id: int):
    """Détail d'un client par ID"""
    client = get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    return client


@app.get("/api/clients/{client_id}/details")
async def get_client_details(
    client_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Récupère les détails complets d'un client:
    - Informations personnelles
    - Historique des achats (ventes)
    - Historique des réservations
    - Statistiques (CA total, nombre de lots, acomptes, etc.)
    - Commercial qui a créé le client
    """
    client = db_get_client_details(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    return client


@app.post("/api/clients", response_model=ClientResponse, status_code=201)
async def create_client(
    body: ClientCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Créer un nouveau client"""
    client = db_create_client(
        name=body.name,
        phone=body.phone,
        email=body.email,
        cin=body.cin,
        client_type=body.client_type,
        notes=body.notes,
        created_by_user_id=current_user["id"],
    )
    return client


# ------------------------------------------------------------
# ROUTES - Reservations API
# ------------------------------------------------------------
@app.get("/api/reservations", response_model=List[ReservationResponse])
def get_reservations(
    status: Optional[ReservationStatus] = Query(None, description="Filtre par statut"),
    lot_id: Optional[int] = Query(None, description="Filtre par lot"),
    client_id: Optional[int] = Query(None, description="Filtre par client"),
):
    """Liste des réservations avec filtres optionnels"""
    reservations = db_get_reservations(
        status=status,
        lot_id=lot_id,
        client_id=client_id,
    )
    return reservations


@app.get("/api/reservations/{reservation_id}", response_model=ReservationResponse)
def get_reservation(reservation_id: int):
    """Détail d'une réservation par ID"""
    reservation = get_reservation_by_id(reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    return reservation


@app.post("/api/reservations", response_model=ReservationResponse, status_code=201)
def create_reservation(body: ReservationCreate):
    """
    Créer une nouvelle réservation.

    Règles métier:
    - Le lot passe automatiquement en statut 'reserved'
    - Le champ current_reservation_id du lot est renseigné
    - Expiration par défaut: +7 jours
    """
    # Vérifier que le lot existe
    lot = get_lot_by_id(body.lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot non trouvé")

    # Vérifier que le lot est disponible
    if lot.get("status") not in ["available"]:
        raise HTTPException(
            status_code=409,
            detail=f"Le lot n'est pas disponible (statut actuel: {lot.get('status')})"
        )

    # Vérifier que le client existe
    client = get_client_by_id(body.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")

    # Créer la réservation
    reservation = db_create_reservation(
        project_id=lot["project_id"],
        lot_id=body.lot_id,
        client_id=body.client_id,
        reserved_by_user_id=body.reserved_by_user_id,
        expiration_date=body.expiration_date,
        deposit=body.deposit,
        notes=body.notes,
    )

    # Mettre à jour le lot
    db_update_lot(
        lot_id=body.lot_id,
        status="reserved",
        current_reservation_id=reservation["id"],
    )

    return reservation


@app.post("/api/reservations/{reservation_id}/release")
def release_reservation(reservation_id: int):
    """
    Libérer une réservation active.

    Règles métier:
    - La réservation passe en statut 'released'
    - Le lot associé repasse en statut 'available'
    - Le champ current_reservation_id du lot est vidé
    """
    reservation = get_reservation_by_id(reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    if reservation.get("status") != "active":
        raise HTTPException(
            status_code=409,
            detail=f"Impossible de libérer une réservation qui n'est pas active (statut: {reservation.get('status')})"
        )

    # Mettre à jour la réservation
    db_update_reservation(reservation_id, status="released")

    # Mettre à jour le lot
    db_update_lot(
        lot_id=reservation["lot_id"],
        status="available",
        current_reservation_id=-1,  # -1 signifie NULL dans update_lot
    )

    return {
        "message": "Réservation libérée avec succès",
        "reservation_id": reservation_id,
        "lot_id": reservation["lot_id"],
    }


@app.post("/api/reservations/{reservation_id}/convert-to-sale", response_model=SaleResponse)
async def convert_reservation_to_sale(
    reservation_id: int,
    body: SaleFromReservation,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Convertir une réservation en vente.

    Règles métier:
    - La réservation doit être active
    - Création d'un enregistrement Sale
    - Le lot passe en statut 'sold'
    - La réservation passe en statut 'converted'
    - Le commercial qui effectue la vente est enregistré
    """
    reservation = get_reservation_by_id(reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    if reservation.get("status") != "active":
        raise HTTPException(
            status_code=409,
            detail=f"Impossible de convertir une réservation qui n'est pas active (statut: {reservation.get('status')})"
        )

    # Créer la vente avec le commercial qui l'effectue
    sale = db_create_sale(
        project_id=reservation["project_id"],
        lot_id=reservation["lot_id"],
        client_id=reservation["client_id"],
        price=body.price,
        reservation_id=reservation_id,
        sold_by_user_id=current_user["id"],
        notes=body.notes,
    )

    # Mettre à jour la réservation
    db_update_reservation(reservation_id, status="converted")

    # Mettre à jour le lot
    db_update_lot(
        lot_id=reservation["lot_id"],
        status="sold",
        current_reservation_id=-1,
    )

    return sale


# ------------------------------------------------------------
# ROUTES - Sales API
# ------------------------------------------------------------
@app.get("/api/sales", response_model=List[SaleResponse])
def get_sales(
    lot_id: Optional[int] = Query(None, description="Filtre par lot"),
    client_id: Optional[int] = Query(None, description="Filtre par client"),
):
    """Liste des ventes avec filtres optionnels"""
    sales = db_get_sales(lot_id=lot_id, client_id=client_id)
    return sales


@app.post("/api/sales", response_model=SaleResponse, status_code=201)
async def create_sale(
    body: SaleCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Créer une vente directe (sans réservation préalable).

    Le lot passe automatiquement en statut 'sold'.
    Le commercial qui effectue la vente est enregistré.
    """
    # Vérifier que le lot existe
    lot = get_lot_by_id(body.lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot non trouvé")

    # Vérifier que le lot n'est pas déjà vendu
    if lot.get("status") == "sold":
        raise HTTPException(status_code=409, detail="Le lot est déjà vendu")

    # Vérifier que le client existe
    client = get_client_by_id(body.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")

    # Si le lot est réservé, libérer la réservation
    if lot.get("current_reservation_id"):
        db_update_reservation(lot["current_reservation_id"], status="released")

    # Créer la vente avec le commercial qui l'effectue
    sale = db_create_sale(
        project_id=lot["project_id"],
        lot_id=body.lot_id,
        client_id=body.client_id,
        price=body.price,
        sold_by_user_id=current_user["id"],
        notes=body.notes,
    )

    # Mettre à jour le lot
    db_update_lot(
        lot_id=body.lot_id,
        status="sold",
        current_reservation_id=-1,
    )

    return sale


# ------------------------------------------------------------
# ROUTES - Check Expirations
# ------------------------------------------------------------
@app.post("/api/check-expirations")
def check_expirations():
    """
    Vérifie et traite les réservations expirées.

    Règles métier:
    - Identifie les réservations dont expiration_date < now
    - Marque ces réservations comme 'expired'
    - Remet les lots associés en statut 'available'
    - Nettoie current_reservation_id côté lot
    """
    expired = get_expired_reservations()
    processed = []

    for reservation in expired:
        # Mettre à jour la réservation
        db_update_reservation(reservation["id"], status="expired")

        # Mettre à jour le lot
        db_update_lot(
            lot_id=reservation["lot_id"],
            status="available",
            current_reservation_id=-1,
        )

        processed.append({
            "reservation_id": reservation["id"],
            "lot_id": reservation["lot_id"],
            "expiration_date": reservation["expiration_date"],
        })

    return {
        "message": f"{len(processed)} réservation(s) expirée(s) traitée(s)",
        "processed": processed,
    }


# ------------------------------------------------------------
# ROUTES - Dashboard API
# ------------------------------------------------------------
@app.get("/api/dashboard/stats")
def get_dashboard_stats(
    project_id: Optional[int] = Query(None, description="Filtre par projet"),
    user_id: Optional[int] = Query(None, description="Filtre par commercial"),
):
    """
    Retourne les KPIs principaux du dashboard:
    - Comptages par statut (available, reserved, sold, blocked)
    - CA réalisé et potentiel
    - Taux de vente et de transformation
    - Pourcentages par statut

    Paramètres de filtrage:
    - project_id: Filtre par projet spécifique
    - user_id: Filtre par commercial (via assignations)
    """
    return db_get_dashboard_stats(project_id=project_id, user_id=user_id)


@app.get("/api/dashboard/lots")
def get_dashboard_lots(
    project_id: Optional[int] = Query(None, description="Filtre par projet"),
    user_id: Optional[int] = Query(None, description="Filtre par commercial"),
):
    """
    Retourne la liste des lots avec détails pour le tableau de bord:
    - Informations du lot
    - Détails de réservation si applicable
    - Informations client si applicable
    - Nombre de jours dans le statut actuel

    Paramètres de filtrage:
    - project_id: Filtre par projet spécifique
    - user_id: Filtre par commercial (via assignations)
    """
    return db_get_lots_with_details(project_id=project_id, user_id=user_id)


@app.get("/api/dashboard/alerts")
def get_dashboard_alerts(
    days_threshold: int = Query(3, ge=1, le=30),
    project_id: Optional[int] = Query(None, description="Filtre par projet"),
    user_id: Optional[int] = Query(None, description="Filtre par commercial"),
):
    """
    Retourne les réservations à risque:
    - Réservations expirant dans les X jours
    - Réservations déjà expirées
    - Valeur financière à risque

    Paramètres de filtrage:
    - project_id: Filtre par projet spécifique
    - user_id: Filtre par commercial (via assignations)
    """
    reservations = db_get_reservations_at_risk(days_threshold, project_id=project_id, user_id=user_id)

    # Calculer les totaux
    expired = [r for r in reservations if r.get("risk_type") == "expired"]
    expiring_soon = [r for r in reservations if r.get("risk_type") == "expiring_soon"]

    total_at_risk = sum(r.get("lot_price", 0) or 0 for r in reservations)
    total_deposit = sum(r.get("deposit", 0) or 0 for r in reservations)

    return {
        "reservations": reservations,
        "summary": {
            "expired_count": len(expired),
            "expiring_soon_count": len(expiring_soon),
            "total_at_risk": len(reservations),
            "value_at_risk": total_at_risk,
            "deposit_at_risk": total_deposit,
        }
    }


@app.get("/api/dashboard/performance")
def get_dashboard_performance(
    period: str = Query("month", regex="^(day|week|month)$"),
    project_id: Optional[int] = Query(None, description="Filtre par projet"),
    user_id: Optional[int] = Query(None, description="Filtre par commercial"),
):
    """
    Retourne les données de performance commerciale:
    - Ventes par période
    - Réservations vs ventes
    - Durées moyennes des étapes

    Paramètres de filtrage:
    - project_id: Filtre par projet spécifique
    - user_id: Filtre par commercial (via assignations)
    """
    sales_by_period = db_get_sales_by_period(period, project_id=project_id, user_id=user_id)
    reservations_vs_sales = db_get_reservations_vs_sales(period, project_id=project_id, user_id=user_id)
    durations = db_get_average_durations(project_id=project_id, user_id=user_id)

    return {
        "sales_by_period": sales_by_period,
        "reservations_vs_sales": reservations_vs_sales,
        "average_durations": durations,
    }


@app.get("/api/dashboard/clients-pipeline")
def get_clients_pipeline(
    project_id: Optional[int] = Query(None, description="Filtre par projet"),
    user_id: Optional[int] = Query(None, description="Filtre par commercial"),
):
    """
    Retourne le pipeline clients:
    - Liste des clients avec leur statut dans le pipeline
    - Nombre de réservations actives
    - Total des achats
    - Total des acomptes

    Paramètres de filtrage:
    - project_id: Filtre par projet spécifique
    - user_id: Filtre par commercial (via assignations)
    """
    return db_get_clients_pipeline(project_id=project_id, user_id=user_id)


@app.get("/api/dashboard/commercials-performance")
async def get_commercials_performance(
    project_id: Optional[int] = Query(None, description="Filtre par projet"),
    current_user: Dict[str, Any] = Depends(require_role("manager"))
):
    """
    Retourne les performances de chaque commercial (manager uniquement).

    Pour chaque commercial:
    - Nombre de ventes réalisées
    - CA total réalisé
    - Nombre de réservations créées
    - Taux de transformation (réservations converties / total réservations)
    - CA moyen par vente

    Paramètres de filtrage:
    - project_id: Filtre par projet spécifique
    """
    return db_get_commercials_performance(project_id=project_id)


# ------------------------------------------------------------
# ROUTES - Audit Logs API
# ------------------------------------------------------------
@app.get("/api/audit-logs")
def get_audit_logs(
    entity_type: Optional[str] = Query(None, description="Type d'entité (lot, client, reservation, sale)"),
    entity_id: Optional[str] = Query(None, description="ID de l'entité"),
    action: Optional[str] = Query(None, description="Type d'action"),
    limit: int = Query(100, ge=1, le=500),
):
    """Retourne l'historique des modifications"""
    return db_get_audit_logs(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        limit=limit,
    )


@app.post("/api/audit-logs")
def create_audit_log(
    entity_type: str,
    entity_id: str,
    action: str,
    user_id: Optional[str] = None,
    old_data: Optional[Dict] = None,
    new_data: Optional[Dict] = None,
):
    """Crée une entrée dans l'historique"""
    return db_create_audit_log(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        user_id=user_id,
        old_data=old_data,
        new_data=new_data,
    )


# ------------------------------------------------------------
# ROUTES - Client Update
# ------------------------------------------------------------
@app.put("/api/clients/{client_id}", response_model=ClientResponse)
def update_client(client_id: int, body: ClientUpdate):
    """Modifier un client"""
    existing = get_client_by_id(client_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Client non trouvé")

    client = db_update_client(
        client_id=client_id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        cin=body.cin,
        client_type=body.client_type,
        notes=body.notes,
    )
    return client
