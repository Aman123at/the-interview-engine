#!/usr/bin/env bash
# init-cpp.sh
#
# Customization:
#   .standard : "C++17" | "C++20"
#
# No dev server — the candidate compiles + runs from the integrated terminal.
# Init scaffolds a hello.cpp, performs a smoke-test compile to prove the
# toolchain works, then sleeps as PID 1.

set -euo pipefail
# shellcheck source=lib/progress.sh
source /usr/local/bin/lib/progress.sh

require_cmd jq
require_cmd g++
require_cmd make

STD=$(read_customization_key '.standard' 'C++20')
case "$STD" in
  "C++17") GCC_STD=c++17 ;;
  "C++20") GCC_STD=c++20 ;;
  *) die "unknown C++ standard: $STD" ;;
esac

progress init starting 1 "cpp / $STD"

cd /sandbox

if [ ! -f /sandbox/hello.cpp ]; then
  progress scaffold running 30
  cat > hello.cpp <<'EOF'
#include <iostream>

int main() {
    std::cout << "hello from the C++ sandbox" << std::endl;
    return 0;
}
EOF
  cat > Makefile <<EOF
CXX = g++
CXXFLAGS = -std=$GCC_STD -Wall -Wextra -O2

hello: hello.cpp
	\$(CXX) \$(CXXFLAGS) -o hello hello.cpp

clean:
	rm -f hello
EOF
  progress scaffold done 60
fi

progress smoke-compile running 70
g++ -std="$GCC_STD" -o /tmp/_smoke /sandbox/hello.cpp \
  || die "smoke compile failed — toolchain broken"
rm -f /tmp/_smoke
progress smoke-compile done 95

# No port for C++.
progress ready done 100 "terminal only (no dev server)"
exec tail -f /dev/null
