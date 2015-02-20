//*****************************************************************************
// Copyright (c) 2015 Auto-ID Lab. Japan
//
// Contributors:
//  Iori MIZUTANI (iori.mizutani@gmail.com)
//*****************************************************************************

// Make Intel Edison's BLE module for connecting a Texas Instruments SenstorTag CC2451

var util = require('util');
var async = require('async');
var SensorTag = require('sensortag');
var mqtt = require('mqtt');
var properties = require('properties');
var fs = require('fs');

// constants
var topicHeader = "gif-iot/";
var hivemqHost = "broker.mqtt-dashboard.com";
var hivemqPort = 1883;
var configFile = "./device.config";

// globals
var mqttBrokerHost = hivemqHost;
var mqttBrokerPort = hivemqPort;
var meterInterval = 100;

// mqttClient
var mqttClient = null;

// tagData object
var tagData = {};
tagData.payload = {};
tagData.toJson = function() {
	return JSON.stringify(this.payload);
};
tagData.publish = function() {
    mqttClient.publish(topicHeader+this.macAddress+'/data', tagData.toJson());
    //console.log(topicHeader+this.macAddress+'/data', tagData.toJson()); // trace
};

// error report
function missing(what) {
	console.log("No " + what + " in " + configFile);
	process.exit(1);
}

// called on message received
function doCommand(topic, message, packet) {
	console.log("received command: " + topic + " msg: " + message);
	var topics = topic.split('/');
	switch(topics[3]) {
	case "ping": 
		var payload = JSON.parse(message);
		break;
	default:
		console.log("Unxpected Command: " + topics[3]);
	}
}

//*****************************************************************************
/* node */
//*****************************************************************************

