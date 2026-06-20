#!/usr/bin/env bash
# Build every per-framework base image.
#
# Usage:  bash docker/scripts/build-all.sh [framework...]
# Defaults to all six frameworks if none specified.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# NOTE: `fullstack` is built FROM `interview-sandbox-node`, so node MUST come
# before fullstack here (and be built first if you pass an explicit subset).
ALL=(react node python golang javascript cpp fullstack)
TARGETS=("${@:-${ALL[@]}}")

cd "$DOCKER_DIR"

for fw in "${TARGETS[@]}"; do
  case "$fw" in
    react|node|python|golang|javascript|cpp|fullstack) ;;
    *) echo "unknown framework: $fw" >&2; exit 2 ;;
  esac
  tag="interview-sandbox-${fw}:latest"
  echo "==> building $tag"
  # The Dockerfiles COPY from scripts/ which is relative to this directory,
  # so the build context MUST be `docker/`, not the repo root.
  docker build -f "Dockerfile.${fw}" -t "$tag" .
done

echo
echo "Built: ${TARGETS[*]}"
docker images --filter 'reference=interview-sandbox-*' --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}'
