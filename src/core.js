"use strict";

// 更高效的ASAP异步执行库
var asap = require("asap/raw");

// 空函数
function noop() {}

// 保存promise执行过程中最近的错误信息
var LAST_ERROR = null;
var IS_ERROR = {};

// obj对象实现了thenable接口，可能是promise对象
function getThen(obj) {
  try {
    return obj.then;
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

// 单参数函数调用
function tryCallOne(fn, a) {
  try {
    // 注意，下面函数不确定是异步还是同步
    return fn(a);
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

// 双参数函数调用
function tryCallTwo(fn, a, b) {
  try {
    // 注意，下面函数不确定是异步还是同步
    fn(a, b);
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

// 导出promise函数
module.exports = Promise;

// 参数fn必须
function Promise(fn) {
  if (typeof this !== "object") {
    throw new TypeError("Promises must be constructed via new");
  }
  if (typeof fn !== "function") {
    throw new TypeError("Promise constructor's argument is not a function");
  }
  this._deferredState = 0;

  // promise对象初始状态为pending
  this._state = 0;

  // promise实例在状态变化时得到的值
  this._value = null;

  // 一系列then回调函数构成的数组
  this._deferreds = null;

  // 如果构造函数传递到函数参数为noop,则返回
  // 但是采用new创建的新promise对象已经生成
  if (fn === noop) {
    return;
  }

  // promise构造函数中调用
  doResolve(fn, this);
}

// 在promise状态发生变化时调用的回调函数
Promise._onHandle = null;
Promise._onReject = null;
Promise._noop = noop;

Promise.prototype.then = function(onFulfilled, onRejected) {
  // 如果当前对象不是promise实例对象，则构建一个promise实例
  if (this.constructor !== Promise) {
    return safeThen(this, onFulfilled, onRejected);
  }
  // then方法调用后，创建新的promise对象
  var res = new Promise(noop);
  handle(this, new Handler(onFulfilled, onRejected, res));
  return res;
};

function safeThen(self, onFulfilled, onRejected) {
  return new self.constructor(function(resolve, reject) {
    // 创建新的promise对象
    var res = new Promise(noop);
    res.then(resolve, reject);
    handle(self, new Handler(onFulfilled, onRejected, res));
  });
}

function handle(self, deferred) {
  // state为3，表示接收另一个promise对象的状态
  while (self._state === 3) {
    self = self._value;
  }
  // promise对象绑定了处理句柄函数
  if (Promise._onHandle) {
    Promise._onHandle(self);
  }
  // 当然promise处理pending状态
  if (self._state === 0) {
    // 当前promise对象延迟计算
    if (self._deferredState === 0) {
      self._deferredState = 1;
      self._deferreds = deferred;
      return;
    }
    if (self._deferredState === 1) {
      self._deferredState = 2;
      self._deferreds = [self._deferreds, deferred];
      return;
    }
    self._deferreds.push(deferred);
    return;
  }
  handleResolved(self, deferred);
}

function handleResolved(self, deferred) {
  // 异步调用库
  asap(function() {
    var cb = self._state === 1 ? deferred.onFulfilled : deferred.onRejected;
    if (cb === null) {
      // 当前promise对象状态变为resolve状态
      if (self._state === 1) {
        resolve(deferred.promise, self._value);
      } else {
        reject(deferred.promise, self._value);
      }
      return;
    }
    var ret = tryCallOne(cb, self._value);
    if (ret === IS_ERROR) {
      reject(deferred.promise, LAST_ERROR);
    } else {
      resolve(deferred.promise, ret);
    }
  });
}

// 在promise对象状态为resolve时，传入promise对象得到的值
function resolve(self, newValue) {
  // Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
  if (newValue === self) {
    return reject(
      self,
      new TypeError("A promise cannot be resolved with itself.")
    );
  }
  if (
    newValue &&
    (typeof newValue === "object" || typeof newValue === "function")
  ) {
    // 获得新promise的then属性
    var then = getThen(newValue);
    if (then === IS_ERROR) {
      return reject(self, LAST_ERROR);
    }
    if (then === self.then && newValue instanceof Promise) {
      //
      self._state = 3;
      self._value = newValue;
      finale(self);
      return;
    } else if (typeof then === "function") {
      doResolve(then.bind(newValue), self);
      return;
    }
  }
  // state为1表示resolve状态
  self._state = 1;
  self._value = newValue;
  finale(self);
}

// 当promise状态变为rejected
function reject(self, newValue) {
  self._state = 2;
  self._value = newValue;
  if (Promise._onReject) {
    Promise._onReject(self, newValue);
  }
  finale(self);
}

// 结束所有延迟执行的promise任务
function finale(self) {
  if (self._deferredState === 1) {
    handle(self, self._deferreds);
    self._deferreds = null;
  }
  if (self._deferredState === 2) {
    for (var i = 0; i < self._deferreds.length; i++) {
      handle(self, self._deferreds[i]);
    }
    self._deferreds = null;
  }
}

// 在promise的状态发生改变时，根据状态类型调用不同的回调
function Handler(onFulfilled, onRejected, promise) {
  this.onFulfilled = typeof onFulfilled === "function" ? onFulfilled : null;
  this.onRejected = typeof onRejected === "function" ? onRejected : null;
  this.promise = promise;
}

function doResolve(fn, promise) {
  var done = false;

  //下面fn即promise构造器函数参数，或者then的函数参数。
  // 注意，下面resolve/reject函数才是promise实现中真正的函数
  var res = tryCallTwo(
    fn,
    function(value) {
      if (done) return;
      done = true;
      resolve(promise, value);
    },
    function(reason) {
      if (done) return;
      done = true;
      reject(promise, reason);
    }
  );
}
