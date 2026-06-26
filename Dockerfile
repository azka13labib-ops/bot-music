# ============================================
# Dockerfile - Discord Music Bot (DisTube)
# HuggingFace Spaces Compatible
# ============================================

# Base image Node.js 18 (LTS, stabil)
FROM node:20-bullseye-slim

# Install dependensi sistem yang dibutuhkan DisTube:
# - ffmpeg     : untuk memproses audio
# - python3    : dibutuhkan yt-dlp
# - pip        : untuk install yt-dlp
# - git        : kadang dibutuhkan npm packages
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    git \
    curl \
    && pip3 install -U yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory di dalam container
WORKDIR /app

# Copy package.json duluan (untuk cache layer Docker)
COPY package*.json ./

# Copy folder patches SEBELUM npm install supaya postinstall jalan!
COPY patches ./patches/

# Install npm dependencies (skip postinstall agar @distube/yt-dlp tidak error)
# lalu jalankan patch-package secara manual
RUN npm install --ignore-scripts && npx patch-package

# Copy semua sisa file bot
COPY . .

# Arahkan @distube/yt-dlp ke binary yt-dlp yang sudah diinstall via pip
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

# Expose port 7860 (WAJIB untuk HuggingFace Spaces)
EXPOSE 7860

# Jalankan bot
CMD ["node", "index.js"]