/* Magic Mirror
 * Node Helper: MMM-Tasmota
 *
 * By Dirk Kovert (lavolp3)
 * MIT Licensed.
 */

var NodeHelper = require('node_helper');
var mqtt = require('mqtt');
var jsonfile = require('jsonfile');
var moment = require('moment');

const file = 'modules/MMM-Tasmota/tasmotadata.json';

module.exports = NodeHelper.create({

    start: function () {
        var self = this;
        this.tasmotaData = {};
        jsonfile.readFile(file, function (err, obj) {
            if (err) {
                console.error(err);
                self.tasmotaData = {};
            } else {
                //this.log(obj);
                self.tasmotaData = obj;
                self.sendSocketNotification('TASMOTA_DATA', this.tasmotaData);
            }
        });
        setInterval(() => {
            //this.log('Sending Socket Notification with data');
            this.sendSocketNotification('TASMOTA_DATA', this.tasmotaData);
        }, 1 * 60 * 1000);
    },

    socketNotificationReceived: function(notification, payload) {
        this.log('Received socket notification: ' + notification);
        if (notification === "TASMOTA_INIT") {
            if (typeof client == "undefined") {
                this.log("Initialising client...");
                this.config = payload;
                client = mqtt.connect(this.config.host);
                this.subToHosts(client);
            } else {
                this.log("Client already connected: " + client.connected);
            }
            if (this.tasmotaData.tele) {
                this.sendSocketNotification('TASMOTA_DATA', this.tasmotaData);
            }
        } else if (notification === "TOGGLE_SWITCH") {
            this.log("Switching Power on " + payload);
            client.publish(`cmnd/${payload}/power`, 'TOGGLE');
        }
    },


    subToHosts: function(client) {
        self = this;
        client.on('connect', function () {
            self.log('Connected to host: ' + self.config.host);
            self.config.devices.forEach(device => {
                var sub = 'stat/' + device.topic + '/#';
                self.log('Subscribing to topic: ' + sub);
                client.subscribe(sub, function (err) {
                    if (!err) {
                        self.log('Subscribed to topic: ' + sub);
                        //client.publish('presence', 'Hello mqtt')
                    } else {
                        console.error('MQTT Subscription Error: ' + err);
                    }
                });
            });
        });

        client.on('message', function (topic, message) {
            // message is Buffer
            var msgStr = message.toString();
            self.log('Received message from ' + topic + ': ' + msgStr);
            self.parseData(msgStr);
            //client.end();
        });
    },

    parseData: function(msg) {
        var tData = this.tasmotaData;
        var strArray = msg.split(" ");
        if (strArray[2]) {
            var cmdString = strArray[2].split("/");
            var len = cmdString.length;
            var prefix = cmdString[0];
            var topic = cmdString[len-2];
            var cmd = cmdString[len-1];
            var jsonData = JSON.parse(strArray[4]);
                /*{
                "Time": "2020-05-09T22:41:48",
                "ENERGY": {
                    "TotalStartTime": "2020-02-26T18:23:29",
                    "Total": 115.352,
                    "Yesterday": 0.512,
                    "Today": 1.871,
                    "Period": 0,
                    "Power": 1,
                    "ApparentPower": 4,
                    "ReactivePower": 4,
                    "Factor": 0.28,
                    "Voltage": 226,
                    "Current": 0.016,
                    "Average": 1.58
                }*/
            this.log("Processed JSON data: " + JSON.stringify(jsonData));
            if (!tData.hasOwnProperty(prefix)) { tData[prefix] = {}; }
            if (!tData[prefix].hasOwnProperty(topic)) { tData[prefix][topic] = {};}
            if (!tData[prefix][topic].hasOwnProperty(cmd)) {
                tData[prefix][topic][cmd] = [];
            }

            if (cmd === "STATE") {
                tData[prefix][topic][cmd] = jsonData;
            } else if (cmd === "SENSOR") {
                var sensorData = tData[prefix][topic][cmd];
                var lastEntryTime = (sensorData.length > 0) ? sensorData[sensorData.length-1][0] : "";
                this.log("Last entry: " + lastEntryTime);
                if (jsonData.Time != lastEntryTime) {
                    jsonData.ENERGY.Average = Math.round((jsonData.ENERGY.Total / moment().diff(moment(jsonData.ENERGY.TotalStartTime), 'seconds') * 60 * 60 * 24)*100)/100;
                    this.log("Adding to JSON: "+JSON.stringify(jsonData));
                    tData[prefix][topic][cmd].push([
                        jsonData.Time,
                        //jsonData.ENERGY.TotalStartTime,
                        jsonData.ENERGY.Power,
                        jsonData.ENERGY.Voltage,
                        jsonData.ENERGY.Today,
                        jsonData.ENERGY.Total,
                        jsonData.ENERGY.Yesterday,
                        jsonData.ENERGY.Average
                    ]);
                    tData[prefix][topic][cmd] = this.filterData(tData[prefix][topic][cmd]);
                }
            }
            //this.log(tData);
            jsonfile.writeFile(file, tData, function (err) {
                if (err) console.error(err);
            });
            this.tasmotaData = tData;
        }
    },

    filterData: function(timeData) {
        /*return timeData.filter(element => {
            return moment(element.Time).format('x') > moment().subtract(1, 'days').format('x');
        });*/
        return timeData.slice(-2880);
    },

    log: function (msg) {
        if (this.config && this.config.debug) {
            console.log(this.name + ":", JSON.stringify(msg));
        }
    },
});
