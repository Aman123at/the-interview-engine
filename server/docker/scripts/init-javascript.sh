#!/usr/bin/env bash
# init-javascript.sh — minimal plain-JS sandbox.
# No customization knobs (per Phase 4a config).

set -euo pipefail
# shellcheck source=lib/progress.sh
source /usr/local/bin/lib/progress.sh

require_cmd jq
require_cmd node

progress init starting 1 "javascript / plain"

cd /sandbox

if [ ! -f /sandbox/index.js ]; then
  progress scaffold running 30
  cat > index.js <<'EOF'
import http from 'node:http';
const PORT = Number(process.env.PORT ?? 8080);
http
  .createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, hint: 'edit index.js to start coding' }));
  })
  .listen(PORT, '0.0.0.0', () => console.log(`listening on ${PORT}`));
EOF
  cat > package.json <<'EOF'
{ "name": "sandbox", "version": "0.0.0", "type": "module", "scripts": { "dev": "node --watch index.js" } }
EOF
  progress scaffold done 80
fi

write_port 8080
progress ready done 100
exec node --watch index.js
