FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
RUN sha256sum package-lock.json | awk '{print $1}' > node_modules/.scripture-package-lock.sha256

COPY docker-entrypoint.sh /usr/local/bin/scripture-entrypoint
RUN chmod +x /usr/local/bin/scripture-entrypoint

COPY . .

EXPOSE 3000

ENTRYPOINT ["scripture-entrypoint"]
CMD ["npm", "run", "dev"]
