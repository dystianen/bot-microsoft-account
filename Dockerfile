# Gunakan image Playwright resmi (Base-nya Ubuntu Jammy, sangat stabil)
FROM mcr.microsoft.com/playwright:v1.41.0-jammy

# Install Bun (karena image di atas belum ada Bun)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Install Playwright browser
RUN bunx playwright install chromium

# Copy semua file kode
COPY . .

# Jalankan bot
CMD ["bun", "run", "bot"]
