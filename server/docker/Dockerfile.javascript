# interview-sandbox-javascript:latest — minimal plain-JS sandbox

FROM node:20-bookworm-slim

ENV NODE_ENV=development \
    HOME=/home/sandbox

RUN apt-get update \
 && apt-get install -y --no-install-recommends jq tini ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash --uid 10001 sandbox \
 && mkdir -p /sandbox \
 && chown -R sandbox:sandbox /sandbox /home/sandbox

COPY scripts/lib/progress.sh    /usr/local/bin/lib/progress.sh
COPY scripts/init-javascript.sh /usr/local/bin/init
RUN chmod 0755 /usr/local/bin/init /usr/local/bin/lib/progress.sh

WORKDIR /sandbox
USER sandbox

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=4 \
  CMD curl -fsS http://127.0.0.1:8080 >/dev/null || exit 1

ENV FRAMEWORK=javascript

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/init"]
