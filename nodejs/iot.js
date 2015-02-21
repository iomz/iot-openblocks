//*****************************************************************************
// Copyright (c) 2015 Auto-ID Lab. Japan
//
// Contributors:
//  Iori MIZUTANI (iori.mizutani@gmail.com)
//*****************************************************************************

// Make Intel Edison's BLE module for connecting a Texas Instruments SenstorTag CC2451

var async = require("async"),
    fs = require("fs"),
    mqtt = require("mqtt"),
    nconf = require("nconf"),
    SensorTag = require("sensortag"),
    spawn = require("child_process").spawn;

// constants
var configFile = "/var/local/config.json";
var pidFile = "/var/local/iot.pid";
var mosquittoHost = "test.mosquitto.org";
var mosquittoPort = 1883;
var defaultTopic = "gif-iot";
var defaultInterval = 100;

// globals
var mqttHost, mqttPort, mqttTopic, mqttInterbal, meterInterval;

// mqttClient
var mqttClient = null;

// tagData object
var tagData = {};
tagData.payload = {};
tagData.toJson = function() {
    return JSON.stringify(this.payload);
};
tagData.publish = function() {
    mqttClient.publish(mqttTopic + "/" + this.macAddress + "/data", tagData.toJson());
    //console.log("[" + mqttTopic + "/" + this.macAddress + "/data] " + tagData.toJson());
};

// read the config file
function readConfig() {
    nconf.argv().file({
        file: configFile
    });
    mqttHost = nconf.get("mqtt:host") || mosquittoHost;
    mqttPort = nconf.get("mqtt:port") || mosquittoPort;
    mqttTopic = nconf.get("mqtt:topic") || defaultTopic;
    mqttInterval = nconf.get("mqtt:interval") || defaultInterval;
    meterInterval = nconf.get("interval") || defaultInterval;
    if (nconf.get("mac") != undefined) {
        tagData.macAddress = nconf.get("mac").replace(/:/g, "").toLowerCase();
        console.log("Press the side button on the SensorTag (" + nconf.get("mac") + ") to connect");
    } else {
        console.log("Press the side button on the SensorTag to connect");
    }
}

// save the config to disk
function saveConfig() {
    nconf.set("mqtt:host", mqttHost);
    nconf.set("mqtt:port", mqttPort);
    nconf.set("mqtt:topic", mqttTopic);
    nconf.set("mqtt:interval", mqttInterval);
    nconf.set("interval", meterInterval);
    nconf.set("mac", tagData.macAddress.toUpperCase().replace(/(.)(?=(..)+$)/g, "$1:"));
    nconf.save(function(err) {
        fs.readFile(configFile, function(err, data) {
            console.dir(JSON.parse(data.toString()));
        });
        fs.writeFile("/var/local/pairdSensorTag", nconf.get("mac"), function(err) {
            if (err) console.log(err);
        });
    });
}

// called on message received
function doCommand(topic, message, packet) {
    console.log("received command: " + topic + " msg: " + message);
    var topics = topic.split("/");
    switch (topics[3]) {
      case "ping":
        var payload = JSON.parse(message);
        break;

      default:
        console.log("Unxpected Command: " + topics[3]);
    }
}

