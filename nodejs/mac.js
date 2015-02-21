var getmac = require('getmac');
var deviceMacAddress='hoge';

getmac.getMac(function(err,macAddress){
    if (err)  throw err;
    console.log(deviceMacAddress);
    console.log(macAddress.toUpperCase());
});

console.log(deviceMacAddress);
