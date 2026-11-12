# CloudCluster Studio

CloudCluster Studio is a fresh workload-control workspace for six practical everyday jobs. The React + TypeScript client talks to a FastAPI API backed by SQLite. A private five-node worker simulation dispatches workloads by complexity and shows live queue, status, and utilization data.

## The six workloads

| Level | Tool | What it does |
|---|---|---|
| Quick | Link QR maker | Enter an HTTP(S) link, generate a PNG QR code, preview it, and download it. |
| Quick | CSV cleanup | Trim cells, discard blank lines, and remove exact duplicate rows. |
| Standard | CSV ↔ JSON | Convert CSV tables to JSON records or JSON arrays of objects to CSV. |
| Standard | Image optimizer | Resize and compress an image to a shareable WebP file. |
| Advanced | PDF brief | Report page and word counts, metadata title, frequent terms, and extracted text. |
| Advanced | ZIP organizer | Repackage files into folders by type without extracting to disk. |

Workloads are assigned with First Fit (Quick), Min-Min (Standard), and Max-Min (Advanced). Each result is private to the account that created it. The included five-node fleet is an embedded local simulation: task processors execute asynchronously in the API process. It provides a working control-plane demonstration without requiring a cloud account or container cluster.

## Run locally

Open two terminals from the project folder.

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

```powershell
cd frontend
npm install
npm run dev -- --port 5174
```

Open <http://127.0.0.1:5174>, choose **Create account**, and use a passphrase of at least 12 characters. The Vite server proxies `/api` to FastAPI on port 8001. SQLite data, the automatically generated signing key, and task artifacts are kept under `backend/data/`.

## Authentication and deployment settings

- Passwords are hashed with Argon2id; passwords are never returned or stored in plaintext.
- Access JWTs are HS256 signed, issuer/audience checked, and expire after 10 minutes. The browser holds the access token in memory.
- A random refresh token rotates on refresh and is stored server-side only as a SHA-256 hash. The browser receives it in an HttpOnly, SameSite=Strict cookie scoped to `/api/auth`.
- Sign-in attempts are rate-limited in-process. All workload, history, and artifact routes verify the JWT and filter by owner.
- Uploads are limited to 20 MB; ZIPs are capped at 500 entries and 100 MB expanded size, with traversal paths rejected.

For HTTPS deployment, copy `backend/.env.example` to `backend/.env`, set a unique `CLOUDCLUSTER_JWT_SECRET` of at least 32 characters, set `CLOUDCLUSTER_COOKIE_SECURE=true`, and add the public frontend origin to `CLOUDCLUSTER_CORS_ORIGINS`. Store `.env`, the SQLite database, the generated secret, and result files outside source control. Use a durable shared database and a distributed task queue before deploying multiple API processes or real worker hosts; the local in-process rate limiter and simulated worker fleet are for a single-process development/demo setup.

## API overview

- `GET /api/health`, `GET /api/workload-types`
- `POST /api/auth/register`, `/login`, `/refresh`, `/logout`; `GET /api/auth/me`
- `GET /api/dashboard`, `GET /api/workers`
- `POST /api/workloads`; `GET /api/workloads`, `/api/workloads/{id}`
- `GET /api/workloads/{id}/artifact`, `DELETE /api/workloads/{id}`

FastAPI’s interactive API docs are available at <http://127.0.0.1:8001/docs> while the server is running.

## Verify

```powershell
cd backend
.venv\Scripts\python.exe -m pytest -q
cd ..\frontend
npm run build
```
