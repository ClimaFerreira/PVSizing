# SolarDim

Full-stack PV solar sizing and financial analysis web app in Portuguese (Portugal). Supports invoice upload + AI parsing, automatic system sizing wizard, string sizing calculator, battery sizing, equipment datasheet import (AI), and PDF proposal export.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24, **TypeScript**: 5.9
- **Frontend**: React + Vite + Tailwind + shadcn/ui (`artifacts/pv-sizing`)
- **Backend**: Express 5 + Drizzle ORM + Zod (`artifacts/api-server`)
- **Database**: PostgreSQL
- **AI**: Anthropic Claude via `@workspace/integrations-anthropic-ai`
- **API codegen**: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- **Build**: esbuild (CJS bundle)

## Where things live

```
artifacts/
  api-server/src/routes/   — Express route handlers
    ai-tools.ts            — POST /tools/{parse-invoice,auto-size,battery-size,import-datasheet}
    proposals.ts           — POST/GET /proposals
  pv-sizing/src/
    pages/                 — React pages (wizard, proposals, panels, inverters, batteries, …)
    components/
      datasheet-import.tsx — AI datasheet upload widget (used in equipment forms)
      proposal-pdf.tsx     — Print-friendly proposal component
lib/
  api-spec/openapi.yaml    — Source-of-truth OpenAPI spec
  api-client-react/        — Generated React Query hooks + Zod schemas (never edit by hand)
  db/src/schema/           — Drizzle table definitions
  integrations-anthropic-ai/ — Anthropic client singleton
```

## Architecture decisions

- Contract-first: all endpoints defined in `openapi.yaml` before implementation; codegen produces typed hooks and Zod validators.
- AI routes use `multer` (memory storage) + Claude vision/document API for PDF and image files.
- Battery DB schema retains legacy columns (`tensaoNominal`, `potenciaCarga`, etc.); API only exposes `tensao` + `tecnologia`; route maps between them.
- Compatibility check (`GET /systems/:id/compatibility`) requires an existing system ID — disabled in the new-system creation form; available in system detail.
- PDF proposal export uses browser `window.print()` with a dedicated print-styled component (`proposal-pdf.tsx`); no external PDF library needed.

## Product

- Dashboard with summary KPIs
- Customer & system management (CRUD)
- Equipment catalogue: solar panels, inverters, batteries (with AI datasheet import)
- String sizing calculator
- Automatic sizing wizard (4 steps: consumption → location → equipment → results); invoice AI parsing in step 1
- Battery sizing calculator
- PVGIS solar production integration
- 25-year financial analysis (NPV, IRR, payback)
- Technical proposals (create, list, print/export)

## User preferences

- Language: Portuguese (Portugal) throughout UI and API messages
- Keep all user-facing text in PT-PT

## Gotchas

- Do **not** run `pnpm dev` at workspace root — use `restart_workflow` instead.
- After any OpenAPI change, always run codegen before typechecking: `pnpm --filter @workspace/api-spec run codegen`
- `@workspace/api-client-react` re-exports everything from the generated files — import types from it directly, never from the deep `src/generated/api.schemas` path.
- Batteries table has more DB columns than the API exposes; keep `batteries.ts` route mapping `tensao → tensaoNominal`.

## Pointers

- pnpm-workspace skill: `.local/skills/pnpm-workspace/SKILL.md`
- OpenAPI/codegen conventions: `.local/skills/pnpm-workspace/references/openapi.md`
- Server patterns: `.local/skills/pnpm-workspace/references/server.md`
- DB migrations: `.local/skills/pnpm-workspace/references/db.md`
