FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-thai-tlwg \
    fonts-noto \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN npx prisma generate && npm run build

EXPOSE 3010

CMD ["node", "dist/index.js"]