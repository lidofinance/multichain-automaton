FROM node:20

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install poetry \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare yarn@4.5.1 --activate

COPY . .

ENV PATH="/opt/venv/bin:/root/.foundry/bin:$PATH"

RUN curl -L https://foundry.paradigm.xyz | bash
RUN foundryup

RUN chmod +x ./initialize.sh && ./initialize.sh

ENTRYPOINT ["yarn", "start"]
