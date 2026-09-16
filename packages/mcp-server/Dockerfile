# Build context is the repo root (this image needs the whole npm workspace).
# docker build -f packages/mcp-server/Dockerfile -t ai-article-mcp-server .
#
# This builds the HTTP/OAuth entrypoint (build-http -> dist-http/http-main.js)
# for the deployed remote MCP connector — NOT the stdio entrypoint used by
# the Claude Code plugin / Desktop Extension, which is built separately via
# the `bundle` Nx target (see scripts/build-distribution.mjs) and never
# touches this Dockerfile.

FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 AS lambda-adapter

FROM node:24-slim AS builder
WORKDIR /workspace

# Manifests only first, so source-only changes below don't invalidate the
# (slow) npm ci layer.
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/package.json
COPY packages/mcp-server/package.json packages/mcp-server/package.json
RUN npm ci

COPY . .
RUN npx nx build-http mcp-server

# --- Runtime image ---
# Any base works with the Lambda Web Adapter — it proxies Lambda invocations
# to a normal HTTP listener, so the app runs completely unmodified, exactly
# as it does locally. No handler-wrapping code needed.
FROM node:24-slim
WORKDIR /workspace
COPY --from=lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter

COPY --from=builder /workspace/node_modules ./node_modules
# @org/schema is a workspace package resolved via a node_modules symlink —
# the symlink target must exist at the same relative path for it to resolve.
COPY --from=builder /workspace/packages/schema/dist ./packages/schema/dist
COPY --from=builder /workspace/packages/schema/package.json ./packages/schema/package.json
COPY --from=builder /workspace/packages/mcp-server/dist-http ./packages/mcp-server/dist-http

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "packages/mcp-server/dist-http/http-main.js"]
