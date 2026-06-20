#!/usr/bin/env bash
# init-golang.sh
#
# Customization:
#   .gin      : array — contains "gin" to enable
#   .database : "PostgreSQL" | "MongoDB" | null

set -euo pipefail
# shellcheck source=lib/progress.sh
source /usr/local/bin/lib/progress.sh

require_cmd jq
require_cmd go

USE_GIN=0; customization_has '.gin' 'gin' && USE_GIN=1
DATABASE=$(read_customization_key '.database' '')

progress init starting 1 "golang / gin=$USE_GIN / db=${DATABASE:-none}"

cd /sandbox

if [ -f /sandbox/go.mod ]; then
  progress resume running 10
  go mod download >/dev/null 2>&1 || true
  progress resume done 90
else
  progress mod-init running 5
  go mod init sandbox >/dev/null 2>&1 || die "go mod init failed"
  progress mod-init done 20

  if [ "$USE_GIN" = "1" ]; then
    progress install running 30 "gin"
    go get github.com/gin-gonic/gin@latest >/tmp/install.log 2>&1 \
      || die "gin install failed: $(tail -5 /tmp/install.log)"
    cat > main.go <<'EOF'
package main

import "github.com/gin-gonic/gin"

func main() {
    r := gin.Default()
    r.GET("/", func(c *gin.Context) {
        c.JSON(200, gin.H{"ok": true, "hint": "edit main.go to start coding"})
    })
    _ = r.Run("0.0.0.0:8080")
}
EOF
  else
    cat > main.go <<'EOF'
package main

import (
    "encoding/json"
    "net/http"
)

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{
            "ok":   true,
            "hint": "edit main.go to start coding",
        })
    })
    _ = http.ListenAndServe("0.0.0.0:8080", nil)
}
EOF
  fi

  case "$DATABASE" in
    PostgreSQL)
      progress install running 60 "pgx driver"
      go get github.com/jackc/pgx/v5 >>/tmp/install.log 2>&1 || true
      ;;
    MongoDB)
      progress install running 60 "mongo driver"
      go get go.mongodb.org/mongo-driver/mongo >>/tmp/install.log 2>&1 || true
      ;;
  esac
  progress install done 80
  write_port 8080
fi

progress ready done 100 "go run ."
exec go run .
