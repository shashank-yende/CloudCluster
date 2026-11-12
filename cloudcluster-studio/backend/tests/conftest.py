import pytest
import shutil
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app import executor
from app.main import app, login_attempts
from app.config import RESULT_DIR


@pytest.fixture()
def client():
    login_attempts.clear()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)
    original_session_factory = executor.SessionLocal
    executor.SessionLocal = TestSession

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    executor.SessionLocal = original_session_factory
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def signed_in(client):
    response = client.post("/api/auth/register", json={"name": "Avery Example", "email": "avery@example.com", "password": "correct-horse-battery"})
    assert response.status_code == 201
    token = response.json()["access_token"]
    user = response.json()["user"]
    try:
        yield client, {"Authorization": f"Bearer {token}"}, user
    finally:
        shutil.rmtree(RESULT_DIR / user["id"], ignore_errors=True)
