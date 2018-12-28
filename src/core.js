"use strict";

// 更高效的ASAP异步执行库,ASAP表示as soon as possible
var asap = require("asap/raw");

// 空函数
function noop() {}

// 保存promise执行过程中最近的错误信息
var LAST_ERROR = null;
var IS_ERROR = {};

// 获得当前对象的then方法，如果没有then方法则报错
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
    //一般在then注册的回调函数接受单参数
    return fn(a);
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

// 双参数函数调用
function tryCallTwo(fn, a, b) {
  try {
    // 一般在promise构造器接受的executor执行器函数接受两个参数
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

  // 延迟计算的内部状态
  this._deferredState = 0;

  // promise对象初始状态为pending
  this._state = 0;

  // promise实例在状态变化时得到的值
  this._value = null;

  // 一系列then回调函数构成的数组，有些promise实现中称之为handlers数组
  this._deferreds = null;

  //  其实就是该promise实例没有执行任何任务，只是一个空壳
  if (fn === noop) {
    return;
  }

  // promise构造函数中调用，因此Promise构造器中除了初始化内部状态，真正的异步操作都在fn中定义
  doResolve(fn, this);
}

// 在promise状态发生变化时调用的回调函数
Promise._onHandle = null;
Promise._onReject = null;
Promise._noop = noop;

/**
 * onFulfilled 在当前promise状态为resolve触发的回调
 * onRejected 在当前promise状态为reject触发的回调
 */
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

/**
 * 将非promise对象转换为promise结构
 * @param {*} self 表示当前调用then的实例对象，可能不是promise对象
 * @param {*} onFulfilled 用于构建promise对象的回调函数
 * @param {*} onRejected 用于构建promise对象的回调函数
 */
function safeThen(self, onFulfilled, onRejected) {
  return new self.constructor(function(resolve, reject) {
    // 创建新的promise对象
    var res = new Promise(noop);
    res.then(resolve, reject);
    handle(self, new Handler(onFulfilled, onRejected, res));
  });
}

/**
 *
 * @param {*} self 不同上下文中的promise实例对象
 * @param {*} deferred 注册到then上的回调函数
 */
function handle(self, deferred) {
  // 内部状态为3，表示调用then返回新的promise实例
  // 而self._value得到当前promise实例链接的后一个promise实例
  // 迭代进行，直到调用链最后一个promise 实例
  while (self._state === 3) {
    self = self._value;
  }
  // promise对象绑定了处理句柄函数
  if (Promise._onHandle) {
    Promise._onHandle(self);
  }
  // 当前promise实例状态为pending
  if (self._state === 0) {
    // 当前promise对象延迟计算
    if (self._deferredState === 0) {
      self._deferredState = 1;
      self._deferreds = deferred;
      return;
    }
    if (self._deferredState === 1) {
      self._deferredState = 2;

      // 关键的一句代码，用于将promise链式调用中所有注册到then上的回调函数保存在内部_deferreds数组
      self._deferreds = [self._deferreds, deferred];
      return;
    }
    self._deferreds.push(deferred);
    return;
  }
  handleResolved(self, deferred);
}

/**
 *
 * @param {*} self
 * @param {*} deferred
 */
function handleResolved(self, deferred) {
  // 异步调用库
  asap(function() {
    // 当promise状态变为resolved，则查看当前promise的then方法注册的回调
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

    // 在then方法中注册的回调函数接受单参数
    var ret = tryCallOne(cb, self._value);
    if (ret === IS_ERROR) {
      reject(deferred.promise, LAST_ERROR);
    } else {
      resolve(deferred.promise, ret);
    }
  });
}

/**
 *
 * @param {*} self 当前promise实例对象
 * @param {*} newValue 执行resolve的回调参数
 */
function resolve(self, newValue) {
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
    // newValue可以是新的promise对象
    var then = getThen(newValue);
    if (then === IS_ERROR) {
      return reject(self, LAST_ERROR);
    }

    // 调用then返回新的promise时，则将当前promise实例状态修改为3
    if (then === self.then && newValue instanceof Promise) {
      self._state = 3;

      // todo:这一句代码非常关键，即构成promise链条的核心
      // 通过当前promise实例可以不断通过调用_value属性得到后续所有promise实例对象
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

/**
 *
 * @param {*} self 当前上下文的promise实例
 * @param {*} newValue 执行构造器的异步任务产生的新的value
 */
function reject(self, newValue) {
  // 修改当前promise实例状态为rejected
  self._state = 2;
  self._value = newValue;

  // 表示绑定的静态方法
  if (Promise._onReject) {
    Promise._onReject(self, newValue);
  }
  finale(self);
}

/**
 *
 * @param {*} self 注意这个self参数在不同上下文表示不同promise实例对象
 */
function finale(self) {
  // 注册到then方法上的回调函数依次执行
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

/**
 *
 * @param {*} onFulfilled 当前promise实例状态resolved时的回调
 * @param {*} onRejected 当前promise实例状态rejected时的回调
 * @param {*} promise 特定的promise对象
 */
function Handler(onFulfilled, onRejected, promise) {
  this.onFulfilled = typeof onFulfilled === "function" ? onFulfilled : null;
  this.onRejected = typeof onRejected === "function" ? onRejected : null;

  this.promise = promise;
}

/**
 * 在fn函数执行体中，根据当前执行结果来调用promise内部实现的resolve/reject函数
 * @param {*} fn 包含异步操作的函数
 * @param {*} promise promise实例对象
 */
function doResolve(fn, promise) {
  var done = false;

  // fn函数接受两个参数，分别为resolve状态回调以及reject状态回调
  // 因此在Promise构造函数中，下面代码真正执行构造器fn参数函数
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
