'use strict';

const EventEmitter = require('events');

class Aedes extends EventEmitter {
  constructor() {
    super();
    this.handle = jest.fn();
    this.publish = jest.fn((packet, callback) => { if (callback) callback(null); });
    this.close = jest.fn((callback) => { if (callback) callback(); });
  }

  static async createBroker(options) {
    const broker = new Aedes();
    if (options && options.preConnect) {
      broker._preConnect = options.preConnect;
    }
    return broker;
  }
}

module.exports = { Aedes };
