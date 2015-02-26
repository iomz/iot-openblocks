//*****************************************************************************
// Copyright (c) 2015 Auto-ID Lab. Japan
// Make Intel Edison's BLE module for connecting a Texas Instruments SenstorTag CC2451
//
// Contributors:
//  Iori MIZUTANI (iori.mizutani@gmail.com)
//*****************************************************************************
var async = require("async"), fs = require("fs"), Cylon = require("cylon"), getmac = require("getmac"), mqtt = require("mqtt"), nconf = require("nconf"), SensorTag = require("sensortag"), spawn = require("child_process").spawn, path = require("path");

// constants
var scriptDir = path.resolve(__dirname, "../script");

// blink led like rainbow
var rainbowScript = path.join(scriptDir, "rainbow.sh");

// tmp directory
var tmpDir = "/tmp";

// store configs 
var configFile = path.join(tmpDir, "config.json");

// store mqtt broker hostname
var brokerFile = path.join(tmpDir, "broker");

// store paired sensor's mac address
var sensorMacFile = path.join(tmpDir, "sensor_mac");

// store process pid
var pidFile = path.join(tmpDir, "iot.pid");

// default broker
//var broker = "broker.mqttdashboard.com";
var broker = "lain.sfc.wide.ad.jp";

// mqtt broker host to connect
var mqttHost = null;

// mqtt broker port to connect
var mqttPort = 1883;

// mqtt topic for publish and subscription
var mqttTopic = "gif-iot";

// mqtt publish interval in milliseconds
var mqttInterval = 100;

// sensor update interval in milliseconds
var sensorInterval = 100;

// servo control interval in milliseconds
var servoInterval = 200;

// if configurations are fully loaded
var configured = false;

// mqtt client
var mqttClient = null;

// pending notifier pid
var pendingNotifier = null;

/* mac address to discover
 * unless provided => undefined to connect to any tag discovered */
var macToDiscover = undefined;

/* object to store data from sensor tag */
var tagData = {};

tagData.payload = {};

tagData.payload.deviceMac = null;

tagData.payload.sensorMac = null;

tagData.toJson = function() {
    return JSON.stringify(this.payload);
};

tagData.publish = function() {
    mqttClient.publish(mqttTopic + "/data/" + tagData.payload.sensorMac, tagData.toJson());
};

tagData.publishInfo = function(nodeStatus) {
    // TODO: assert IP address in a correct format
    var info = JSON.stringify({
        ip: this.payload.ip,
        sensorMac: this.payload.sensorMac,
        deviceMac: this.payload.deviceMac,
        nodeStatus: nodeStatus
    });
    mqttClient.publish("gif-iot/status", info);
    if (nodeStatus != "pending") console.log("*** [MQTT:gif-iot/status] " + info);
};

/* object array to store servo motor info */
var servos = [];

for (var i = 0; i < 4; i++) {
    servos[i] = {};
    servos[i].enabled = false;
    servos[i].angle = 0;
    switch (i) {
      // initialize pins
        case 0:
        servos[i].pin = 20;
        break;

      case 1:
        servos[i].pin = 14;
        break;

      case 2:
        servos[i].pin = 0;
        break;

      case 3:
        servos[i].pin = 21;
        break;
    }
}

// read the config file
function readConfig() {
    nconf.argv().file({
        file: configFile
    });
    if (nconf.get("servo")) {
        for (var i = 0; i < servos.length; i++) {
            servos[i].enabled = true;
        }
    }
    mqttHost = mqttHost || nconf.get("mqtt:host") || broker;
    mqttPort = nconf.get("mqtt:port") || mqttPort;
    mqttTopic = nconf.get("mqtt:topic") || mqttTopic;
    mqttInterval = nconf.get("mqtt:interval") || mqttInterval;
    sensorInterval = nconf.get("sensor:interval") || sensorInterval;
    tagData.payload.ip = nconf.get("ip");
    if (!tagData.payload.sensorMac && nconf.get("sensor:mac")) {
        tagData.payload.sensorMac = nconf.get("sensor:mac");
    }
    if (tagData.payload.sensorMac) {
        macToDiscover = tagData.payload.sensorMac.replace(/:/g, "").toLowerCase();
    }
    console.log("Press the side button on the SensorTag (" + tagData.payload.sensorMac + ") to connect");
}

