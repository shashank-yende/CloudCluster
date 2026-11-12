from sqlalchemy import Column, String, Float, DateTime, Text, Integer, ForeignKey
from sqlalchemy.orm import declarative_base
import datetime

Base = declarative_base()

class UserModel(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=True)
    email = Column(String(128), unique=True, index=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    role = Column(String(32), default="Engineer")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "name": self.name or self.username,
            "email": self.email,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class TaskModel(Base):
    __tablename__ = "tasks"

    task_id = Column(String(64), primary_key=True, index=True)
    task_type = Column(String(64), nullable=False)
    algorithm = Column(String(64), nullable=False)
    status = Column(String(32), default="SUBMITTED")
    assigned_node = Column(String(32), nullable=True)
    queue_position = Column(Integer, nullable=True)
    user_id = Column(String(64), nullable=True)
    
    input_file = Column(String(255), nullable=True)
    output_file = Column(String(255), nullable=True)

    submission_time = Column(DateTime, default=datetime.datetime.utcnow)
    scheduling_time = Column(DateTime, nullable=True)
    start_time = Column(DateTime, nullable=True)
    completion_time = Column(DateTime, nullable=True)

    waiting_time = Column(Float, default=0.0)
    execution_time = Column(Float, default=0.0)
    avg_cpu = Column(Float, default=0.0)
    peak_cpu = Column(Float, default=0.0)
    avg_ram = Column(Float, default=0.0)
    peak_ram = Column(Float, default=0.0)
    
    error_message = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "algorithm": self.algorithm,
            "status": self.status,
            "assigned_node": self.assigned_node,
            "queue_position": self.queue_position,
            "input_file": self.input_file,
            "output_file": self.output_file,
            "submission_time": self.submission_time.isoformat() if self.submission_time else None,
            "scheduling_time": self.scheduling_time.isoformat() if self.scheduling_time else None,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "completion_time": self.completion_time.isoformat() if self.completion_time else None,
            "waiting_time": self.waiting_time,
            "execution_time": self.execution_time,
            "avg_cpu": self.avg_cpu,
            "peak_cpu": self.peak_cpu,
            "avg_ram": self.avg_ram,
            "peak_ram": self.peak_ram,
            "error_message": self.error_message
        }


class UserSessionModel(Base):
    __tablename__ = "cloudcluster_auth_sessions"

    token_hash = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
