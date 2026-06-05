# Imagem base oficial do Node.js
FROM node:20-alpine

# Definir diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências (produção e dev para build)
RUN npm install

# Copiar todo o código-fonte
COPY . .

# Fazer o build do frontend (Vite) e do backend (esbuild)
RUN npm run build

# Expor a porta que o Cloud Run espera (8080)
EXPOSE 8080

# Definir variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=8080

# Iniciar a aplicação
CMD ["npm", "start"]
