import time

from app.security import hash_password, verify_password


def test_password_hash_is_one_way_and_validates():
    encoded = hash_password("a strong sample password")
    assert encoded != "a strong sample password"
    assert verify_password("a strong sample password", encoded)
    assert not verify_password("the wrong password", encoded)


def test_register_auth_refresh_logout_and_password_validation(client):
    short = client.post("/api/auth/register", json={"name": "Avery", "email": "avery@example.com", "password": "short"})
    assert short.status_code == 422
    registered = client.post("/api/auth/register", json={"name": "Avery Example", "email": "avery@example.com", "password": "correct-horse-battery"})
    assert registered.status_code == 201
    assert registered.json()["user"]["email"] == "avery@example.com"
    assert registered.json()["user"]["created_at"].endswith(("Z", "+00:00"))
    assert client.cookies.get("cc_refresh")
    old_refresh = client.cookies.get("cc_refresh")
    token = registered.json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    invalid_login = client.post("/api/auth/login", json={"email": "avery@example.com", "password": "incorrect"})
    assert invalid_login.status_code == 401

    refreshed = client.post("/api/auth/refresh")
    assert refreshed.status_code == 200
    assert client.cookies.get("cc_refresh") != old_refresh
    replay = client.post("/api/auth/refresh", cookies={"cc_refresh": old_refresh})
    assert replay.status_code == 401
    assert client.post("/api/auth/logout").status_code == 204


def test_private_api_rejects_missing_or_malformed_bearer(client):
    assert client.get("/api/dashboard").status_code == 401
    assert client.get("/api/dashboard", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_login_attempts_are_rate_limited(client):
    for _ in range(8):
        response = client.post("/api/auth/login", json={"email": "missing@example.com", "password": "incorrect"})
        assert response.status_code == 401
    limited = client.post("/api/auth/login", json={"email": "missing@example.com", "password": "incorrect"})
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "300"


def test_user_cannot_read_another_accounts_workload(signed_in):
    client, first_headers, _ = signed_in
    submitted = client.post("/api/workloads", headers=first_headers, data={"task_type": "link-qr", "url": "https://example.com"})
    assert submitted.status_code == 202
    workload_id = submitted.json()["id"]
    for _ in range(30):
        own = client.get(f"/api/workloads/{workload_id}", headers=first_headers)
        if own.status_code == 200 and own.json()["status"] in {"completed", "failed"}:
            break
        time.sleep(0.05)
    assert own.status_code == 200 and own.json()["status"] == "completed"
    artifact = client.get(f"/api/workloads/{workload_id}/artifact", headers=first_headers)
    assert artifact.status_code == 200 and artifact.headers["content-type"] == "image/png"
    assert artifact.content.startswith(b"\x89PNG")
    other = client.post("/api/auth/register", json={"name": "Casey Example", "email": "casey@example.com", "password": "another-strong-password"})
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert client.get(f"/api/workloads/{workload_id}", headers=other_headers).status_code == 404
    assert client.get(f"/api/workloads/{workload_id}/artifact", headers=other_headers).status_code == 404
