FROM mcr.microsoft.com/playwright:v1.59.1-noble

RUN apt-get update && apt-get install -y unzip dumb-init && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY . .

# ✅ Use dumb-init as entrypoint
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["bun", "run", "bot"]