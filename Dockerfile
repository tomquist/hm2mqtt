FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript code
RUN npm run build

# Clean up development dependencies
RUN npm ci --only=production

# Set environment variables
ENV NODE_ENV=production

# Expose MQTT port if needed
# EXPOSE 1883

# Start the application
CMD ["node", "dist/index.js"]
