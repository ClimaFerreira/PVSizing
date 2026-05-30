# SolarDim

Aplicacao web para dimensionamento fotovoltaico, propostas e analise financeira.

## Requisitos

- Node.js 24
- Corepack ativado
- pnpm 10
- PostgreSQL 16

## Arranque local sem Replit

1. Copiar `.env.example` para `artifacts/api-server/.env` e ajustar `DATABASE_URL`, `SESSION_SECRET` e o login inicial.
2. Opcionalmente arrancar PostgreSQL local:

```powershell
docker compose up -d postgres
```

3. Instalar dependencias:

```powershell
corepack enable
corepack prepare pnpm@10.25.0 --activate
pnpm install
```

4. Criar/atualizar o esquema da base de dados:

```powershell
pnpm --filter @workspace/db run push
```

5. Arrancar a API:

```powershell
pnpm --filter @workspace/api-server run dev
```

6. Arrancar a app principal:

```powershell
pnpm --filter @workspace/pv-sizing run dev
```

A app abre por defeito em `http://localhost:5173` e usa a API em `http://localhost:3001`.

## Login inicial

O login e criado automaticamente quando a API arranca, usando:

- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`

Para varios utilizadores, usar `BOOTSTRAP_USERS_JSON` com uma lista de objetos no formato usado por `artifacts/api-server/src/lib/bootstrap-seed.ts`.

## Producao

Em producao definir sempre:

- `NODE_ENV=production`
- `DATABASE_URL`
- `SESSION_SECRET`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`

Depois:

```powershell
pnpm run build
pnpm --filter @workspace/api-server run start
```

O servidor serve a API e, quando existir build, tambem serve o frontend `pv-sizing`.
