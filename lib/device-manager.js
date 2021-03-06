'use strict';
/*
 * Guerilla
 * Copyright 2015, Yahoo Inc.
 * Copyrights licensed under the MIT License.
 *
 * Keeps track of registered devices.
 */

var async = require('async');
var execSync = require('child_process').execSync;
var path = require('path');
var config = require('./config');
var Device = require('./device');

/**
 *
 * @param oslevel String e.g. 'iOS 9.1'
 * @param line String to parse e.g. 'iPhone 4s (05686243-BA24-44CE-94D9-D6823BF96E46) (Shutdown) {(unavailable, ...)}'
 * @returns Device-like JSON object suitable for new Device(some-json).
 * Given:
 *   osLevel: 'iOS 9.1'
 *   line: 'iPhone 4s (05686243-BA24-44CE-94D9-D6823BF96E46) (Shutdown)'
 * this method will return
 *   { tag: 'ios-simulator,OS=9.1,name=iPhone 4s',
 *     platform: 'ios',
 *     identifier: '05686243-BA24-44CE-94D9-D6823BF96E46',
 *     name: 'ios-simulator iPhone 4s',
 *     simulator: true,
 *     destination: 'OS=9.1,name=iPhone 4s'
 *   }
 *
 */
function createDevice(oslevel, line) {
	if (line.indexOf('unavailable') !== -1) throw new Error('createDevice-fed an unavailable device:' + oslevel + ':' +  line);
	var openParenIndex = line.indexOf('(');
	var closeParenIndex = line.indexOf(')');
	if (openParenIndex === -1) throw new Error("createDevice: could not find open paren in: " + oslevel + ':' + line);
	if (closeParenIndex === -1) throw new Error("createDevice: could not find close paren in: " + oslevel + ':' + line);
	var identifier = line.slice(openParenIndex + 1, closeParenIndex);
	if (identifier.length < 10) throw new Error('createDevice: could not find valid identifier in:' + oslevel + ':' + line);
	var name = line.slice(0, openParenIndex).trim();
	var osVersion = oslevel.split(' ')[1]; // oslevel is of form 'iOS 9.1'
	return {
		tag: 'ios-simulator,OS=' + osVersion + ',name=' + name,
		platform: 'ios',
        identifier: identifier,
		name: 'ios-simulator ' + name + ' (' + osVersion + ')',
		OS: oslevel,
		simulator: true,
		destination: 'OS=' + osVersion + ',name=' + name
	};
}

function isHeader(line) {
	var snippet =  line.slice(0,2);
	return (snippet === '--' || snippet === '==');
}

/**
 * A line oriented Stream over Simctl output from running $xcrun simctl list
 * @param array {Array.<String>}
 * @returns {{next: Function, advanceTillMatch: Function, hasMore: Function, nextValue: Function, nextValueAsOSLevel: Function, peekHasNextLineEntry: Function, peekIsHeader: Function, peekIsDoubleEquals: Function, peek: Function}}
 */
function makeSimctlStream(lines) {
	var nextIndex = 0;

	return {
		next: function () {
			return this.hasMore() ?
			{value: lines[nextIndex++], done: false} :
			{done: true};
		},

		advanceTillMatch: function(line) {
			var result;
			do {
				result = this.next();

			} while (!result.done && (result.value.slice(0,line.length) !== line));
			if (result.done) throw new Error('unexpected end while advancingTillMatch:' + line);
		},

		hasMore: function() {
			return nextIndex < lines.length;
		},

		nextValue: function() {
			var result = this.next();
			if (result.done) throw new Error("unexpected end during nextValue()");
			return result.value;
		},

		nextValueAsOSLevel: function() {
			var value  = this.nextValue();
			if (value.indexOf('--') !== 0) {
				throw new Error('expected oslevel prefix of "--" in:' + value);
			}
			var sliceStart = 2;
			var sliceEnd = value.indexOf('--', 2);

			return value.slice(sliceStart, sliceEnd).trim();
		},

		peekHasNextLineEntry: function() {
			return (this.hasMore() && !this.peekIsHeader());
		},

		peekIsHeader: function() {
			return this.hasMore() && isHeader(this.peek());
		},

		peekIsDoubleEquals: function() {
			return this.peek().indexOf("==") === 0;
		},

		peek: function() {
			return lines[nextIndex];
		}

	};
}

/**
 *
 * @param stream
 * @returns {Array.<Device>}
 */
function getOSLevelEntries(stream) {
	var results = [];
	while (stream.hasMore() && !stream.peekIsDoubleEquals()) {
		var oslevel = stream.nextValueAsOSLevel();
		while (stream.peekHasNextLineEntry()) {
			var line = stream.nextValue();
			if (line.indexOf('unavailable') === -1) {
				results.push(createDevice(oslevel, line));
			}
		}
	}
	return results;
}


function getSimulatedDevicesFromLines(lines) {
	var stream = makeSimctlStream(lines);
	stream.advanceTillMatch('== Device Types ==');
	stream.advanceTillMatch('== Devices ==');
	//we're now just at the first os level entry.
	return getOSLevelEntries(stream);
}

function getSimulatedDevices(simctlString) {
	return getSimulatedDevicesFromLines(simctlString.split('\n'));
}

function getSimctlData() {
	var out =   execSync('xcrun simctl list', {timeout: 10000});
	return out.toString(); //can be buffer object
}

function DeviceManager() {
	var self = this;
	self.devicesByTag = new Map();
	self.devices = [];
	var configDevices = Array.isArray(config.devices) ? config.devices : [];

	var simctlData = getSimctlData();

	var simulatedDevices = getSimulatedDevices(simctlData);
	var allDevices = configDevices.concat(simulatedDevices);
	allDevices.forEach(function (json) {
		var device = new Device(json);
		self.devicesByTag.set(device.tag, device);
		self.devices.push(device);
	});
}



DeviceManager.prototype.findByTag = function (tag) {
	var result = this.devicesByTag.get(tag);
	return result ? result : null;
};

module.exports = new DeviceManager();