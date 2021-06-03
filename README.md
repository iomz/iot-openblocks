iot-openblocks
==============
TI CC2541 Sensor Tag and servo control for OpenBlocks Iot BX1

![guruguru-kun](https://user-images.githubusercontent.com/26181/118510973-c2897180-b731-11eb-9441-8722b461600a.gif)

Pairing LED
===========

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
Example
=======
Any MQTT client can consume the sensor data from CC2541. For example, with the MQTT plugin for Node-RED, we can create a simple logic like
```javascript
/* Parse a string received as MQTT message to a JSON object */
let data = JSON.parse(msg.payload);

/* Extract attributes stored in the JSON */
let accelX = data.accelX;
let accelY = data.accelY;

/* Compute the Theta and Phi from the acceleration along x/y axis */
let theta = -1 * Math.asin(accelY);
let phi = Math.asin(accelX/Math.cos(theta));

/* Compute the angles and translate them from radians to degrees */
let angleX = 180 * (theta / Math.PI) + 90;
let angleY = 180 * (phi / Math.PI) + 90;

return {
  payload: {
    pwm0: angleX,
    pwm1: angleY
  }
};
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

