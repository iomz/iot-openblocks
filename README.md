iot-openblocks
==============
TI CC2541 Sensor Tag and servo control for OpenBlocks Iot BX1

![https://raw.githubusercontent.com/iomz/iot-openblocks/master/docs/iot-openblocks.gif](https://raw.githubusercontent.com/iomz/iot-openblocks/master/docs/iot-openblocks.gif)

Synopsis
========
Fire up iot-openblocks to pub/sub to a MQTT broker

```sh
% git clone https://github.com/iomz/iot-openblocks.git
% cd iot-openblocks/nodejs && npm install
% node iot.js --ip `hostname -I | awk '{print $1}'` --servo
```

Modify /tmp/config.json if mac address of CC2541 needs to be specified.

```javascript
// config.json
{
  "mqtt": {
    "host": "test.mosquito.org",
    "port": 1883,
    "topic": "gif-iot",
    "interval": 100
  },
  "sensor": {
    "interval": 100,
    "mac": "78:A5:04:8C:29:BA"
  }
}
```

OpenBlocks
==========
Setup openblocks for iot-openblocks

```sh
% sudo iot-openblocks/script/setup.sh
```

To enable the bluetooth module:

```sh
% sudo iot-openblocks/script/blue.sh
```

To scan BL/BLE devices:

```sh
% hcitool scan # for BL
% hcitool lescan # for BLE
```