// save the config to disk
function saveConfig() {
    nconf.set("mqtt:host", mqttHost);
    nconf.set("mqtt:port", mqttPort);
    nconf.set("mqtt:topic", mqttTopic);
    nconf.set("mqtt:interval", mqttInterval);
    nconf.set("sensor:interval", sensorInterval);
    nconf.set("sensor:mac", tagData.payload.sensorMac);
    nconf.save(function(err) {
        fs.writeFile(brokerFile, mqttHost, function(err, data) {
            if (err) console.log(err);
        });
        fs.writeFile(sensorMacFile, tagData.payload.sensorMac, function(err) {
            if (err) console.log(err);
        });
    });
}

// delete config file from the disk
function deleteConfig() {
    fs.unlink(sensorMacFile, function(err) {
        if (err) console.log(err);
    });
    fs.unlink(configFile, function(err) {
        if (err) console.log(err);
    });
    console.log("*** [Config] All the config files deleted");
}

// called on message received
function doCommand(topic, message, packet) {
    console.log("*** [MQTT] Received command: " + topic + " msg: " + message);
    var topics = topic.split("/");
    switch (topics[3]) {
      case "ping":
        var payload = JSON.parse(message);
        break;

      case "servo":
        var payload = JSON.parse(message);
        if (payload.angle && isInteger(payload.angle)) {
            if (0 <= payload.id && payload.id <= 3) {
                servos[payload.id].angle = payload.angle;
            }
        }
        break;

      default:
        console.log("Unxpected Command: " + topics[3]);
    }
}

// cycle thru obx1 led color
function toggleRainbowLED() {
    spawn("/bin/bash", [ rainbowScript ], {
        stdio: "ignore",
        detached: true
    }).unref();
}

// write PID to file
function savePID() {
    fs.writeFile(pidFile, process.pid, function(err) {
        if (err) console.log(err);
    });
}

// graceful shutdown
function gracefulShutdown() {
    // delete PID file
    fs.unlink(pidFile, function(err) {
        if (err) console.log(err);
    });
    // reset LED
    toggleRainbowLED();
    if (mqttClient) {
        if (configured) tagData.publishInfo("down");
        mqttClient.end();
    }
    process.exit(0);
}

// check if it is an integer
function isInteger(nVal) {
    return typeof nVal === "number" && isFinite(nVal) && nVal > -9007199254740992 && nVal < 9007199254740992 && Math.floor(nVal) === nVal;
}

