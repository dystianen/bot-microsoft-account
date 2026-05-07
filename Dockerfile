FROM mcr.microsoft.com/playwright:v1.58.2-jammy

# Install dependencies for Bun
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

RUN bunx playwright install chromium

COPY . .

CMD ["bun", "run", "bot"]