// read a config file (device.config) if any
properties.parse(configFile, {
        path : true
    }, function(err, config) {
        if (err && err.code != 'ENOENT') throw err;
        if (config) {
            tagData.macAddress = config.mac.replace(/:/g, '').toLowerCase() || missing('mac');
            mqttBrokerHost = config.host || missing('host');
            mqttBrokerPort = config.port || missing('port');
            topicHeader = config.topic + '/' || missing('topic');
            meterInterval = config.interval || missing('interval');
            console.log('Press the side button on the SensorTag ('+config.mac+') to connect');
        } else {
            console.log('Press the side button on the SensorTag to connect');
        }

        SensorTag.discover(function(sensorTag) {
        	sensorTag.on('disconnect', function() {
        	    console.log('*** SensorTag disconnected');
        		process.exit(0);
        	});
        
        	// asynchronous functions in series 
        	async.series([
                function(callback) { // connectSensorTag
        	        console.log('*** [SensorTag] connect');
        	        sensorTag.connect(callback);
                },
                function(callback) { // discoverServicesAndCharacteristics
        	        console.log('*** [SensorTag] discover services and characteristics');
        	        sensorTag.discoverServicesAndCharacteristics(callback);
                },
                function(callback) { // getMacAddress
                    tagData.macAddress = sensorTag.uuid.toUpperCase().replace(/(.)(?=(..)+$)/g, "$1:");
                    console.log('*** [SensorTag] MAC address = ' + tagData.macAddress);
                    callback();
                },
                function(callback) { // irTemperature
                    console.log('*** [SensorTag] Enabling irTemperature');
                	sensorTag.enableIrTemperature(callback);
                },
                function(callback) {
                	sensorTag.on('irTemperatureChange', function(objectTemperature, ambientTemperature) {
                		tagData.payload.objectTemp = parseFloat(objectTemperature.toFixed(1));
                		tagData.payload.ambientTemp = parseFloat(ambientTemperature.toFixed(1));
                	});
                    sensorTag.notifyIrTemperature(callback);
                },
                function(callback) { // accelerometer
                    console.log('*** [SensorTag] Enabling accelerometer');
                    sensorTag.enableAccelerometer(callback);
                },
                function(callback) {
                    sensorTag.setAccelerometerPeriod(meterInterval, callback);
                },
                function(callback) {
                	sensorTag.on('accelerometerChange', function(x, y, z) {
                		tagData.payload.accelX = parseFloat(x.toFixed(4));
                		tagData.payload.accelY = parseFloat(y.toFixed(4));
                		tagData.payload.accelZ = parseFloat(z.toFixed(4));
                	});
                    sensorTag.notifyAccelerometer(callback);
                },
                function(callback) { // humidity
                    console.log('*** [SensorTag] Enabling humidity');
                	sensorTag.enableHumidity(callback);
                },
                function(callback) {
                	sensorTag.on('humidityChange', function(temperature, humidity) {
                		tagData.payload.humidity = parseFloat(humidity.toFixed(1));
                		tagData.payload.temp = parseFloat(temperature.toFixed(1));
                	});
                    sensorTag.notifyHumidity(callback);
                },
                function(callback) { // magnetometer
                    console.log('*** [SensorTag] Enabling magnetometer');
                	sensorTag.enableMagnetometer(callback);
                },
                function(callback) {
                	sensorTag.setMagnetometerPeriod(meterInterval, callback);
                },
                function(callback) {
                	sensorTag.on('magnetometerChange', function(x, y, z) {
                		tagData.payload.magX = parseFloat(x.toFixed(1));
                		tagData.payload.magY = parseFloat(y.toFixed(1));
                		tagData.payload.magZ = parseFloat(z.toFixed(1));
                	});
                    sensorTag.notifyMagnetometer(callback);            
                },
                function(callback) { // barometricPressure
                    console.log('*** [SensorTag] Enabling barometricPressure');
                	sensorTag.enableBarometricPressure(callback);
                },
                function(callback) {
                	sensorTag.on('barometricPressureChange', function(pressure) {
                		tagData.payload.pressure = parseFloat(pressure.toFixed(1));
                	});
                    sensorTag.notifyBarometricPressure(callback);
                },
                function(callback) { // gyroscope
                    console.log('*** [SensorTag] Enabling gyroscope');
                	sensorTag.enableGyroscope(callback);
                },
                function(callback) {
                	sensorTag.on('gyroscopeChange', function(x, y, z) {
                		tagData.payload.gyroX = parseFloat(x.toFixed(1));
                		tagData.payload.gyroY = parseFloat(y.toFixed(1));
                		tagData.payload.gyroZ = parseFloat(z.toFixed(1));
                	});
                    sensorTag.notifyGyroscope(callback);
                },
                function(callback) { // simpleKey
                    sensorTag.on('simpleKeyChange', function(left, right) {
                		tagData.payload.left = left;
                		tagData.payload.right = right;
                    });
                    sensorTag.notifySimpleKey(callback);
                },
                function(callback) { // connectMQTTClient
                    console.log('*** [MQTT] Connect to HiveMQ public broker');
                	mqttClient = mqtt.connect({ port: mqttBrokerPort, host: mqttBrokerHost, keepalive: 10000});
                	mqttClient.subscribe(topicHeader+tagData.macAddress+'/cmd');
                	mqttClient.on('message', doCommand);
                    console.log('*** [MQTT] Subscribed to '+topicHeader+tagData.macAddress+'/cmd');
                    callback();
                },
                function(callback) { //publishMQTT
                    console.log('*** [MQTT] Publishing to '+topicHeader+tagData.macAddress+'/data');
                	setInterval(function(tag) {
                		tag.publish();
                	}, 100, tagData);
                },
                function(callback) { // disconnectSensorTag
        	        sensorTag.disconnect(callback);
                }
            ]);
        }, tagData.macAddress);
    }
);

/*
if(process.argv.length==3) {
    tagData.macAddress = process.argv[2].replace(/:/g, '').toLowerCase();
}
console.log('Press the side button on the SensorTag to connect');
*/

