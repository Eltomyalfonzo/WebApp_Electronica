# Imagen base de Node
FROM node:18

# Directorio de trabajo
WORKDIR /app

# Copiar los archivos del proyecto
COPY package*.json ./
RUN npm install

COPY . .

# Puerto que Render asigna automáticamente
ENV PORT=3000
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]