//*****************************************************************************
/* main script */
//*****************************************************************************
async.series([ function(callback) {
    // handle exit event
    process.on("exit", function(code) {
        console.log("*** [Process] Exiting with code: " + code);
    });
    var signals = [ "SIGINT", "SIGTERM", "SIGQUIT" ];
    for (i in signals) {
        process.on(signals[i], function() {
            console.log("\n" + signals[i]);
            gracefulShutdown();
        });
    }
    callback();
}, function(callback) {
    // read sensor mac and mqtt broker host from files first
    fs.readFile(sensorMacFile, "utf8", function(err, data) {
        if (err) console.log(err);
        tagData.payload.sensorMac = data;
    });
    fs.readFile(brokerFile, "utf8", function(err, data) {
        if (err) console.log(err);
        mqttHost = data || mqttHost;
    });
    callback();
}, function(callback) {
    // and then read config file
    readConfig();
    callback();
}, function(callback) {
    // get device mac address
    getmac.getMac(function(err, mac) {
        if (err) console.log(err);
        tagData.payload.deviceMac = mac.toUpperCase();
    });
    callback();
}, function(callback) {
    // create MQTT client
    console.log("*** [MQTT] Connect to the mqtt broker: " + mqttHost);
    mqttClient = mqtt.connect({
        port: mqttPort,
        host: mqttHost,
        keepalive: 30
    });
    callback();
}, function(callback) {
    // publish pending status every 5 seconds
    pendingNotifier = setInterval(function(tag) {
        tagData.publishInfo("pending");
    }, 5e3);
    console.log("*** [MQTT:gif-iot/status] Waiting for a sensor tag");
    callback();
}, function(callback) {
    // start rainbow blinking
    toggleRainbowLED();
    callback();
}, function(callback) {
    // servo control initialization
    if (nconf.get("servo")) {
        Cylon.robot({
            connections: {
                edison: {
                    adaptor: "intel-iot"
                }
            },
            devices: {
                // TODO: more concise way
                servo0: {
                    driver: "servo",
                    pin: servos[0].pin,
                    connection: "edison"
                },
                servo1: {
                    driver: "servo",
                    pin: servos[1].pin,
                    connection: "edison"
                },
                servo2: {
                    driver: "servo",
                    pin: servos[2].pin,
                    connection: "edison"
                },
                servo3: {
                    driver: "servo",
                    pin: servos[3].pin,
                    connection: "edison"
                }
            },
            work: function(bot) {
                // TODO: more concise way
                every(servoInterval, function() {
                    // do every servoInterval milliseconds
                    bot.servo0.angle(bot.servo0.safeAngle(servos[0].angle));
                    bot.servo1.angle(bot.servo1.safeAngle(servos[1].angle));
                    bot.servo2.angle(bot.servo2.safeAngle(servos[2].angle));
                    bot.servo3.angle(bot.servo3.safeAngle(servos[3].angle));
                    console.log("*** [Servo] servo0 => " + servos[0].angle + ", servo1 => " + servos[1].angle + ", servo2 => " + servos[2].angle + ", servo3 => " + servos[3].angle);
                });
            }
        }).start();
        console.log("*** [Cylon] Cylon robot started");
    }
    callback();
} ]);

