# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install pnpm
RUN npm install -g pnpm@9

# Copy source files
COPY apps/platform-console ./apps/platform-console

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @mt5-platform/platform-console...

# Build
RUN pnpm --filter @mt5-platform/platform-console build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY apps/platform-console/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/apps/platform-console/dist /usr/share/nginx/html

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
