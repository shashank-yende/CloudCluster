# Resource-Aware Cloud Task Management & Optimization Platform

A distributed, containerized mini cloud platform integrating **Operating Systems (OS)**, **Design & Analysis of Algorithms (DAA)**, **Database Management Systems (DBMS)**, and **Computer Networks (CN)** engines.

---

## 🏗️ Architecture Overview

| Component | Engine | Description |
|-----------|--------|-------------|
| **Worker Nodes** | **OS Engine** | 5 containerized worker nodes with isolated CPU/RAM limits; two backups remain offline in standby until a primary fails. |
| **Schedulers** | **DAA Engine** | Implements First Fit, Min-Min, and Max-Min heuristic scheduling algorithms with an execution time estimator. |
| **SQLite / Models** | **DBMS Engine** | Tracks task lifecycle states (`SUBMITTED` ➔ `QUEUED` ➔ `RUNNING` ➔ `COMPLETED` / `FAILED`) and hardware performance metrics. |
| **REST Dispatch** | **CN Engine** | Handles dynamic cluster telemetry checks and asynchronous HTTP workload dispatch across isolated Docker networks. |
| **Interactive UI** | **Web Engine** | Responsive workspace with a draggable 3D cluster map, live telemetry, analytics, and artifact viewer. |
| **JWT Authentication** | **Security Engine** | Signed HS256 access tokens, server-side logout revocation, and PBKDF2 password hashes. |

---

## 📁 Repository Structure

```
Mini-Project/
├── controller/                      # Central FastAPI Orchestrator
│   ├── main.py                      # REST endpoints & Web dashboard serving
│   ├── database.py                  # DBMS connection & session engine
│   ├── resource_manager.py          # Queries live CPU/RAM from worker nodes
│   ├── task_manager.py              # Strict lifecycle state machine
│   ├── scheduler_service.py         # Interfaces controller with DAA algorithms
│   ├── execution_service.py         # Asynchronous dispatch & fallback executor
│   └── Dockerfile                   # Container definition for controller
│
├── models/                          # Object Relational Mapping (ORM)
│   ├── __init__.py
│   └── task.py                      # TaskModel schema & serialization
│
├── schedulers/                      # DAA Engine
│   ├── __init__.py
│   ├── first_fit.py                 # First Fit capable node selector
│   ├── min_min.py                   # Min-Min makespan optimizer
│   ├── max_min.py                   # Max-Min priority scheduler
│   └── execution_estimator.py       # Complexity & load-aware runtime estimator
│
├── nodes/                           # Cloud Worker Nodes
│   ├── node1/ (worker.py, Dockerfile) # Primary: 2 Cores, 4GB RAM
│   ├── node2/ (worker.py, Dockerfile) # Primary: 4 Cores, 8GB RAM
│   ├── node3/ (worker.py, Dockerfile) # Primary: 8 Cores, 16GB RAM
│   └── node4 + node5                  # Backup workers: 2 Cores, 4GB RAM each
│
├── tasks/                           # Workload Processors
│   ├── data_preprocessing/          # Standardized and deduplicated CSV output
│   ├── csv_json_converter/          # CSV ↔ JSON table conversion
│   ├── image_optimizer/              # Resized and compressed WebP output
│   ├── pdf_brief/                    # PDF text and metadata summary
│   ├── file_integrity/               # SHA-256 checksum and file metadata report
│   └── qr_generator/                 # Link-to-QR PNG generation
│
├── storage/                         # File Persistence
│   ├── uploads/                     # User uploaded files
│   ├── processing/                  # Staging area
│   └── results/                     # Generated image, text, and JSON artifacts
│
├── frontend/                        # Modern React + Vite Dashboard UI
│   ├── src/                         # React components & glassmorphism theme
│   ├── package.json                 # Node dependencies (React 19, Chart.js, Lucide)
│   └── vite.config.js               # Dev server & reverse proxy
│
├── docker-compose.yml               # Multi-container cluster orchestration
├── requirements.txt                 # Global Python dependencies
└── README.md                        # Documentation
```

### Everyday workloads

The Workloads page presents six jobs, grouped by expected complexity. Quick jobs are assigned with First Fit, standard transforms with Min-Min, and advanced document/archive work with Max-Min.

| Level | Workload | Input and output |
|---|---|---|
| Quick | Link QR maker | Enter an HTTP(S) link; preview and download a PNG QR code. |
| Quick | Data preprocessing | Upload CSV; normalize headers and cells, remove blank rows and duplicate records; download CSV. |
| Standard | CSV ↔ JSON | Convert CSV records to JSON or JSON records to CSV. |
| Standard | Image optimizer | Resize and compress PNG, JPEG, or WebP images to WebP. |
| Advanced | PDF brief | Summarize pages, words, metadata, frequent terms, and selectable text. |
| Advanced | File integrity check | Create a SHA-256 checksum and metadata report to verify downloads and backups. |

Each file is capped at 20 MB. A mixed batch can include up to 50 work items and 100 MB total. The controller schedules batches across eligible workers and records per-worker queue positions; work beyond current worker capacity stays queued. PDF processing is limited to 500 pages.

### User task privacy

- Task history is scoped to the authenticated account. The controller applies ownership checks when listing, viewing, or deleting tasks; tasks created before authentication or belonging to another account are not exposed.
- Login returns a signed HS256 JWT that expires after 30 days. Logout revokes its server-side session record, and protected routes verify the signature, expiration, issuer, and token record.
- New passwords use salted PBKDF2-SHA256. New workspaces require a name, email address, and passphrase of at least 12 characters. Sign-in uses the registered email address. Existing SHA-256 password hashes are upgraded when an account next signs in.
- Set `CLOUDCLUSTER_JWT_SECRET` to a private value of at least 32 bytes in deployment. Local runs create and reuse an ignored `.jwt-secret` file; Docker uses a controller-only named volume so worker containers cannot read the signing key.
- Input and output artifacts are served through authenticated, task-owner-checked API routes. They are not exposed through a public static storage URL.
- Existing task records without an owner are intentionally hidden from all accounts. They cannot be safely assigned because their original owners are unknown.

---

## 🚀 How to Run

### Method 1: Using Docker Compose

Make sure Docker Desktop is running, then execute:

```bash
docker compose up --build
```

- **Controller API Docs**: `http://localhost:8000/docs`
- **Node 1 Health**: `http://localhost:8001/health`
- **Node 2 Health**: `http://localhost:8002/health`
- **Node 3 Health**: `http://localhost:8003/health`
- **Backup Node 4 Health**: `http://localhost:8004/health`
- **Backup Node 5 Health**: `http://localhost:8005/health`

---

### Method 2: Running Locally Without Docker

1. **Install Backend Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the Controller**:
   ```bash
   uvicorn controller.main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. **Start the React Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Access the Web Dashboard**:
   👉 **`http://localhost:5173`** (React Vite UI with automatic API proxy to port 8000)
