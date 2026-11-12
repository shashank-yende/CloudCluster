from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

os.makedirs("storage", exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./storage/cloud_platform.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
