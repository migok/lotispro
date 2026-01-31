"""
Script pour créer des utilisateurs de test
Usage: python seed_users.py
"""
import sys
from pathlib import Path
import bcrypt

# Ajouter le dossier backend au path
sys.path.insert(0, str(Path(__file__).parent))

from db import init_db, create_user, get_user_by_email

def hash_password(password: str) -> str:
    """Hash un mot de passe avec bcrypt"""
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

def seed_users():
    """Créer les utilisateurs de test"""
    init_db()

    users = [
        {
            "email": "manager@test.com",
            "password": "password123",
            "name": "Manager Test",
            "role": "manager"
        },
        {
            "email": "commercial@test.com",
            "password": "password123",
            "name": "Commercial Test",
            "role": "commercial"
        },
        {
            "email": "client@test.com",
            "password": "password123",
            "name": "Client Test",
            "role": "client"
        },
    ]

    for user_data in users:
        # Vérifier si l'utilisateur existe déjà
        existing = get_user_by_email(user_data["email"])
        if existing:
            print(f"OK L'utilisateur {user_data['email']} existe déjà")
            continue

        # Créer l'utilisateur
        password_hash = hash_password(user_data["password"])
        user = create_user(
            email=user_data["email"],
            password_hash=password_hash,
            name=user_data["name"],
            role=user_data["role"]
        )
        print(f"OK Utilisateur créé: {user_data['email']} ({user_data['role']})")

    print("\n" + "="*60)
    print("Utilisateurs de test créés avec succès!")
    print("="*60)
    print("\nComptes disponibles:")
    print("  Manager:     manager@test.com / password123")
    print("  Commercial:  commercial@test.com / password123")
    print("  Client:      client@test.com / password123")
    print("\nVous pouvez maintenant vous connecter sur http://localhost:5173")
    print("="*60)

if __name__ == "__main__":
    seed_users()
