"""Guards keeping ORM models consistent with the migrations."""

from app.infrastructure.database.models import ClientModel, UserModel


def test_client_last_name_matches_migration_0017() -> None:
    # Migration 0017 backfills last_name from name (VARCHAR(200)).
    assert ClientModel.__table__.c.last_name.type.length == 200


def test_user_last_name_untouched() -> None:
    assert UserModel.__table__.c.last_name.type.length == 100


def test_client_cities_length_100() -> None:
    assert ClientModel.__table__.c.city_morocco.type.length == 100
    assert ClientModel.__table__.c.city_abroad.type.length == 100
