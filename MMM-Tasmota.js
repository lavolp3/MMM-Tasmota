/* global Module */

/* Magic Mirror
 * Module: MMM-Tasmota
 *
 * By lavolp3
 * MIT Licensed.
 */

Module.register("MMM-Tasmota", {
    defaults: {
        updateInterval: 60 * 1000,
        retryDelay: 5000,
        host: '',
        showPowerStats: false,
        devices: [
            {
                topic: '',
                name: 'Dummy',
                teleInterval: 300,
                chartInterval: 24,
                chartColor: 'red'
            }
        ],
        subPrefix: 'stat/',
        pubPrefix: 'cmnd/',
        chartxAxisFormat: "dd HH:mm",
        topicWidth: 450,
        showUnits: true,
        debug: false
    },

    tasmotaData: {},

    requiresVersion: "2.1.0", // Required version of MagicMirror


    getScripts: function() {
        return [this.file('node_modules/chart.js/dist/Chart.bundle.js')];
    },

    getStyles: function () {
        return [
            this.file('node_modules/chart.js/dist/Chart.css'),
            'tasmota.css'
        ];
    },

    // Load translations files
    getTranslations: function() {
        return {
            en: "translations/en.json",
            de: "translations/de.json"
        };
    },


    start: function() {
        this.loaded = false;
        this.sendSocketNotification("TASMOTA_INIT", this.config);
        setInterval(() => {
            this.updateDom();
        }, this.config.updateInterval);
    },


    // socketNotificationReceived from helper
    socketNotificationReceived: function (notification, payload) {
        this.log("Socket Notification received: " + notification);
        if (notification === 'TASMOTA_DATA') {
            this.tasmotaData = payload;
            if (!this.loaded) {
                this.loaded = true;
            }
            this.updateDom();
        }
    },


    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.className = "modwrapper";
        var self = this;
        if (this.loaded) {
            this.config.devices.forEach(device => {
                var topicWrapper = document.createElement("div");
                var topic = device.topic;
                topicWrapper.className = "topic-wrapper";
                topicWrapper.style.width = this.config.topicWidth + "px";
                    var table = document.createElement("table");
                    table.className = "topic-data small";
                        var headerRow = document.createElement("tr");
                            var header = document.createElement("td");
                            header.className = "topic-data-header medium bold";
                            header.colSpan = "3";
                            header.innerHTML = device.name || device.topic;
                            var switchth = document.createElement("td");
                            switchth.className = "topic-data-switch";
                            switchth.colSpan = "3";
                                var label = document.createElement("label");
                                label.className = "tasmota-switch";
                                label.id = "switch-" + topic;
                                    var input = document.createElement("input");
                                    input.type = "checkbox";
                                    input.id = "checkbox-" + topic;
                                    input.checked = this.setSwitch(topic);
                                    var span = document.createElement("span");
                                    span.className = "slider round";
                                    span.id = "slider-" + topic;
                                    span.onclick = function() { self.toggleSwitch(topic); };
                                label.appendChild(input);
                                label.appendChild(span);
                            switchth.appendChild(label);
                        headerRow.appendChild(header);
                        headerRow.appendChild(switchth);
                    table.appendChild(headerRow);
                        var spacer = document.createElement("tr");
                        spacer.style.height = "10px";
                    table.appendChild(spacer);
                    if (this.tasmotaData.tele[topic].SENSOR && device.showPowerStats) {
                        var dataArray = this.prepareData(topic);
                        dataArray.forEach(row => {
                            var dataRow = document.createElement("tr");
                            dataRow.className = "tasmota-data-tr small";
                                for (var key in row) {
                                    var dataCell = document.createElement("td");
                                    dataCell.className = "tasmota-data-td " + key;
                                    if (key == "LAST_UPDATE") dataCell.colSpan = "3";
                                    dataCell.innerHTML = this.translate(key);
                                    var valueCell = document.createElement("td");
                                    valueCell.className = "tasmota-value-td bold " + key;
                                    if (key == "LAST_UPDATE") {
                                        valueCell.colSpan = "3";
                                        valueCell.style.textAlign = "center";
                                    }
                                    valueCell.innerHTML = row[key].value;
                                    dataRow.appendChild(dataCell);
                                    dataRow.appendChild(valueCell);
                                    if (key != "LAST_UPDATE") {
                                        var unitCell = document.createElement("td");
                                        unitCell.className = "xsmall tasmota-unit-td " + key;
                                        unitCell.innerHTML = row[key].unit;
                                        dataRow.appendChild(unitCell);
                                    }
                                }
                            table.appendChild(dataRow);
                        });
                        var topicGraph = document.createElement("canvas");
                        topicGraph.width = this.config.topicWidth;
                        topicGraph.height = 200;
                        topicGraph.className = "tasmota-graph";
                        this.drawGraph(topicGraph, device);
                    }
                    topicWrapper.appendChild(table);
                    if (topicGraph) topicWrapper.appendChild(topicGraph);
                wrapper.appendChild(topicWrapper);
            });
        }
        return wrapper;
    },


    prepareData: function(topic) {
        var sensorData = this.tasmotaData.tele[topic].SENSOR;
        var lastData = sensorData[sensorData.length-1];
        this.log("Last Data: "+JSON.stringify(lastData));
        /*              jsonData.time,
                        jsonData.ENERGY.Power,
                        jsonData.ENERGY.Voltage,
                        jsonData.ENERGY.Today,
                        jsonData.ENERGY.Total,
                        jsonData.ENERGY.Yesterday,
                        jsonData.ENERGY.Average
        */
        return [
            {
                "LAST_UPDATE": {
                    value: moment(lastData[0]).format(this.config.chartxAxisFormat),
                    unit: ""
                }
            },
            {
                "POWER": {
                    value: this.formatNumber(lastData[1], 4),
                    unit: "W"
                },
                "VOLT": {
                    value: this.formatNumber(lastData[2], 4),
                    unit: "V"
                }
            },
            {
                "TODAY": {
                    value: this.formatNumber(lastData[3], 4),
                    unit: "kWh"
                },
                "TOTAL": {
                    value: this.formatNumber(lastData[4], 4),
                    unit: "kWh"
                }
            },
            {
                "YDAY": {
                    value: this.formatNumber(lastData[5], 4),
                    unit: "kWh"
                },
                "DAILY_AVG": {
                    value: this.formatNumber(lastData[6], 4),
                    unit: "kWh"
                }
            }
        ];
    },
    
    formatNumber: function (number, dec) {
        if (number >= 100) {
            return number.toFixed(0);
        } else if (number >= 10) {
            return number.toFixed(1);
        } else {
            return number.toFixed(2);
        }
    },

    toggleSwitch: function(topic) {
        this.sendSocketNotification("TOGGLE_SWITCH", topic);
        console.log("Switch toggled on: " + topic);
    },

    setSwitch: function(topic) {
        this.log("Setting switch for " + topic);
        var powerState = this.tasmotaData.tele[topic].STATE.POWER;
        return (powerState === "ON") ? true : false;
    },

    parseGraphData: function(device) {
        var data = {
            times: [],
            current: []
        };
        var sensorData = this.tasmotaData.tele[device.topic].SENSOR;
        if (device.chartInterval && device.teleInterval) {
            sensorData = sensorData.slice(- Math.round(device.chartInterval * 60 * 60 / device.teleInterval));
        }
        for (var i = 0; i < sensorData.length; i++) {
            data.current.push(sensorData[i][1]);
            data.times.push(moment(sensorData[i][0]).format());
        }
        return data;
    },


    drawGraph: function(canvas, device) {
        switch (device.chartColor) {
            case 'blue':
                var lineColor = 'blue';
                var bgColor = 'rgba(0, 0, 250, 0.3)';
                break;
            case 'green':
                var lineColor = 'green';
                var bgColor = 'rgba(0, 250, 0, 0.3)';
                break;
            case 'yellow':
                var lineColor = 'yellow';
                var bgColor = 'rgba(250, 250, 0, 0.3)';
                break;
            case 'white':
                var lineColor = '#dddddd';
                var bgColor = 'rgba(240, 240, 240, 0.3)';
                break;
            case 'red':
                var lineColor = 'red'; 
                var bgColor = 'rgba(250, 0, 0, 0.3)';
                break;
            default:
                this.log(`Color code for ${device.name} graph not recognized!`)
                var lineColor = 'red';
                var bgColor = 'rgba(250, 0, 0, 0.3)';    
        }
        var graphData = this.parseGraphData(device);
        var ctx = canvas.getContext('2d');
        var topicChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: graphData.times,
                datasets: [{
                    data: graphData.current,
                    backgroundColor: bgColor,
                    borderColor: lineColor,
                    borderWidth: 2,
                    pointRadius: 0,
                    spanGaps: false,
                    //fill: 'origin',
                }],
            },
            options: {
                responsive: false,
                maintainAspectRatio: true,
                spanGaps: false,
                animation: {
                    duration: 0,
                },
                scales: {
                    yAxes: [{
                        display: true,
                        ticks: {
                            //suggestedMax: 0.8,
                            //display: false,
                            beginAtZero: true,
                            fontSize: 14,
                            fontColor: '#eee',
                            maxTicksLimit: 4
                        }
                    }],
                    xAxes: [{
                        type: "time",
                        spanGaps: false,
                        time: {
                            unit: 'hour',
                            //unitStepSize: 0.25,
                            displayFormats: {
                                hour: this.config.chartxAxisFormat,
                                minute: this.config.chartxAxisFormat
                            },

                        },
                        gridLines: {
                            display: false,
                            borderDash: [5, 5],
                            zerLineWidth: 2,
                            zeroLineColor: '#ddd',
                            offsetGridLines: true,
                            drawTicks: true,
                        },
                        ticks: {
                            fontColor: '#eee',
                            fontSize: 14,
                            autoSkipPadding: 10,
                            maxTicksLimit: 6
                        }
                    }]
                },
                legend: { display: false, },
                borderColor: 'white',
                borderWidth: 1,
                cubicInterpolationMode: 'default',
            }
        });
    },

    log: function (msg) {
        if (this.config && this.config.debug) {
            console.log(this.name + ":", JSON.stringify(msg));
        }
    },
});
