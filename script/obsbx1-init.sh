#!/bin/bash
if [[ "`whoami`" != 'root' ]]; then
    echo "Run this script as root!"
    exit
fi

# apt packages
apt-get update && apt-get install -y ntp git curl cmake libbluetooth-dev screen svtools

# nodejs
if [ ! -e /usr/local/bin/node ]; then
    cd ~ && curl http://web.sfc.wide.ad.jp/~iomz/resource/node-v0.12.0-obsbx1-3.10.17-poky-edison.tgz | tar -xz
    cd ~/node-v0.12.0 && make install
fi
mkdir -p ~/tmp && npm config set tmp ~/tmp

# mraa
if [ ! -e /usr/local/include/mraa ]; then
    git clone https://github.com/intel-iot-devkit/mraa.git ~/mraa
    mkdir -p ~/mraa/build && cd $_
    cmake .. -BUILDSWIG=OFF -BUILDSWIGPYTHON=OFF -BUILDSWIGNODE=OFF
    make && make install
    echo "/usr/local/lib/i386-linux-gnu/" > /etc/ld.so.conf.d/i386-linux-gnu-local.conf && ldconfig
fi

# iot-openblocks
if [ ! -e ~/iot-openblocks ]; then
    git clone https://github.com/iomz/iot-openblocks.git ~/iot-openblocks
    cd ~/iot-openblocks/nodejs && npm install
fi
mkdir -p /var/local
if [ -f /etc/rc.local ]; then
    mv /etc/rc.local /etc/rc.local.old
fi
ln -fs $HOME/iot-openblocks/script/rc.local /etc/rc.local
ln -fs $HOME/iot-openblocks/script/blue.sh /var/local/
ln -fs $HOME/iot-openblocks/script/rainbow.sh /var/local/
ln -fs $HOME/iot-openblocks/nodejs /var/local/nodejs
mkdir -p /var/service && chmod 755 /var/service
ln -fs $HOME/iot-openblocks/service/iot /var/service/iot

reboot

