from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Name must contain at least two characters")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserView(BaseModel):
    id: str
    name: str
    email: EmailStr
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserView


class WorkloadView(BaseModel):
    id: str
    task_type: str
    title: str
    status: str
    input_name: str
    result: dict[str, Any]
    error_message: str
    worker_id: str
    algorithm: str
    progress: int
    duration_ms: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    artifact_name: str
