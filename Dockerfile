# --------------------------------------------
# Builder stage – installs all deps & compiles
# --------------------------------------------
FROM node:22-alpine AS builder

# Create app directory
WORKDIR /app

# Copy package manifests first for better layer caching
COPY package*.json ./

# Install ALL dependencies (incl. dev) required for building
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build client (Vite) & server (TypeScript)
RUN npm run build

# --------------------------------------------
# Runtime stage – smaller image with prod deps
# --------------------------------------------
FROM node:22-alpine

# Create app directory
WORKDIR /app

# Copy only production package manifests and install prod deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S scrumpoker -u 1001 \
  && chown -R scrumpoker:nodejs /app
USER scrumpoker

# Ensure production mode so server serves built client
ENV NODE_ENV=production

# Expose application port
EXPOSE 3000

# Health check (ensure server responds with 200)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the compiled server
CMD ["node", "dist/server/index.js"]
