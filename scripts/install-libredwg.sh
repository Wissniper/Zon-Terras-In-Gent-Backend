#!/bin/bash
set -e
# Install build dependencies
apt-get update && apt-get install -y git build-essential autoconf automake libtool texinfo gettext pkg-config python3

# Clone and build libredwg
git clone --depth 1 https://github.com/LibreDWG/libredwg.git /tmp/libredwg
cd /tmp/libredwg
./autogen.sh
./configure --disable-bindings --disable-python
make -j$(nproc)
make install
ldconfig
