# 健康档案管理前端应用

基于 React + TypeScript + Vite 构建的个人健康数据管理 Web 应用。

## 功能特性

- 📊 健康指标记录与趋势分析
- 📄 医疗报告上传与管理
- 🔐 安全的用户认证（邮箱/密码、PIN 码）
- 📱 响应式设计，支持移动端和桌面端

## 后端 API 配置

应用已配置为使用后端 API 获取数据。默认情况下，API 基础 URL 为 `http://localhost:8080/api/v1`。

### 配置 API 地址

1. 创建 `.env` 文件（如果不存在）：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，设置后端 API 地址：
```env
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

如果后端运行在不同的地址或端口，请相应修改此值。

## 开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

应用将在 `http://localhost:5173` 启动。

### 构建生产版本

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 技术栈

- **React 19** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **React Router** - 路由管理
- **Chart.js** - 数据可视化

## 项目结构

```
src/
├── components/     # React 组件
├── context/        # React Context (认证、应用状态)
├── lib/           # 工具函数和 API 客户端
├── pages/         # 页面组件
├── types/         # TypeScript 类型定义
└── data/          # Mock 数据（已弃用，现在使用后端 API）
```

## 注意事项

- 确保后端服务正在运行
- 所有 API 请求都需要有效的认证 token
- 首次登录后，token 会保存在 localStorage 中
- 如果后端 API 地址不同，请修改 `.env` 文件中的 `VITE_API_BASE_URL`
