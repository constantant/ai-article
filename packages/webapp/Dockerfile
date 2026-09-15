# Build context is the repo root (this image needs the whole npm workspace).
# docker build -f packages/webapp/Dockerfile -t ai-article-webapp .

FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 AS lambda-adapter

FROM node:24-slim AS builder
WORKDIR /workspace

# Manifests only first, so source-only changes below don't invalidate the
# (slow) npm ci layer. webapp itself has no package.json (Angular app deps
# live in the root package.json).
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/package.json
COPY packages/rest-api/package.json packages/rest-api/package.json
COPY packages/mcp-server/package.json packages/mcp-server/package.json
RUN npm ci

COPY . .
RUN npx nx build webapp

# --- Runtime image ---
FROM node:24-slim
WORKDIR /workspace
COPY --from=lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter

# node_modules is copied whole (not pruned) — see rest-api/Dockerfile for why.
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/packages/schema/dist ./packages/schema/dist
COPY --from=builder /workspace/packages/schema/package.json ./packages/schema/package.json
# webapp's build output lands at the workspace root (dist/packages/webapp),
# not under packages/webapp — set by project.json's outputPath.
COPY --from=builder /workspace/dist/packages/webapp ./dist/packages/webapp

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/packages/webapp/server/server.mjs"]
