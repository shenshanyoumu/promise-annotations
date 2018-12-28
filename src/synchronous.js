"use strict";

var Promise = require("./core.js");

module.exports = Promise;

// 允许promise的同步执行
Promise.enableSynchronous = function() {
  Promise.prototype.isPending = function() {
    return this.getState() == 0;
  };

  Promise.prototype.isFulfilled = function() {
    return this.getState() == 1;
  };

  Promise.prototype.isRejected = function() {
    return this.getState() == 2;
  };

  Promise.prototype.getValue = function() {
    // 内部状态值为3，表示当前promise状态发生改变
    if (this._state === 3) {
      return this._value.getValue();
    }

    // 如果promise出于pending状态或者rejected状态，则调用当前函数会报错
    if (!this.isFulfilled()) {
      throw new Error("Cannot get a value of an unfulfilled promise.");
    }

    return this._value;
  };

  Promise.prototype.getReason = function() {
    if (this._state === 3) {
      return this._value.getReason();
    }

    // 当promise状态不会rejected，则无法得到错误原因
    if (!this.isRejected()) {
      throw new Error(
        "Cannot get a rejection reason of a non-rejected promise."
      );
    }

    return this._value;
  };

  //获得当前promise对象的状态
  Promise.prototype.getState = function() {
    if (this._state === 3) {
      return this._value.getState();
    }
    if (this._state === -1 || this._state === -2) {
      return 0;
    }

    return this._state;
  };
};

// 禁止promise的所有同步方法
Promise.disableSynchronous = function() {
  Promise.prototype.isPending = undefined;
  Promise.prototype.isFulfilled = undefined;
  Promise.prototype.isRejected = undefined;
  Promise.prototype.getValue = undefined;
  Promise.prototype.getReason = undefined;
  Promise.prototype.getState = undefined;
};
