apt-get install -y ntp git cmake libbluetooth-dev screen daemontools

# nodejs
if [ ! -e /usr/local/bin/node ]; then
    cd ~/node-v0.12.0 && make install
fi
mkdir -p ~/tmp && npm config set tmp ~/tmp

# mraa
if [ ! -e /usr/local/include/mraa ]; then
    cd ~ && git clone https://github.com/intel-iot-devkit/mraa.git
    mkdir -p mraa/build && cd $_
    cmake .. -BUILDSWIG=OFF -BUILDSWIGPYTHON=OFF -BUILDSWIGNODE=OFF && make && make install
    cp ~/i386-linux-gnu-local.conf /etc/ld.so.conf.d/ && ldconfig
fi

# iot-openblocks
cd /var/local && git clone https://github.com/iomz/iot-openblocks.git
cd /var/local/iot-openblocks/nodejs && npm install
cp /var/local/iot-openblocks/script/blue.sh /var/local/
cp /var/local/iot-openblocks/script/rainbow.sh /var/local/
sudo mv /etc/rc.local /etc/rc.local.old
cp /var/local/iot-openblocks/script/rc.local /etc/rc.local

# daemontools
mkdir -p /var/service/iot
chmod -R 0755 /var/service
cp /var/local/iot-openblocks/script/run /var/service/iot/run
chmod +x /var/service/iot/run

reboot

