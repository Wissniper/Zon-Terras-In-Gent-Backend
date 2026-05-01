#!/bin/bash
set -e

# Enable universe repo and try the pre-built package first
echo "Trying apt install (universe repo)..."
apt-get update -qq
apt-get install -y software-properties-common
add-apt-repository -y universe
apt-get update -qq

if apt-get install -y libredwg-utils 2>/dev/null; then
  echo "LibreDWG installed via apt."
  exit 0
fi

echo "libredwg-utils not available — building from source (this takes a while)..."

apt-get install -y git build-essential autoconf automake libtool texinfo gettext pkg-config python3

# Remove any leftover directory from a previous interrupted build
rm -rf /tmp/libredwg

git clone --depth 1 https://github.com/LibreDWG/libredwg.git /tmp/libredwg
cd /tmp/libredwg
./autogen.sh
./configure --disable-bindings --disable-python
make -j1
make install
ldconfig
