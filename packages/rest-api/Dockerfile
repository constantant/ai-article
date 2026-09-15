# Build context is the repo root (this image needs the whole npm workspace).
# docker build -f packages/rest-api/Dockerfile -t ai-article-rest-api .

FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 AS lambda-adapter

FROM node:24-slim AS builder
WORKDIR /workspace

# Manifests only first, so source-only changes below don't invalidate the
# (slow) npm ci layer.
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/package.json
COPY packages/rest-api/package.json packages/rest-api/package.json
COPY packages/mcp-server/package.json packages/mcp-server/package.json
RUN npm ci

COPY . .
# The generated Prisma client isn't committed (gitignored) — it must exist on
# disk before `nx build` can typecheck the files that import it, even though
# STORAGE_DRIVER=dynamodb means it's never actually connected to at runtime.
RUN cd packages/rest-api && npx prisma generate
RUN npx nx build rest-api

# --- Runtime image ---
# Any base works with the Lambda Web Adapter — it proxies Lambda invocations
# to a normal HTTP listener, so the app runs completely unmodified, exactly
# as it does locally. No handler-wrapping code needed.
FROM node:24-slim
WORKDIR /workspace
COPY --from=lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter

# node_modules is copied whole (not pruned) — Nx's lockfile-pruning tooling
# doesn't currently handle this project's dependency tree cleanly (Prisma's
# optional platform packages trip it up). Correctness over image size for now.
COPY --from=builder /workspace/node_modules ./node_modules
# npm nests some deps here instead of hoisting to the root (version
# conflicts with other workspace packages — e.g. swagger-ui-dist, dotenv@17,
# prisma@7 all resolve differently at the root). Without this, anything kept
# as a real runtime require() (webpack.config.js externals) resolves to
# nothing in prod — that's how swagger-ui-dist's static assets went missing.
COPY --from=builder /workspace/packages/rest-api/node_modules ./packages/rest-api/node_modules
# @org/schema is a workspace package resolved via a node_modules symlink —
# the symlink target must exist at the same relative path for it to resolve.
COPY --from=builder /workspace/packages/schema/dist ./packages/schema/dist
COPY --from=builder /workspace/packages/schema/package.json ./packages/schema/package.json
COPY --from=builder /workspace/packages/rest-api/dist ./packages/rest-api/dist

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "packages/rest-api/dist/main.js"]
