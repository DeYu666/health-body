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
frontend/              # Vite + React + Tailwind UI with backend API integration
backend/               # Go + Gin REST API, PostgreSQL persistence, demo seed data
  ├── cmd/server/      # Application entry point
  ├── internal/        # Internal packages (config, database, handlers, models, repository, service)
  └── migrations/      # SQL migration scripts (001_init.sql, 002_add_report_files.sql, 003_add_user_tags.sql)
docker-compose.yml     # Docker Compose configuration for backend and PostgreSQL
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
- **多文件上传**：支持一个报告上传多个文件，并显示上传进度。
- **报告编辑**：支持修改报告的标题、医院、日期、标签和备注。

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

- Auto-migrates schema on start (使用 GORM AutoMigrate).
- Seeds a demo user (`demo@example.com / demo1234`, PIN `123456`) matching the UI.
- JWT 认证：使用 JWT token 进行身份验证，支持 Bearer token 和 `X-User-ID` header。
- 文件上传：集成七牛云存储，支持上传到 Qiniu Cloud。

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

| Method & Path                    | Description                                   |
|----------------------------------|-----------------------------------------------|
| `POST /api/v1/auth/register`    | User registration                             |
| `POST /api/v1/auth/login`        | Email + password login                        |
| `POST /api/v1/auth/pin`          | PIN-based login                               |
| `GET  /api/v1/reports`           | List reports (supports search, tag, hospital) |
| `GET  /api/v1/reports/hospitals` | List all hospitals used by user               |
| `POST /api/v1/reports`           | Create a report metadata record               |
| `GET  /api/v1/reports/:id`       | Fetch single report                           |
| `PUT  /api/v1/reports/:id`       | Update report metadata                        |
| `DELETE /api/v1/reports/:id`     | Delete report                                 |
| `GET  /api/v1/metrics`           | List metric entries (filterable)              |
| `POST /api/v1/metrics`           | Record a new metric value                     |
| `GET  /api/v1/metrics/trend`     | Aggregate summary + time-series               |
| `POST /api/v1/upload/file`       | Upload file to Qiniu Cloud storage           |
| `GET  /healthz`                  | Liveness probe                                |

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

- ✅ File storage integration with Qiniu Cloud - 已完成
- ✅ JWT auth middleware - 已实现
- ⏳ User-level tag management API - 迁移脚本已准备，待实现后端 API
- ⏳ Refresh token persistence - 待实现
- ⏳ Expand automated tests (component tests, API contract tests) - 待实现
- ⏳ Report sharing with password protection - 数据库模型已准备，待实现 API

---

## License

This project is provided as-is for implementation reference. Update licensing terms here as needed.



改进点：
- ✅ 缺少注册 和 登出功能 - 已完成
- ✅ 删除报告功能异常 - 已修复
- ✅ 下载 和 分享功能异常 - 已实现
- ✅ 报告预览功能异常 - 已修复
- ✅ 一个档案中当前只允许上传一个报告，之后需要支持上传多个报告 - 已完成（数据库模型和前端已支持，迁移脚本已准备）
- ✅ 档案要支持修改，当前没有支持修改功能 - 已完成
- ⏳ 自定义后的标签也要能在其他档案中查看选择 - 迁移脚本已准备，后端 API 待实现
- ✅ （点击或拖拽文件到此处后）当前是显示上传进度0，之后需要支持实时上传，通过显示上传进度和上传文件的预览 - 已实现
- ✅ 医院/机构的信息在当前支持填写的基础上建议再支持下拉框选择，选择的医院就是其他档案中已经填写的医院/机构 - 已完成

## 已完成的改进

1. **用户注册和登出功能**
   - 后端：添加了 `/api/v1/auth/register` 端点
   - 前端：创建了注册页面，添加了登出按钮到侧边栏

2. **删除报告功能**
   - 已修复删除功能，现在可以正常删除报告

3. **下载和分享功能**
   - 实现了报告下载功能（通过文件URL）
   - 实现了分享链接生成和复制功能

4. **报告预览功能**
   - 修复了预览功能，现在可以正常显示报告预览图

5. **报告修改功能**
   - 后端：添加了 `PUT /api/v1/reports/:id` 端点
   - 前端：可以通过API更新报告信息

6. **上传进度显示**
   - 实现了实时上传进度显示
   - 支持文件预览（在上传前显示文件信息）

7. **医院/机构下拉框选择**
   - 后端：添加了 `GET /api/v1/reports/hospitals` 端点
   - 前端：医院输入框支持下拉选择已有医院或输入新医院

## 数据库迁移

项目包含以下数据库迁移脚本：

1. **`001_init.sql`** - 初始化数据库表结构（users, reports, metric_entries）
2. **`002_add_report_files.sql`** - 添加多文件支持
   - 创建 `report_files` 表
   - 自动将现有报告的文件信息迁移到新表
   - **状态**：数据库模型已实现，前端已支持多文件上传和展示
3. **`003_add_user_tags.sql`** - 用户级别标签管理
   - 创建 `user_tags` 表
   - 自动从现有报告的 tags 字段提取所有标签并创建用户级别标签
   - **状态**：迁移脚本已准备，后端 API 待实现

### 运行数据库迁移

迁移脚本可以在 PostgreSQL 中手动执行：

```bash
# 连接到数据库
psql -U postgres -d your_database_name

# 执行迁移脚本
\i backend/migrations/001_init.sql
\i backend/migrations/002_add_report_files.sql
\i backend/migrations/003_add_user_tags.sql
```

或者使用 Go 的数据库迁移工具（如 golang-migrate）来管理这些迁移。

**注意**：
- 迁移脚本已经考虑了现有数据的迁移
- `002_add_report_files.sql` 会将现有报告的文件信息复制到 `report_files` 表
- `003_add_user_tags.sql` 会从现有报告的 tags 字段提取所有标签并创建用户级别的标签记录
- 当前后端使用 GORM AutoMigrate，会自动创建表结构，但不会执行数据迁移逻辑

## 已修复的问题

1. ✅ **删除报告返回报错** - 已修复
   - 问题：DELETE 请求返回 204 No Content，但前端尝试解析 JSON 导致错误
   - 修复：更新了 `request` 方法以正确处理 204 响应

2. ✅ **下载报告返回报错** - 已修复
   - 问题：下载功能没有正确处理文件 URL
   - 修复：改进了 `downloadReport` 方法，使用正确的文件 URL 并创建下载链接

3. ✅ **多文件上传和展示** - 已实现
   - 后端：`ReportFile` 模型已实现，支持一个报告关联多个文件
   - 后端：报告创建和查询 API 已支持多文件
   - 前端：支持选择多个文件上传
   - 前端：支持在报告详情页面显示多个文件
   - 注意：如需迁移现有数据，请运行迁移脚本 `002_add_report_files.sql`