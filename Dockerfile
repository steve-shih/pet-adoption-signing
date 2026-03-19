FROM node:20-alpine AS base

WORKDIR /app

# 只先複製 package.json 與 lock 檔，先安裝相依
COPY package*.json ./
RUN npm ci --only=production

# 複製其餘程式碼
COPY . .

# 暴露 5000 埠（Express 伺服器預設埠）
EXPOSE 5000

# 直接以 node 執行（若想使用 PM2，可改成 pm2-runtime）
CMD ["node", "server.js"]
