# Build stage
FROM node:18.19.1-alpine AS builder

WORKDIR /build

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Install production dependencies
RUN npm ci --only=production

# Final stage
ARG BUILD_FROM
FROM ${BUILD_FROM:-ghcr.io/hassio-addons/base:14.2.2}

# Install Node.js
RUN apk add --no-cache nodejs

# Set work directory
WORKDIR /app

# Copy package file (for reference only)
COPY package.json ./

# Copy production dependencies and built application from builder
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist/ ./dist/

# Copy add-on files
COPY ha_addon/run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