// cycle thru obx1 led color
function toggleRainbowLED() {
    spawn("bash", [ "/var/local/rainbow.sh" ], {
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

//*****************************************************************************
/* node */
//*****************************************************************************

process.on('exit', function(code) {
    async.series([
        function(callback) { // delete PID file
            fs.unlink(pidFile, function (err) {
                if (err) throw err;
            });
            callback();
        }, function(callback) { // reset LED
            toggleRainbowLED();
            callback();
        }
    ]);
    console.log('*** Exiting with code: ' + code);
});

readConfig();
toggleRainbowLED();
SensorTag.discover(function(sensorTag) {
    sensorTag.on("disconnect", function() {
        console.log("*** SensorTag disconnected");
        process.exit(0);
    });
	// asynchronous functions in series 
    async.series([ function(callback) { // save pid
        savePID();
        callback();
    }, function(callback) { // stop rainbowLED
        toggleRainbowLED();
        callback();
    }, function(callback) { // connect to the sensor tag
        console.log("*** [SensorTag] connect");
        sensorTag.connect(callback);
    }, function(callback) { // discover services and characteristics
        console.log("*** [SensorTag] discover services and characteristics");
        sensorTag.discoverServicesAndCharacteristics(callback);
    }, function(callback) { // get and save MAC address of the sensor tag
        console.log("*** [SensorTag] get MAC address");
        tagData.macAddress = sensorTag.uuid;
        callback();
    }, function(callback) { // create MQTT client
        console.log("*** [MQTT] Connect to the mqtt broker: " + mqttHost);
        mqttClient = mqtt.connect({
            port: mqttPort,
            host: mqttHost,
            keepalive: 1e4
        });
        callback();
    }, function(callback) { // save config with new MAC address
        saveConfig();
        if (nconf.get("ip") != undefined) {
            mqttClient.publish("gif-iot/ip/" + nconf.get("ip"), nconf.get("mac"));
            console.log("[gif-iot/ip/" + nconf.get("ip") + "] " + nconf.get("mac"));
        }
        callback();
    }, function(callback) { // irTemperature
        console.log("*** [SensorTag] Enabling irTemperature");
        sensorTag.enableIrTemperature(callback);
    }, function(callback) {
        sensorTag.on("irTemperatureChange", function(objectTemperature, ambientTemperature) {
            tagData.payload.objectTemp = parseFloat(objectTemperature.toFixed(1));
            tagData.payload.ambientTemp = parseFloat(ambientTemperature.toFixed(1));
        });
        sensorTag.notifyIrTemperature(callback);
    }, function(callback) { // accelerometer
        console.log("*** [SensorTag] Enabling accelerometer");
        sensorTag.enableAccelerometer(callback);
    }, function(callback) {
        sensorTag.setAccelerometerPeriod(meterInterval, callback);
    }, function(callback) {
        sensorTag.on("accelerometerChange", function(x, y, z) {
            tagData.payload.accelX = parseFloat(x.toFixed(4));
            tagData.payload.accelY = parseFloat(y.toFixed(4));
            tagData.payload.accelZ = parseFloat(z.toFixed(4));
        });
        sensorTag.notifyAccelerometer(callback);
    }, function(callback) { // humidity
        console.log("*** [SensorTag] Enabling humidity");
        sensorTag.enableHumidity(callback);
    }, function(callback) {
        sensorTag.on("humidityChange", function(temperature, humidity) {
            tagData.payload.humidity = parseFloat(humidity.toFixed(1));
            tagData.payload.temp = parseFloat(temperature.toFixed(1));
        });
        sensorTag.notifyHumidity(callback);
    }, function(callback) { // magnetometer
        console.log("*** [SensorTag] Enabling magnetometer");
        sensorTag.enableMagnetometer(callback);
    }, function(callback) {
        sensorTag.setMagnetometerPeriod(meterInterval, callback);
    }, function(callback) {
        sensorTag.on("magnetometerChange", function(x, y, z) {
            tagData.payload.magX = parseFloat(x.toFixed(1));
            tagData.payload.magY = parseFloat(y.toFixed(1));
            tagData.payload.magZ = parseFloat(z.toFixed(1));
        });
        sensorTag.notifyMagnetometer(callback);
    }, function(callback) { // barometricPressure
        console.log("*** [SensorTag] Enabling barometricPressure");
        sensorTag.enableBarometricPressure(callback);
    }, function(callback) {
        sensorTag.on("barometricPressureChange", function(pressure) {
            tagData.payload.pressure = parseFloat(pressure.toFixed(1));
        });
        sensorTag.notifyBarometricPressure(callback);
    }, function(callback) { // gyroscope
        console.log("*** [SensorTag] Enabling gyroscope");
        sensorTag.enableGyroscope(callback);
    }, function(callback) {
        sensorTag.on("gyroscopeChange", function(x, y, z) {
            tagData.payload.gyroX = parseFloat(x.toFixed(1));
            tagData.payload.gyroY = parseFloat(y.toFixed(1));
            tagData.payload.gyroZ = parseFloat(z.toFixed(1));
        });
        sensorTag.notifyGyroscope(callback);
    }, function(callback) { // simleKey
        sensorTag.on("simpleKeyChange", function(left, right) {
            tagData.payload.left = left;
            tagData.payload.right = right;
        });
        sensorTag.notifySimpleKey(callback);
    }, function(callback) { // MQTT subscribe to cmd topic
        console.log("*** [MQTT] Subscribe to " + mqttTopic + "/" + tagData.macAddress + "/cmd");
        mqttClient.subscribe(mqttTopic + "/" + tagData.macAddress + "/cmd");
        mqttClient.on("message", doCommand);
        callback();
    }, function(callback) { // MQTT publish sensor data
        console.log("*** [MQTT] Publish to " + mqttTopic + "/" + tagData.macAddress + "/data");
        setInterval(function(tag) {
            tag.publish();
        }, mqttInterval, tagData);
    }, function(callback) { // disconnect from the sensor tag
        sensorTag.disconnect(callback);
    } ]);
}, tagData.macAddress);

