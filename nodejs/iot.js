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

var rainbowScript = path.join(scriptDir, "rainbow.sh");

var tmpDir = "/tmp";

var brokerFile = path.join(tmpDir, "broker");

var configFile = path.join(tmpDir, "config.json");

var sensorMacFile = path.join(tmpDir, "sensor_mac");

var pidFile = path.join(tmpDir, "iot.pid");

//var broker = "broker.mqttdashboard.com";
var broker = "lain.sfc.wide.ad.jp";

var mqttHost = null;

var mqttPort = 1883;

var mqttTopic = "gif-iot";

var mqttInterval = 100;

var sensorInterval = 100;

var servoInterval = 10;

var active = false;

// mqttClient
var mqttClient = null;

// tagData object
var tagData = {};

tagData.payload = {};

tagData.payload.deviceMac = null;

tagData.payload.sensorMac = null;

tagData.toJson = function() {
    return JSON.stringify(this.payload);
};

tagData.toBluemixJson = function() {
    return JSON.stringify({
        d: {
            myName: this.myName,
            objectTemp: this.payload.objectTemp,
            ambientTemp: this.payload.ambientTemp,
            accelX: this.payload.accelX,
            accelY: this.payload.accelY,
            accelZ: this.payload.accelZ,
            humidity: this.payload.humidity,
            temp: this.payload.temp,
            magX: this.payload.magX,
            magY: this.payload.magY,
            magZ: this.payload.magZ,
            pressure: this.payload.pressure,
            gyroX: this.payload.gyroX,
            gyroY: this.payload.gyroY,
            gyroZ: this.payload.gyroZ
        }
    });
};

tagData.publish = function() {
    mqttClient.publish(mqttTopic + "/data/" + tagData.payload.sensorMac, tagData.toJson());
};

tagData.bluemixPublish = function() {
    console.log(tagData.toJson());
    bluemixClient.publish("iot-2/evt/sample/fmt/json", tagData.toBluemixJson());
};

tagData.publishInfo = function(nodeStatus) {
    var info = JSON.stringify({
        ip: this.payload.ip,
        sensorMac: this.payload.sensorMac,
        deviceMac: this.payload.deviceMac,
        nodeStatus: nodeStatus
    });
    mqttClient.publish("gif-iot/ip", info);
    if (nodeStatus != "pending") console.log("*** [gif-iot/ip] " + info);
};

// servo
var servo = {};

servo.enabled = false;

servo.pin = 20;

servo.angle = 0;

// mac address to discover
var macToDiscover = undefined;

// pending notifier pid
var pendingNotifier = null;

// bluemixOption
var bluemix = false;

// bluemixClient
var bluemixClient = null;

// read the config file
function readConfig() {
    nconf.argv().file({
        file: configFile
    });
    if (nconf.get("bluemix")) bluemix = true;
    if (nconf.get("servo")) {
        servo.enabled = true;
        servo.pin = nconf.get("servo") || servo.pin;
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
        if (payload.angle && isInteger(payload.angle)) servo.angle = payload.angle;
        console.log("*** [Servo] Current Angle: " + servo.angle);
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
        if (active) tagData.publishInfo("down");
        mqttClient.end();
    }
    if (bluemixClient) bluemixClient.end();
    process.exit(0);
}

// check if it is an integer
function isInteger(nVal) {
    return typeof nVal === "number" && isFinite(nVal) && nVal > -9007199254740992 && nVal < 9007199254740992 && Math.floor(nVal) === nVal;
}

//*****************************************************************************
/* node */
//*****************************************************************************
process.on("exit", function(code) {
    console.log("*** Exiting with code: " + code);
});

var signals = [ "SIGINT", "SIGTERM", "SIGQUIT" ];

for (i in signals) {
    process.on(signals[i], function() {
        console.log("\n" + signals[i]);
        gracefulShutdown();
    });
}

async.series([ function(callback) {
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
    if (bluemix) {
        bluemixClient = mqtt.connect({
            port: "1883",
            host: "quickstart.messaging.internetofthings.ibmcloud.com",
            keepalive: 30,
            clientId: "d:quickstart:iotsample-ti-bbst:" + macToDiscover
        });
    }
    callback();
}, function(callback) {
    pendingNotifier = setInterval(function(tag) {
        tagData.publishInfo("pending");
    }, 5e3);
    console.log("*** [gif-iot/ip] Waiting for a sensor tag");
    callback();
}, function(callback) {
    toggleRainbowLED();
    callback();
}, function(callback) {
    if (servo.enabled) {
        Cylon.robot().connection("edison", {
            adaptor: "intel-iot"
        }).device("servo", {
            driver: "servo",
            pin: 20
        }).on("ready", function(bot) {
            setInterval(function() {
                var angle = servo.angle;
                if (angle > 180) {
                    angle = 180;
                } else if (angle < 0) {
                    angle = 0;
                }
                bot.servo.angle(angle);
            }, servoInterval);
        });
	Cylon.start();
	console.log("*** [cylong] Cylon robot started");
    }
    callback();
} ]);

SensorTag.discover(function(sensorTag) {
    sensorTag.on("disconnect", function() {
        console.log("*** SensorTag disconnected");
        gracefulShutdown();
    });
    // asynchronous functions in series 
    async.series([ function(callback) {
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
        active = true;
        if (nconf.get("ip") != undefined) {
            tagData.publishInfo("initialized");
        } else {
            console.log("*** [Option] IP address not provided");
        }
        callback();
    }, function(callback) {
        sensorTag.readSystemId(function(systemId) {
            tagData.myName = "TI BLE Sensor Tag " + systemId;
            callback();
        });
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
        // simleKey
        sensorTag.on("simpleKeyChange", function(left, right) {
            tagData.payload.left = left;
            tagData.payload.right = right;
            if (left && right) deleteConfig();
        });
        sensorTag.notifySimpleKey(callback);
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
	if (bluemix) {
            setInterval(function(tag) {
                tag.bluemixPublish();
            }, 1e3, tagData);
        }
    }, function(callback) {
        // disconnect from the sensor tag
        sensorTag.disconnect(callback);
    } ]);
}, macToDiscover);
