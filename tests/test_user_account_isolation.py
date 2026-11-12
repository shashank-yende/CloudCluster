import asyncio
import hashlib
import time
import unittest
from unittest.mock import patch

from fastapi import BackgroundTasks, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from controller import main
from controller.task_manager import TaskManager
from models.task import Base, TaskModel, UserModel


class UserAccountIsolationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.alice = UserModel(username="alice", email="alice@example.test", password_hash="alice-hash")
        self.bob = UserModel(username="bob", email="bob@example.test", password_hash="bob-hash")
        self.db.add_all([self.alice, self.bob])
        self.db.commit()
        self.db.refresh(self.alice)
        self.db.refresh(self.bob)
        self.alice_token = main.create_session(self.db, self.alice)
        self.bob_token = main.create_session(self.db, self.bob)
        self.db.add_all([
            TaskModel(
                task_id="alice-task",
                task_type="text_analyzer",
                algorithm="first_fit",
                status="COMPLETED",
                user_id=str(self.alice.id),
            ),
            TaskModel(
                task_id="bob-task",
                task_type="text_analyzer",
                algorithm="first_fit",
                status="COMPLETED",
                user_id=str(self.bob.id),
            ),
            TaskModel(
                task_id="legacy-task",
                task_type="text_analyzer",
                algorithm="first_fit",
                status="COMPLETED",
            ),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    @staticmethod
    def _credentials(token):
        return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    def test_task_history_only_returns_authenticated_users_tasks(self):
        alice = main.get_current_user(self._credentials(self.alice_token), self.db)
        bob = main.get_current_user(self._credentials(self.bob_token), self.db)

        alice_tasks = main.list_tasks(self.db, alice)
        bob_tasks = main.list_tasks(self.db, bob)

        self.assertEqual([task["task_id"] for task in alice_tasks], ["alice-task"])
        self.assertEqual([task["task_id"] for task in bob_tasks], ["bob-task"])

    def test_task_detail_and_delete_are_owner_scoped(self):
        alice = main.get_current_user(self._credentials(self.alice_token), self.db)

        with self.assertRaises(HTTPException) as detail_error:
            main.get_task_details("bob-task", self.db, alice)
        with self.assertRaises(HTTPException) as delete_error:
            main.delete_task("bob-task", self.db, alice)

        self.assertEqual(detail_error.exception.status_code, 404)
        self.assertEqual(delete_error.exception.status_code, 404)
        self.assertIsNotNone(TaskManager.get_task(self.db, "bob-task"))

    def test_task_artifacts_are_not_available_to_other_users(self):
        alice = main.get_current_user(self._credentials(self.alice_token), self.db)

        with self.assertRaises(HTTPException) as artifact_error:
            main.get_task_artifact("bob-task", "output", self.db, alice)

        self.assertEqual(artifact_error.exception.status_code, 404)

    def test_invalid_and_revoked_tokens_are_rejected(self):
        with self.assertRaises(HTTPException) as invalid_error:
            main.get_current_user(self._credentials("invalid-token"), self.db)
        self.assertEqual(invalid_error.exception.status_code, 401)

        alice = main.get_current_user(self._credentials(self.alice_token), self.db)
        main.logout(self._credentials(self.alice_token), self.db, alice)
        with self.assertRaises(HTTPException) as revoked_error:
            main.get_current_user(self._credentials(self.alice_token), self.db)
        self.assertEqual(revoked_error.exception.status_code, 401)

    def test_session_token_is_a_signed_expiring_jwt(self):
        claims = main.decode_jwt(self.alice_token)
        self.assertEqual(len(self.alice_token.split(".")), 3)
        self.assertEqual(claims["iss"], main.JWT_ISSUER)
        self.assertEqual(claims["sub"], str(self.alice.id))
        self.assertGreater(claims["exp"], int(time.time()))
        self.assertTrue(claims["jti"])

    def test_tampered_and_expired_jwts_are_rejected(self):
        parts = self.alice_token.split(".")
        parts[-1] = ("A" if parts[-1][0] != "A" else "B") + parts[-1][1:]
        tampered = ".".join(parts)
        with self.assertRaises(HTTPException):
            main.get_current_user(self._credentials(tampered), self.db)

        claims = main.decode_jwt(self.alice_token)
        claims["exp"] = int(time.time()) - 1
        expired = main.encode_jwt(claims)
        with self.assertRaises(HTTPException):
            main.get_current_user(self._credentials(expired), self.db)

    def test_password_hash_uses_pbkdf2_and_accepts_legacy_sha256(self):
        password_hash = main.hash_pw("safe-demo-password")
        self.assertTrue(password_hash.startswith("pbkdf2_sha256$"))
        self.assertTrue(main.verify_pw("safe-demo-password", password_hash))
        self.assertFalse(main.verify_pw("wrong-password", password_hash))
        self.assertTrue(main.verify_pw("legacy-password", hashlib.sha256(b"legacy-password").hexdigest()))

    def test_login_migrates_legacy_password_hash_and_returns_jwt(self):
        legacy_user = UserModel(
            username="legacy",
            email="legacy@example.test",
            password_hash=hashlib.sha256(b"legacy-password").hexdigest(),
        )
        self.db.add(legacy_user)
        self.db.commit()

        response = main.login(main.AuthRequest(username="legacy", password="legacy-password"), self.db)
        self.db.refresh(legacy_user)
        self.assertEqual(len(response["token"].split(".")), 3)
        self.assertTrue(legacy_user.password_hash.startswith("pbkdf2_sha256$"))
        self.assertEqual(main.decode_jwt(response["token"])["sub"], str(legacy_user.id))

    def test_workspace_registration_uses_name_and_email_and_can_sign_in_by_email(self):
        response = main.register(
            main.AuthRequest(name="Ada Lovelace", email="ada@example.test", password="a-strong-passphrase"),
            self.db,
        )

        self.assertEqual(response["user"]["name"], "Ada Lovelace")
        self.assertEqual(response["user"]["email"], "ada@example.test")
        self.assertEqual(main.decode_jwt(response["token"])["name"], "Ada Lovelace")

        login_response = main.login(
            main.AuthRequest(email="ADA@example.test", password="a-strong-passphrase"),
            self.db,
        )
        self.assertEqual(login_response["user"]["id"], response["user"]["id"])

    def test_registration_requires_strong_passphrase_and_no_default_admin_login_exists(self):
        with self.assertRaises(HTTPException) as weak_password:
            main.register(
                main.AuthRequest(name="New User", email="new@example.test", password="short"),
                self.db,
            )
        self.assertEqual(weak_password.exception.status_code, 400)

        with self.assertRaises(HTTPException) as default_admin:
            main.login(main.AuthRequest(username="admin", password="admin123"), self.db)
        self.assertEqual(default_admin.exception.status_code, 401)

    def test_task_manager_records_and_filters_owner(self):
        task = TaskManager.create_task(
            self.db,
            task_id="new-alice-task",
            task_type="qr_generator",
            algorithm="first_fit",
            user_id=self.alice.id,
        )

        self.assertEqual(task.user_id, str(self.alice.id))
        self.assertIn(task, TaskManager.get_all_tasks(self.db, user_id=self.alice.id))
        self.assertNotIn(task, TaskManager.get_all_tasks(self.db, user_id=self.bob.id))

    def test_submission_is_assigned_to_the_authenticated_user(self):
        with (
            patch.object(
                main.resource_manager,
                "get_cluster_resources",
                return_value={"node1": {"status": "Online"}},
            ),
            patch.object(main.resource_manager, "nodes", {"node1": "http://node1"}),
            patch.object(
                main.SchedulerService,
                "auto_select_algorithm",
                return_value=("first_fit", "node1"),
            ),
        ):
            response = asyncio.run(
                main.submit_task(
                    BackgroundTasks(),
                    "qr_generator",
                    None,
                    "https://example.test/workspace",
                    self.db,
                    self.alice,
                )
            )

        task = TaskManager.get_task(self.db, response["task_id"])
        self.assertEqual(task.user_id, str(self.alice.id))
        self.assertIn(task, TaskManager.get_all_tasks(self.db, user_id=self.alice.id))
        self.assertNotIn(task, TaskManager.get_all_tasks(self.db, user_id=self.bob.id))
        with open(task.input_file, encoding="utf-8") as link_file:
            self.assertEqual(link_file.read(), "https://example.test/workspace")
        TaskManager.cleanup_artifact(task.input_file)


if __name__ == "__main__":
    unittest.main()
