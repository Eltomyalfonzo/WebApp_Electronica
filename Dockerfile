FROM node:18

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar todo el proyecto (incluyendo index.html en la raíz)
COPY . .

# Exponer puerto
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]
