#!/usr/bin/env bash
# Shared helpers for per-framework init scripts.
#
# Sourced — DO NOT execute directly. Defines:
#   progress <step> <status> <pct> [msg]   → prints `PROGRESS {...json...}` to stdout
#   require_cmd <cmd>                       → exits non-zero if cmd missing
#   die <msg>                                → emits an error PROGRESS line + exits 1
#   read_customization_key <jq-path> [default] → echo a JSON value from $CUSTOMIZATION
#
# Every init script is expected to call `progress` at boundaries so the
# orchestrator can drive the loading UI.

# shellcheck disable=SC2155

progress() {
  local step="$1"
  local status="$2"
  local pct="$3"
  local msg="${4-}"
  # Use jq so we never emit malformed JSON even if msg has quotes/newlines.
  local blob
  blob=$(jq -nc \
    --arg step "$step" \
    --arg status "$status" \
    --argjson pct "$pct" \
    --arg msg "$msg" \
    '{step:$step, status:$status, pct:$pct, msg:$msg}')
  printf 'PROGRESS %s\n' "$blob"
  # Also append to /sandbox/.progress.jsonl so a resume can replay events.
  printf '%s\n' "$blob" >> /sandbox/.progress.jsonl 2>/dev/null || true
}

die() {
  local msg="$1"
  progress "init" "error" 0 "$msg"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found in image: $1"
}

# Read a value from the CUSTOMIZATION env JSON.
# Usage:
#   read_customization_key '.language' 'JavaScript'
read_customization_key() {
  local path="$1"
  local default="${2-}"
  local val
  if [ -z "${CUSTOMIZATION:-}" ]; then
    printf '%s' "$default"
    return
  fi
  val=$(printf '%s' "$CUSTOMIZATION" | jq -r "$path // empty" 2>/dev/null || true)
  if [ -z "$val" ] || [ "$val" = "null" ]; then
    printf '%s' "$default"
  else
    printf '%s' "$val"
  fi
}

# Returns 0 (true) if a checkbox group contains the given option id.
# Usage:
#   if customization_has '.tailwind' 'tailwind'; then ...; fi
customization_has() {
  local path="$1"
  local needle="$2"
  printf '%s' "${CUSTOMIZATION:-}" \
    | jq -e --arg n "$needle" "$path | type == \"array\" and (index(\$n) != null)" \
      >/dev/null 2>&1
}

# Marker file that downstream tooling (orchestrator + resume) consults.
write_port() {
  printf '%s' "$1" > /sandbox/.port
}
