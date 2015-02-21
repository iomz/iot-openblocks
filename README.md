iot-openblocks
==============
TI CC2541 Sensor Tag and servo control for OpenBlocks Iot BX1

Synopsis
========
Fire up iot-openblocks to pub/sub to a MQTT broker

```sh
% git clone https://github.com/iomz/iot-openblocks.git
% cd iot-openblocks/nodejs
% node iot.js --ip `hostname -I | awk '{print $1}'`
```

Modify /var/local/config.json if mac address of CC2541 needs to be specified.

```sh
# config.json
{
  "mqtt": {
    "host": "test.mosquito.org",
    "port": 1883,
    "topic": "iot-openblocks",
    "interval": 1000
  },
  "interval": 1000,
}
```

OpenBlocks
==========
To enable the bluetooth module:

```sh
# blue.sh
% bluetooth_rfkill_event & 
% rfkill unblock bluetooth
% /etc/init.d/bluetooth start 
```

To scan BL/BLE devices:

```sh
% hcitool scan # for BL
% hcitool lescan # for BLE
```

