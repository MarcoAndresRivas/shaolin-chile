# The API as a container (used by Northflank). Build context: backend/.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
