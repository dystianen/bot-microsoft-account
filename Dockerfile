FROM mcr.microsoft.com/playwright:v1.58.2-jammy

RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ✅ Setelah bun install, pakai playwright dari node_modules
RUN ./node_modules/.bin/playwright install chromium --with-deps

COPY . .

CMD ["bun", "run", "bot"]