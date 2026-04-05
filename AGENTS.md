# AGENTS.md — NoteAI Codebase Guide

This file provides instructions for agentic coding agents working in this repository.

---

## Project Overview

NoteAI is a full-stack AI-powered teaching assistant for Hong Kong educators. It is a monorepo with two sub-projects:

- **`frontend/`** — Next.js 16 (App Router), React 19, TypeScript
- **`backend/`** — Python FastAPI, SQLAlchemy, PostgreSQL

The stack is orchestrated via Docker Compose (`compose.yml`): `backend`, `noteai-anythingllm`, `postgres`, `pgadmin`.

---

## Build, Dev, and Lint Commands

All frontend commands must be run from the `frontend/` directory.

```bash
# Development server (binds to 0.0.0.0 for LAN access)
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Lint (ESLint v9 flat config)
npm run lint
```

### No Test Suite

There is currently **no testing framework** configured. No `jest`, `vitest`, `playwright`, or `cypress`. No `test` script exists in `package.json` and no test files exist in the codebase. Do not add test boilerplate without being asked.

### Running the Backend

```bash
# Via Docker Compose (recommended)
docker compose up

# Backend alone (from backend/)
uvicorn main:app --reload --port 8000
```

---

## Repository Structure

```
noteai/
├── compose.yml              # Docker Compose for full stack
├── frontend/                # Next.js App Router frontend
│   ├── app/                 # Routes (App Router)
│   │   ├── layout.tsx       # Root layout (fonts, Providers)
│   │   ├── globals.css      # Tailwind + global styles
│   │   ├── login/
│   │   ├── register/
│   │   └── (app)/           # Auth-protected route group
│   │       ├── layout.tsx   # App shell (auth guard, Sidebar, Topbar)
│   │       └── courses/     # Main feature routes
│   ├── components/
│   │   ├── layout/          # Sidebar, Topbar
│   │   ├── shared/          # Reusable UI (badges, spinners, dialogs)
│   │   └── lesson-plan/     # Feature-specific components
│   ├── hooks/               # Custom React hooks
│   ├── lib/
│   │   ├── api.ts           # Axios client + all API functions + all TS types
│   │   ├── auth-store.ts    # Zustand auth store
│   │   ├── queryClient.ts   # TanStack Query client config
│   │   └── utils.ts         # cn() helper (clsx + tailwind-merge)
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   └── package.json
└── backend/
    ├── main.py              # FastAPI app entry point
    ├── models/              # SQLAlchemy ORM models
    ├── routers/             # Route handlers
    ├── schemas/             # Pydantic schemas
    └── requirements.txt
```

---

## TypeScript Configuration

- **Strict mode is on** (`"strict": true`) — `strictNullChecks`, `noImplicitAny`, etc. are all active.
- **`@/` path alias** maps to the `frontend/` root (configured in `tsconfig.json`).
- `isolatedModules: true` — every file must be independently transpilable.
- `moduleResolution: "bundler"` — modern bundler-aware resolution.

---

## Import Conventions

Use the **`@/` alias** for all absolute imports from within `frontend/`:

```typescript
import { useAuthStore } from "@/lib/auth-store";
import { coursesApi, type Course } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { useAuth } from "@/hooks/useAuth";
```

Use **relative imports** only for sibling files in the same directory:

```typescript
import { AnswersDisplay } from "./answers-display";
```

Use **`import type`** when importing type-only symbols:

```typescript
import type { LessonPlanStatus } from "@/lib/api";
import type { MenuProps } from "antd";
```

