iot-openblocks
==============
TI CC2541 Sensor Tag and servo control for OpenBlocks Iot BX1

Synopsis
========
Fire up iot-openblocks to HiveMQ

```sh
% git clone https://github.com/iomz/iot-openblocks.git
% cd iot-openblocks/nodejs
% node index.js
```

Edit device.config if mac address of CC2541 needs to be specified.

OpenBlocks
==========
To enable the bluetooth module:

```sh
% bluetooth_rfkill_event & 
% rfkill unblock bluetooth
% /etc/init.d/bluetooth start 
```

To scan BL/BLE devices:

```sh
% hcitool scan # for BL
% hcitool lescan # for BLE
```