SensorTag.discover(function(sensorTag) {
    sensorTag.on("disconnect", function() {
        console.log("*** [SensorTag] SensorTag disconnected");
        gracefulShutdown();
    });
    async.series([ function(callback) {
        // notify it's initializing sensors
        console.log("*** [MQTT:gif-iot/status] Initializing a sensor tag");
        tagData.publishInfo("initializing");
        callback();
    }, function(callback) {
        // save pid
        savePID();
        if (pendingNotifier) clearInterval(pendingNotifier);
        callback();
    }, function(callback) {
        // stop rainbowLED
        toggleRainbowLED();
        callback();
    }, function(callback) {
        // connect to the sensor tag
        console.log("*** [SensorTag] connect");
        sensorTag.connect(callback);
    }, function(callback) {
        // discover services and characteristics
        console.log("*** [SensorTag] discover services and characteristics");
        sensorTag.discoverServicesAndCharacteristics(callback);
    }, function(callback) {
        // get and save MAC address of the sensor tag
        console.log("*** [SensorTag] get MAC address");
        tagData.payload.sensorMac = sensorTag.uuid.toUpperCase().replace(/(.)(?=(..)+$)/g, "$1:");
        callback();
    }, function(callback) {
        // save config with new MAC address
        saveConfig();
        configured = true;
        callback();
    }, function(callback) {
        // irTemperature
        console.log("*** [SensorTag] Enabling irTemperature");
        sensorTag.enableIrTemperature(callback);
    }, function(callback) {
        sensorTag.on("irTemperatureChange", function(objectTemperature, ambientTemperature) {
            tagData.payload.objectTemp = parseFloat(objectTemperature.toFixed(1));
            tagData.payload.ambientTemp = parseFloat(ambientTemperature.toFixed(1));
        });
        sensorTag.notifyIrTemperature(callback);
    }, function(callback) {
        // accelerometer
        console.log("*** [SensorTag] Enabling accelerometer");
        sensorTag.enableAccelerometer(callback);
    }, function(callback) {
        sensorTag.setAccelerometerPeriod(sensorInterval, callback);
    }, function(callback) {
        sensorTag.on("accelerometerChange", function(x, y, z) {
            tagData.payload.accelX = parseFloat(x.toFixed(4));
            tagData.payload.accelY = parseFloat(y.toFixed(4));
            tagData.payload.accelZ = parseFloat(z.toFixed(4));
        });
        sensorTag.notifyAccelerometer(callback);
    }, function(callback) {
        // humidity
        console.log("*** [SensorTag] Enabling humidity");
        sensorTag.enableHumidity(callback);
    }, function(callback) {
        sensorTag.on("humidityChange", function(temperature, humidity) {
            tagData.payload.humidity = parseFloat(humidity.toFixed(1));
            tagData.payload.temp = parseFloat(temperature.toFixed(1));
        });
        sensorTag.notifyHumidity(callback);
    }, function(callback) {
        // magnetometer
        console.log("*** [SensorTag] Enabling magnetometer");
        sensorTag.enableMagnetometer(callback);
    }, function(callback) {
        sensorTag.setMagnetometerPeriod(sensorInterval, callback);
    }, function(callback) {
        sensorTag.on("magnetometerChange", function(x, y, z) {
            tagData.payload.magX = parseFloat(x.toFixed(1));
            tagData.payload.magY = parseFloat(y.toFixed(1));
            tagData.payload.magZ = parseFloat(z.toFixed(1));
        });
        sensorTag.notifyMagnetometer(callback);
    }, function(callback) {
        // barometricPressure
        console.log("*** [SensorTag] Enabling barometricPressure");
        sensorTag.enableBarometricPressure(callback);
    }, function(callback) {
        sensorTag.on("barometricPressureChange", function(pressure) {
            tagData.payload.pressure = parseFloat(pressure.toFixed(1));
        });
        sensorTag.notifyBarometricPressure(callback);
    }, function(callback) {
        // gyroscope
        console.log("*** [SensorTag] Enabling gyroscope");
        sensorTag.enableGyroscope(callback);
    }, function(callback) {
        sensorTag.on("gyroscopeChange", function(x, y, z) {
            tagData.payload.gyroX = parseFloat(x.toFixed(1));
            tagData.payload.gyroY = parseFloat(y.toFixed(1));
            tagData.payload.gyroZ = parseFloat(z.toFixed(1));
        });
        sensorTag.notifyGyroscope(callback);
    }, function(callback) {
        // simpleKey
        sensorTag.on("simpleKeyChange", function(left, right) {
            tagData.payload.left = left;
            tagData.payload.right = right;
            if (left && right) deleteConfig();
        });
        sensorTag.notifySimpleKey(callback);
    }, function(callback) {
        console.log("*** [MQTT:gif-iot/status] Sensor tag initialization completed");
        tagData.publishInfo("initialized");
        callback();
    }, function(callback) {
        // MQTT subscribe to cmd topic
        console.log("*** [MQTT] Subscribe to " + mqttTopic + "/cmd/" + tagData.payload.deviceMac);
        mqttClient.subscribe(mqttTopic + "/cmd/" + tagData.payload.deviceMac + "/#");
        mqttClient.on("message", doCommand);
        callback();
    }, function(callback) {
        // MQTT publish sensor data
        console.log("*** [MQTT] Publish to " + mqttTopic + "/data/" + tagData.payload.sensorMac);
        setInterval(function(tag) {
            tag.publish();
        }, mqttInterval, tagData);
    }, function(callback) {
        // disconnect from the sensor tag
        sensorTag.disconnect(callback);
    } ]);
}, macToDiscover);