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
var topic_header = "gif-iot/";
var hivemq_host = "broker.mqtt-dashboard.com";
var hivemq_port = "1883";
var configFile = "./device.cfg";

// MQTT client
var mqttClient = null;

// tagData object
var tagData = {};
tagData.macAddress = null;
tagData.payload = {};
tagData.toJson = function() {
	return JSON.stringify(this.payload);
};
tagData.publish = function() {
	// dont publish unless there is a full set of data
	// alternative: only enable publish when most sensortag callbacks have fired

    mqttClient.publish(topic_header+this.macAddress+'/data', tagData.toJson());
    //console.log(topic_header+this.macAddress+'/data', tagData.toJson()); // trace
    //ledShot(3);
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
	case "blink": 
		var payload = JSON.parse(message);
		//ledBlink(0, payload.interval);
		break;
	default:
		console.log("Unxpected Command: " + topics[3]);
	}
}

//*****************************************************************************
/* async functions */
//*****************************************************************************

// read config file if any
function readConfig(callback) {
	properties.parse(configFile, {
		path : true
	}, function(err, config) {
		if (err && err.code != 'ENOENT') throw err;
		if (config) {
            ;
		}
	});
}

/* function defined */

console.log('Press the side button on the SensorTag to connect');
SensorTag.discover(function(sensorTag) {
	sensorTag.on('disconnect', function() {
	    console.log('*** SensorTag disconnected');
		process.exit(0);
	});

	// asynchronous functions in series 
	async.series([
        //readConfig
        //fillDeviceId
        function(callback) { // connectSensorTag
	        console.log('*** SensorTag connect');
	        sensorTag.connect(callback);
        },
        function(callback) { // discoverServicesAndCharacteristics
	        console.log('*** SensorTag discover services and characteristics');
	        sensorTag.discoverServicesAndCharacteristics(callback);
        },
        function(callback) { // getMacAddress
            tagData.macAddress = sensorTag.uuid.toUpperCase().replace(/(.)(?=(..)+$)/g, "$1:");
            console.log('SensorTag MAC address = ' + tagData.macAddress);
            callback();
        },
        function(callback) { // irTemperature
            console.log('*** Enabling irTemperature');
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
            console.log('*** Enabling accelerometer');
            sensorTag.enableAccelerometer(callback);
            //sensorTag.setAccelerometerPeriod(1000, callback);
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
            console.log('*** Enabling humidity');
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
            console.log('*** Enabling magnetometer');
        	sensorTag.enableMagnetometer(callback);
        	//sensorTag.setMagnetometerPeriod(1000, callback);
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
            console.log('*** Enabling barometricPressure');
        	sensorTag.enableBarometricPressure(callback);
        },
        function(callback) {
        	sensorTag.on('barometricPressureChange', function(pressure) {
        		tagData.payload.pressure = parseFloat(pressure.toFixed(1));
        	});
            sensorTag.notifyBarometricPressure(callback);
        },
        function(callback) { // gyroscope
            console.log('*** Enabling gyroscope');
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
            console.log('*** Connect to HiveMQ public broker');
        	mqttClient = mqtt.connect({ port: hivemq_port, host: hivemq_host, keepalive: 10000});
        	mqttClient.subscribe(topic_header+tagData.macAddress+'/cmd');
        	mqttClient.on('message', doCommand);
            console.log('*** [MQTT] Subscribed to '+topic_header+tagData.macAddress+'/cmd');
            callback();
        },
        function(callback) { //publishMQTT
            console.log('*** [MQTT] Publish to '+topic_header+tagData.macAddress+'/data');
        	setInterval(function(tag) {
        		tag.publish();
        	}, 100, tagData);
        },
        function(callback) { // disconnectSensorTag
	        sensorTag.disconnect(callback);
        }
    ]);
});

