## Personal Health Data Management Platform

This repository hosts a mobile-first personal health record (PHR) web application. It contains a React front-end that mirrors the high-fidelity prototype you provided, along with a Go (Gin) backend backed by PostgreSQL for secure data storage and aggregation.

### Key Capabilities

- **Authentication flows** – email + password, PIN code shortcut, and placeholder biometric entry points.
- **Report lifecycle** – upload (drag & drop or file select), tagging, remarks, encrypted storage badge, preview, share link placeholder, delete.
- **Archive search** – filter by tag/hospital/date, switch between timeline and card views, keyword search.
- **Metric capture & trends** – log weight, blood pressure, blood sugar and more; view trend charts with alerts for anomalies.
- **Mobile-first UI** – bottom navigation, status bar, and interaction microcopy ported from the provided prototype while remaining responsive on desktop.

---

## Project Structure

```
frontend/   # Vite + React + Tailwind UI with mock data and routing
backend/    # Go + Gin REST API, PostgreSQL persistence, demo seed data
migrations/ # SQL schema (optional – gorm AutoMigrate also enabled)
docker-compose.yml
```

---

## Frontend (React + Vite + Tailwind)

### Install & Run

```bash
cd frontend
npm install
cp .env.example .env            # optional: adjust VITE_API_BASE_URL
npm run dev                     # starts on http://localhost:5173
```

- **已接入后端 API**：前端现在使用真实的后端 API，不再使用 mock 数据。
- Charts are powered by `react-chartjs-2` with time-series adapters.
- Mobile layout is the primary experience; desktop adds an enhanced sidebar.
- Demo credentials: `demo@example.com / demo1234` or PIN `123456`.

### Available Scripts

| Command           | Purpose                              |
|-------------------|--------------------------------------|
| `npm run dev`     | Start development server             |
| `npm run build`   | Type-check and build for production  |
| `npm run preview` | Preview built assets locally         |

---

## Backend (Go + Gin + PostgreSQL)

### Prerequisites

- Go 1.24+
- PostgreSQL 13+ (or run with Docker Compose)

### Quick Start (local Go toolchain)

```bash
cd backend
cp .env.example .env
go run ./cmd/server
```

- Auto-migrates schema on start.
- Seeds a demo user (`demo@example.com / demo1234`, PIN `123456`) matching the UI.
- Accepts `X-User-ID` header for multi-user testing; defaults to demo user if omitted.

### Docker Compose (backend + database)

```bash
docker compose up --build
```

Services:

| Service   | Port | Notes                                     |
|-----------|------|-------------------------------------------|
| postgres  | 5432 | Default credentials `postgres / postgres` |
| backend   | 8080 | REST API served at `/api/v1`              |

### REST Endpoints

| Method & Path                | Description                                   |
|-----------------------------|-----------------------------------------------|
| `POST /api/v1/auth/login`   | Email + password login                        |
| `POST /api/v1/auth/pin`     | PIN-based login                               |
| `GET  /api/v1/reports`      | List reports (supports search, tag, hospital) |
| `POST /api/v1/reports`      | Create a report metadata record               |
| `GET  /api/v1/reports/:id`  | Fetch single report                           |
| `DELETE /api/v1/reports/:id`| Delete report                                 |
| `GET  /api/v1/metrics`      | List metric entries (filterable)              |
| `POST /api/v1/metrics`      | Record a new metric value                     |
| `GET  /api/v1/metrics/trend`| Aggregate summary + time-series               |
| `POST /api/v1/upload/file` | Upload file to Qiniu Cloud storage           |
| `GET  /healthz`             | Liveness probe                                |

> **Note**: File storage is integrated with **Qiniu Cloud**. Configure `QINIU_ACCESS_KEY` and `QINIU_SECRET_KEY` in environment variables.

### Build/Format

```bash
go fmt ./...
go build ./...
```

### Environment Variables (`backend/.env`)

| Variable                 | Description                                | Default (example)                      |
|--------------------------|--------------------------------------------|----------------------------------------|
| `DATABASE_URL`           | Postgres connection string                 | `postgres://postgres:postgres@...`     |
| `PORT`                   | API listening port                         | `8080`                                 |
| `CORS_ALLOWED_ORIGINS`   | CSV of allowed origins                     | `http://localhost:5173,...`            |
| `JWT_SECRET`             | HMAC secret key                            | `change-me`                            |
| `JWT_TOKEN_TTL`          | Access token lifetime                      | `24h`                                  |
| `QINIU_ACCESS_KEY`       | Qiniu Cloud Access Key (required)         | -                                      |
| `QINIU_SECRET_KEY`       | Qiniu Cloud Secret Key (required)          | -                                      |
| `QINIU_BUCKET`           | Qiniu Cloud bucket name                    | `health-body`                          |
| `QINIU_DOMAIN`           | Qiniu Cloud domain (optional)              | Auto-generated from bucket             |

---

## Integrating Frontend & Backend

1. Start PostgreSQL + backend (`docker compose up` or via Go).
2. Configure Qiniu Cloud credentials in `backend/.env`:
   ```env
   QINIU_ACCESS_KEY=your_access_key
   QINIU_SECRET_KEY=your_secret_key
   QINIU_BUCKET=health-body
   ```
3. Update `frontend/.env` with `VITE_API_BASE_URL=http://localhost:8080/api/v1`.
4. Use demo credentials (`demo@example.com / demo1234`) to test end-to-end flows.

---

## Testing Checklist

- **Frontend**
  - `npm run build` (type-check + compile)
  - Verify responsive layouts (mobile-first) for each screen.
- **Backend**
  - `go build ./...` (ensures all packages compile)
  - Optional: `curl` key endpoints to confirm status codes/content.

---

## Next Steps & Extensions

- Connect real file storage (S3, GCS) and generate signed URLs for report assets.
- Replace mock context data with live API integration on the React side.
- Add JWT auth middleware and refresh token persistence.
- Expand automated tests (component tests, API contract tests).

---

## License

This project is provided as-is for implementation reference. Update licensing terms here as needed.