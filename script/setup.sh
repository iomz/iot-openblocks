#!/bin/bash
if [[ "`whoami`" != 'root' ]]; then
    echo "Run this script as root!"
    exit
fi

# apt packages
apt-get update && apt-get install -y ntpdate git curl libbluetooth-dev svtools python-dev cmake autoconf byacc yodl build-essential automake autotools-dev make libpcre3-dev 

# package path
SCRIPT=$(readlink -f $0)
PACKAGE_DIR=$(dirname $(dirname $SCRIPT))

# nodejs
if [ ! -e /usr/local/bin/node ]; then
    cd ~ && curl http://web.sfc.wide.ad.jp/~iomz/resource/node-v0.10.35-obsbx1-3.10.17-poky-edison.tgz | tar -xz
    cd ~/node-v0.10.35 && make install
fi
mkdir -p ~/tmp && npm config set tmp ~/tmp

# swig
if [ ! -e ~/swig ]; then
    cd ~ && git clone https://github.com/swig/swig.git
    cd swig && ./autogen.sh
    ./configure
    make && make install
fi

# mraa
if [ ! -e /usr/local/include/mraa ]; then
    git clone https://github.com/intel-iot-devkit/mraa.git ~/mraa
    mkdir -p ~/mraa/build && cd $_
    cmake -DBUILDSWIGNODE=OFF ..
    make && make install
    echo "/usr/local/lib/i386-linux-gnu/" > /etc/ld.so.conf.d/i386-linux-gnu-local.conf && ldconfig
fi

# iot-openblocks
cd $PACKAGE_DIR/nodejs && npm install

# install rc.local
if [ -L /etc/rc.local ] || [ -f /etc/rc.local ]; then
    mv /etc/rc.local /etc/rc.local.bak
fi
ln -fs $PACKAGE_DIR/script/rc.local /etc/rc.local

# install svtool script
mkdir -p /var/service && chmod 755 /var/service
chmod +t $PACKAGE_DIR/service/iot
chmod +x $PACKAGE_DIR/service/iot/run
chmod +x $PACKAGE_DIR/service/iot/log/run
ln -fs $PACKAGE_DIR/service/iot /var/service/iot

