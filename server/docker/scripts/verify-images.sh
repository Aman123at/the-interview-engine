#!/usr/bin/env bash
# verify-images.sh — boot each base image, run init with a representative
# customization, assert the scaffold landed in the volume + the .port marker
# was written (where applicable). Tears down volumes + containers between
# checks so it's safe to re-run.
#
# Usage: bash docker/scripts/verify-images.sh [framework...]
#
# Written without bash 4 associative arrays so it works on the bash 3.2 that
# ships with macOS.

set -euo pipefail

ALL="react node python golang javascript cpp"
TARGETS="${*:-$ALL}"

# Look up the table of representative inputs by framework name.
customization_for() {
  case "$1" in
    react)      echo '{"language":"JavaScript","bundler":"Vite","tailwind":["tailwind"],"shadcn":[]}';;
    node)       echo '{"language":"JavaScript","express":["express"],"database":null}';;
    python)     echo '{"framework":"FastAPI"}';;
    golang)     echo '{"gin":["gin"],"database":null}';;
    javascript) echo '{}';;
    cpp)        echo '{"standard":"C++20"}';;
  esac
}
expect_file_for() {
  case "$1" in
    react|node) echo 'package.json';;
    python)     echo 'main.py';;
    golang)     echo 'go.mod';;
    javascript) echo 'index.js';;
    cpp)        echo 'hello.cpp';;
  esac
}
expect_port_for() {
  case "$1" in
    cpp) echo 0;;
    *)   echo 1;;
  esac
}

# How long to give init before declaring success (it's allowed to be slow;
# we only need the scaffold to land, not the dev server to be fully up).
INIT_WAIT_SECONDS=${INIT_WAIT_SECONDS:-90}

PASS_LIST=""
FAIL_LIST=""

cleanup() {
  local name="$1"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker volume rm -f "${name}_vol" >/dev/null 2>&1 || true
}

for fw in $TARGETS; do
  case "$fw" in
    react|node|python|golang|javascript|cpp) ;;
    *) echo "unknown framework: $fw" >&2; exit 2 ;;
  esac

  tag="interview-sandbox-${fw}:latest"
  name="isb-verify-${fw}-$$"
  vol="${name}_vol"
  customization="$(customization_for "$fw")"
  expect_file="$(expect_file_for "$fw")"
  expect_port="$(expect_port_for "$fw")"

  echo "============================================================"
  echo "verifying  $tag"
  echo "  customization: $customization"
  echo "============================================================"

  if ! docker image inspect "$tag" >/dev/null 2>&1; then
    echo "  SKIP — image not built. run: bash docker/scripts/build-all.sh $fw"
    FAIL_LIST="$FAIL_LIST $fw(image-missing)"
    continue
  fi

  docker volume create "$vol" >/dev/null

  if ! docker run -d --rm --name "$name" \
         --user 10001:10001 \
         --memory 1g --cpus 1.0 --pids-limit 256 \
         --cap-drop ALL --security-opt no-new-privileges:true \
         -v "${vol}:/sandbox" \
         -e CUSTOMIZATION="$customization" \
         -e FRAMEWORK="$fw" \
         "$tag" >/dev/null; then
    echo "  FAIL — docker run failed"
    FAIL_LIST="$FAIL_LIST $fw(run-failed)"
    cleanup "$name"
    continue
  fi

  ok=0
  for i in $(seq 1 "$INIT_WAIT_SECONDS"); do
    if docker exec "$name" test -f "/sandbox/${expect_file}" 2>/dev/null; then
      if [ "$expect_port" = "1" ]; then
        if docker exec "$name" test -f "/sandbox/.port" 2>/dev/null; then
          ok=1; break
        fi
      else
        ok=1; break
      fi
    fi
    sleep 1
  done

  if [ "$ok" = "1" ]; then
    port_info=""
    if [ "$expect_port" = "1" ]; then
      port_info=" (port=$(docker exec "$name" cat /sandbox/.port 2>/dev/null || echo '?'))"
    fi
    echo "  PASS — found /sandbox/${expect_file}${port_info}"
    PASS_LIST="$PASS_LIST $fw"
  else
    echo "  FAIL — /sandbox/${expect_file} or /sandbox/.port missing after ${INIT_WAIT_SECONDS}s"
    echo "  --- recent container logs ---"
    docker logs --tail 50 "$name" 2>&1 | sed 's/^/    /'
    FAIL_LIST="$FAIL_LIST $fw(timeout)"
  fi

  cleanup "$name"
done

echo
echo "============================================================"
echo "Summary"
echo "============================================================"
[ -n "$PASS_LIST" ] && echo "PASS:$PASS_LIST"
if [ -n "$FAIL_LIST" ]; then
  echo "FAIL:$FAIL_LIST"
  exit 1
fi
exit 0
