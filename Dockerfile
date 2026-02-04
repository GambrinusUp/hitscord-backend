FROM node:20-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y \
  python3 \
  python3-pip \
  build-essential \
  pkg-config \
  libc6-dev \
  libssl-dev \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --verbose

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "dev"]
