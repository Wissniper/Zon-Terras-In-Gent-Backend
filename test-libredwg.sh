#!/bin/bash
set -e
apt-get update && apt-get install -y git build-essential autoconf automake libtool texinfo gettext
git clone --depth 1 https://github.com/LibreDWG/libredwg.git /tmp/libredwg
cd /tmp/libredwg
sh autogen.sh
./configure --disable-shared --disable-bindings
make -j$(nproc)
make install
