# Harmattan: limits service + agent service + operator dashboard in one container (testnet demo).
FROM node:24-bookworm-slim
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ledger/package.json ledger/
COPY agent/package.json agent/
COPY limits/package.json limits/
COPY operator/package.json operator/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @harmattan/operator build

ENV NODE_ENV=production
EXPOSE 3400
CMD ["node", "scripts/start-all.ts"]
