FROM node:20-bookworm-slim

# সিস্টেম আপডেট এবং প্রয়োজনীয় টুলস ও ফন্ট ইনস্টল
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# অফিশিয়াল Google Chrome Stable ইনস্টল (Remotion-এর জন্য সবচেয়ে ভালো)
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Remotion এবং Puppeteer-এর এনভায়রনমেন্ট সেটআপ
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV REMOTION_CHROME_EXECUTABLE=/usr/bin/google-chrome-stable
ENV NODE_ENV=production

WORKDIR /app

# প্রথমে শুধু package.json কপি করে ডিপেন্ডেন্সি ইনস্টল (দ্রুত বিল্ডের জন্য)
COPY package*.json ./
RUN npm install --omit=dev

# বাকি সব প্রজেক্ট ফাইল কপি করা
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
