#!/usr/bin/env bash
# init-python.sh
#
# Customization:
#   .framework : "FastAPI" | "Django" | "Flask" | null

set -euo pipefail
# shellcheck source=lib/progress.sh
source /usr/local/bin/lib/progress.sh

require_cmd jq
require_cmd python3
require_cmd pip

FRAMEWORK=$(read_customization_key '.framework' '')

progress init starting 1 "python / framework=${FRAMEWORK:-none}"

cd /sandbox

if [ -d /sandbox/.venv ] && [ -f /sandbox/requirements.txt ]; then
  progress resume running 10
  /sandbox/.venv/bin/pip install -r /sandbox/requirements.txt >/tmp/install.log 2>&1 \
    || die "pip install failed during resume: $(tail -5 /tmp/install.log)"
  progress resume done 90
else
  progress venv running 5
  python3 -m venv /sandbox/.venv
  progress venv done 20
  # shellcheck disable=SC1091
  . /sandbox/.venv/bin/activate

  case "$FRAMEWORK" in
    FastAPI)
      progress install running 30 "fastapi + uvicorn"
      pip install --no-cache-dir fastapi 'uvicorn[standard]' >/tmp/install.log 2>&1 \
        || die "fastapi install failed: $(tail -5 /tmp/install.log)"
      echo -e "fastapi\nuvicorn[standard]" > requirements.txt
      cat > main.py <<'EOF'
from fastapi import FastAPI
app = FastAPI()

@app.get("/")
def root():
    return {"ok": True, "hint": "edit main.py to start coding"}
EOF
      write_port 8000
      progress install done 75
      progress ready done 100
      exec /sandbox/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
      ;;
    Django)
      progress install running 30 "django"
      pip install --no-cache-dir 'django>=5' >/tmp/install.log 2>&1 \
        || die "django install failed: $(tail -5 /tmp/install.log)"
      echo "django>=5" > requirements.txt
      progress scaffold running 60
      django-admin startproject app . >/dev/null
      write_port 8000
      progress scaffold done 85
      progress ready done 100
      exec python manage.py runserver 0.0.0.0:8000
      ;;
    Flask)
      progress install running 30 "flask"
      pip install --no-cache-dir flask >/tmp/install.log 2>&1 \
        || die "flask install failed: $(tail -5 /tmp/install.log)"
      echo "flask" > requirements.txt
      cat > app.py <<'EOF'
from flask import Flask, jsonify
app = Flask(__name__)

@app.get("/")
def root():
    return jsonify(ok=True, hint="edit app.py to start coding")
EOF
      write_port 5000
      progress install done 75
      progress ready done 100
      exec /sandbox/.venv/bin/flask --app app run --host 0.0.0.0 --port 5000 --debug
      ;;
    *)
      # No framework — plain python sandbox
      cat > main.py <<'EOF'
print("hello from the python sandbox — edit main.py and re-run")
EOF
      progress ready done 100 "no web server"
      exec tail -f /dev/null
      ;;
  esac
fi

# Resume path falls through to here only when an existing project is detected
# without a recognized framework — keep the loop alive for the terminal.
progress ready done 100 "resumed (no autostart)"
exec tail -f /dev/null
