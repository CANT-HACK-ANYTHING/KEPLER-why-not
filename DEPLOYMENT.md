# RelayEV: Cloud Deployment & Containerization Manual

> **Production Deployment & DevOps Guide for the RelayEV Offline-First Rural EV Charging Mesh.**  
> Covers Docker Compose containerization, Supabase managed PostgreSQL, Nginx reverse proxy routing, and one-click cloud hosting on Railway, Render, Fly.io, and Linux VPS.

---

## 🏗️ Architecture & Service Topology

```text
       Internet / Mobile 4G Clients (EV Drivers & Data Mules)
                                  │
                                  ▼
                     [ Nginx Reverse Proxy: Port 80 / 443 ]
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
      [ Next.js 16 UI: Port 3000 ]     [ FastAPI Backend: Port 8000 ]
      - Web Bluetooth Connector         - Cryptographic Escrow Engine
      - Interactive Mesh Map            - HMAC Verification
      - Hardware BLE Simulator          - Drive-By Data Mule Mesh Sync
                 │                                 │
                 └────────────────┬────────────────┘
                                  ▼
                   [ Database Engine (Dual Mode) ]
                   - Mode A (Default): SQLite WAL (Zero-Config, Embedded)
                   - Mode B (Cloud): Supabase / Managed PostgreSQL 16
```

---

## 🐳 Quickstart: Local Docker Deployment

### 1. Prerequisites
- Docker Engine 24.0+ & Docker Compose v2.20+
- Port 80 free (or configure `HTTP_PORT=8080` in `.env`)

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Launch the Stack
Run in the repository root:
```bash
# Build and start all services in detached mode
docker compose up -d --build
```

### 4. Verify Service Health
```bash
docker compose ps
```

| Service | Container | Status | Public URL |
|---|---|---|---|
| **Nginx Proxy** | `relayev-proxy` | `Up (healthy)` | `http://localhost/` |
| **Next.js UI** | `relayev-frontend` | `Up` | Proxied via `http://localhost/` |
| **FastAPI Backend** | `relayev-backend` | `Up (healthy)` | `http://localhost/api/` |
| **Interactive Docs** | | | `http://localhost/docs` |

---

## 🗄️ Supabase Cloud PostgreSQL Setup

For managed production deployments with Row-Level Security (RLS) and real-time triggers:

### 1. Create a Supabase Project
1. Log in to [supabase.com](https://supabase.com) and click **New Project**.
2. Name the project `relayev-mesh` and choose your preferred cloud region (e.g., `ap-south-1` Mumbai).
3. Note your Database Password and API Keys under **Project Settings -> API**.

### 2. Run Database Migrations
Choose one of the two methods below:

#### Method A: Automated Migration Script
```bash
python scripts/migrate_supabase.py --db-url "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
```

#### Method B: Supabase SQL Editor
1. In the Supabase Dashboard, open the **SQL Editor**.
2. Open [`backend/schema.sql`](file:///d:/RelayEV/backend/schema.sql) and paste the entire script.
3. Click **Run**. This atomically creates:
   - 5 tables (`users`, `nodes`, `transactions`, `nonces`, `wallet_audit_logs`)
   - 6 performance indexes
   - Row-Level Security (RLS) policies
   - Seed data for default community stations and drivers

### 3. Link Environment Variables
In your `.env` file or cloud dashboard:
```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
SUPABASE_URL=https://[PROJECT_REF].supabase.co
SUPABASE_KEY=[SUPABASE_SERVICE_ROLE_KEY]
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[SUPABASE_ANON_KEY]
```

---

## ☁️ One-Click Cloud Platform Deployments

### Option 1: Railway (Recommended for Full-Stack)
1. Install Railway CLI: `npm i -g @railway/cli`
2. Link project: `railway init`
3. Deploy the backend:
   - Set Root Directory: `/backend`
   - Set Start Command: `python -m uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Deploy the frontend:
   - Set Root Directory: `/frontend`
   - Set Environment Variable: `NEXT_PUBLIC_API_URL=https://your-backend.railway.app/api`

### Option 2: Render.com
1. Create a **Web Service** pointing to your GitHub repo.
2. For Backend:
   - Environment: `Python 3`
   - Build Command: `pip install -r backend/requirements.txt`
   - Start Command: `cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 10000`
3. For Frontend:
   - Environment: `Node`
   - Build Command: `cd frontend && npm install && npm run build`
   - Start Command: `cd frontend && npm start`

### Option 3: Linux VPS (Ubuntu 22.04 / 24.04 LTS)
For total control on a $5/mo VPS (Hetzner, DigitalOcean, AWS EC2):

1. **Install Docker & Docker Compose**:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
   ```
2. **Clone the Repository**:
   ```bash
   git clone https://github.com/CANT-HACK-ANYTHING/KEPLER-why-not.git /opt/relayev
   cd /opt/relayev
   cp .env.example .env
   ```
3. **Configure SSL with Let's Encrypt / Certbot**:
   Use Certbot to provision free HTTPS certificates:
   ```bash
   sudo apt install certbot -y
   sudo certbot certonly --standalone -d relayev.yourdomain.com
   ```
4. **Start Production Stack**:
   ```bash
   docker compose up -d --build
   ```

---

## 🔒 Production Security Hardening Checklist

- [x] **Secret Rotation**: Change default `SECRET_KEY` in `.env` to a high-entropy 256-bit key:
  ```bash
  python -c "import secrets; print(secrets.token_hex(32))"
  ```
- [x] **CORS Origins**: Set `ALLOWED_ORIGINS` to your exact frontend domain (e.g. `https://relayev.app`) instead of `*`.
- [x] **Non-Root Execution**: Backend and frontend Dockerfiles run under unprivileged users (`relayev:10001` and `nextjs:1001`).
- [x] **Anti-Replay Protection**: Cryptographic nonce tracking active in both SQLite and PostgreSQL engines.
- [x] **Tamper Resistance**: Float billing mismatch tolerance strictly enforced to 0.15 INR in [`backend/security.py`](file:///d:/RelayEV/backend/security.py).
- [x] **Zero-Downtime Healthchecks**: Periodic Docker healthchecks on `http://localhost:8000/api/health` and `/health`.