All shared TypeScript types (domain models) live in `lib/api.ts` alongside the API functions.

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Components (exported) | PascalCase | `LessonPlanToolbar` |
| Page components | PascalCase + `Page` suffix, `default` export | `CoursesPage` |
| Inner/private components | PascalCase, not exported | `QuestionBuilder` |
| Hooks | camelCase, `use` prefix | `useAuth`, `useSyllabusJob` |
| API namespaces | camelCase | `coursesApi`, `lessonPlansApi` |
| Interfaces/types | PascalCase, no `I` prefix | `Course`, `LessonPlanStatus` |
| Variables/functions | camelCase | `queryClient`, `handleSubmit` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE_MB`, `STORAGE_KEY` |
| File names | kebab-case | `lesson-plan-toolbar.tsx`, `auth-store.ts` |
| Event handlers | `handle` prefix (internal) / `on` prefix (props) | `handleSave`, `onUpload` |

---

## Code Style Guidelines

### Components

- All interactive components must have `"use client"` at the top.
- Server Components are used only at the layout level.
- Page components use `use(params)` (React 19) to unwrap dynamic route params:

```typescript
export default function LessonPlanPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id: courseId, cid: chapterId } = use(params);
```

- Prop types are defined as a local `interface Props` or inline object type.

### Linting

ESLint v9 flat config is used (`eslint.config.mjs`), with `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`. Run `npm run lint` before committing.

There is no Prettier configured — do not add a Prettier config without being asked.

### React Compiler

`reactCompiler: true` is enabled in `next.config.ts` via `babel-plugin-react-compiler`. Do not add manual `useMemo`/`useCallback` calls; the compiler handles memoization automatically.

---

## State Management

### Server State — TanStack Query v5

- `QueryClient` is configured with `staleTime: 60s`, `retry: 1`.
- `useQueryClient()` is abbreviated as `qc` throughout the codebase.
- Query keys follow the structure: `[resourceName, ...ids]`.

```typescript
const qc = useQueryClient();
const { data: plan } = useQuery({
  queryKey: ["lesson-plan", courseId, chapterId],
  queryFn: () => lessonPlansApi.get(courseId, chapterId),
});
```

- Mutations invalidate or update the query cache on success:

```typescript
const saveMutation = useMutation({
  mutationFn: (data) => lessonPlansApi.update(courseId, chapterId, data),
  onSuccess: () => {
    message.success("已儲存");
    qc.invalidateQueries({ queryKey: ["lesson-plan", courseId, chapterId] });
  },
  onError: () => message.error("儲存失敗"),
});
```

### Auth State — Zustand v5

- Single store in `lib/auth-store.ts`: `setAuth(user, token)`, `clearAuth()`, `hydrate()`.
- Token stored in `localStorage` and a cookie (for middleware access).

### Local State

- React `useState` and `useRef` for UI-only state (modal visibility, form values, streaming buffers, timers).

---

## Error Handling Patterns

- **Mutation errors:** Use `onError` callback with `message.error()` from `App.useApp()`.
- **Async handlers:** `try/catch` blocks; show `message.error()` in the catch. Use empty `catch {}` (no variable) when the error is not needed.
- **HTTP 401:** A global axios interceptor in `lib/api.ts` clears auth and redirects to `/login`.
- **Axios error detection:** Use `axios.isAxiosError(error)` to distinguish response errors from network errors.
- **Query loading/error states:** Standard conditional renders using `isLoading` and `!data`.
- **SSE streaming errors:** `try/catch` around `fetch()` + `ReadableStream` reader; rollback optimistic state in the catch.

```typescript
// Standard pattern
try {
  await someAsyncOperation();
} catch {
  message.error("Operation failed");
} finally {
  setLoading(false);
}
```

---

## Styling

- **Ant Design v6** is the primary UI library. Use Ant Design components for all UI.
- **Ant Design Icons** (`@ant-design/icons`) for all icons.
- **Inline styles** (`style={{ ... }}` props) are the dominant layout approach for spacing, dimensions, and flexbox — follow existing patterns in the file you are editing.
- **Tailwind CSS v4** is available for utility classes but used sparingly as a supplement.
- **`cn()`** from `lib/utils.ts` (wraps `clsx` + `tailwind-merge`) is available for conditional className composition.
- **No CSS Modules**, no `styled-components`, no `emotion`.
- The Ant Design theme (primary color `#1677ff`, border-radius `8px`) is configured in `components/providers.tsx`.

---

## UI / Notifications

Use `App.useApp()` from Ant Design (not the static `message` import) for all notifications:

```typescript
const { message, modal, notification } = App.useApp();
message.success("Saved");
message.error("Failed to save");
```

Pages are wrapped in `<App>` inside `providers.tsx`, so `App.useApp()` is always available.

---

## Backend (Python / FastAPI)

- Entry point: `backend/main.py`
- ORM models in `backend/models/`, Pydantic schemas in `backend/schemas/`
- Route handlers in `backend/routers/` (one file per domain: `auth`, `courses`, `chapters`, `assignments`, etc.)
- Database session dependency injected via `backend/deps.py`
- Auth via JWT (`python-jose`), hashing via `bcrypt`
- Database migrations managed with **Alembic**

---

## Mixed Language UI

The codebase contains Traditional Chinese (`zh-TW`) UI strings inline in JSX for the lesson plan editor and chapter pages (targeting Hong Kong teachers). This is intentional. Do not translate or replace these strings with English.

---

## Key Patterns to Follow

- Co-locate small, page-specific components in the same file as the page rather than extracting them to `components/`.
- All API functions and shared TypeScript types belong in `lib/api.ts`.
- Follow the existing `queryKey` naming pattern: `[resourceName, ...ids]`.
- Role-based UI gating uses `isTeacher`/`isStudent` booleans from `useAuth()` within a single component — no separate per-role route files.
