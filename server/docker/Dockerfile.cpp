# interview-sandbox-cpp:latest

FROM debian:bookworm-slim

ENV HOME=/home/sandbox \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        g++ make jq tini ca-certificates curl gdb valgrind \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash --uid 10001 sandbox \
 && mkdir -p /sandbox \
 && chown -R sandbox:sandbox /sandbox /home/sandbox

COPY scripts/lib/progress.sh /usr/local/bin/lib/progress.sh
COPY scripts/init-cpp.sh     /usr/local/bin/init
RUN chmod 0755 /usr/local/bin/init /usr/local/bin/lib/progress.sh

WORKDIR /sandbox
USER sandbox

# No dev server — healthy as long as the sleep loop is alive.
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD pgrep -f 'tail -f /dev/null' >/dev/null || exit 1

ENV FRAMEWORK=cpp

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/init"]
