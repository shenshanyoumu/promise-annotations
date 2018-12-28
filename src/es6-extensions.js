'use strict';

//This file contains the ES6 extensions to the core Promises/A+ API

var Promise = require('./core.js');
module.exports = Promise;

/* Static Functions */
// 这些方法用于构建基本类型的promise对象，当然属于同步调用
var TRUE = valuePromise(true);
var FALSE = valuePromise(false);
var NULL = valuePromise(null);
var UNDEFINED = valuePromise(undefined);
var ZERO = valuePromise(0);
var EMPTYSTRING = valuePromise('');

// 设置状态为resolve并且值为value的promise对象
function valuePromise(value) {

    var p = new Promise(Promise._noop);
    p._state = 1;
    p._value = value;
    return p;
}

// 返回一个状态为resolve，值为value的promise对象
Promise.resolve = function(value) {
    if (value instanceof Promise)
        return value;

    if (value === null) return NULL;
    if (value === undefined) return UNDEFINED;
    if (value === true) return TRUE;
    if (value === false) return FALSE;
    if (value === 0) return ZERO;
    if (value === '') return EMPTYSTRING;

    if (typeof value === 'object' || typeof value === 'function') {
        try {
            // 如果value对象实现了thenable接口，则得到then属性方法
            // 并利用then属性方法作为promise构造函数参数生成新的promise对象
            var then = value.then;
            if (typeof then === 'function') {
                return new Promise(then.bind(value));
            }
        } catch (ex) {
            return new Promise(function(resolve, reject) {
                reject(ex);
            });
        }
    }
    return valuePromise(value);
};

Promise.all = function(arr) {
    // all方法的参数是实现了iterable接口的对象
    var args = Array.prototype.slice.call(arr);

    return new Promise(function(resolve, reject) {
        if (args.length === 0)
            return resolve([]);
        var remaining = args.length;

        function res(i, val) {
            if (val && (typeof val === 'object' || typeof val === 'function')) {
                if (val instanceof Promise && val.then === Promise.prototype.then) {
                    // 如果promise对象状态为3，即接收到另一个promise的状态
                    while (val._state === 3) {
                        val = val._value;
                    }
                    // resolve状态的promise对象
                    if (val._state === 1) return res(i, val._value);

                    // rejected状态的promise对象
                    if (val._state === 2) reject(val._value);

                    // promise对象的then方法注册回调
                    val.then(function(val) {
                        res(i, val);
                    }, reject);
                    return;
                } else {

                    // val参数实现了thenable接口
                    // 则将then属性函数作为参数传递给promise构造函数
                    var then = val.then;
                    if (typeof then === 'function') {
                        var p = new Promise(then.bind(val));
                        p.then(function(val) {
                            res(i, val);
                        }, reject);
                        return;
                    }
                }
            }
            // 可以知道所有完成的promise对象计算结果保存在数组中，而且数组中结果顺序与调用顺序一致
            args[i] = val;
            if (--remaining === 0) {
                resolve(args);
            }
        }

        // 依次调用所有promise对象
        for (var i = 0; i < args.length; i++) {
            res(i, args[i]);
        }
    });
};

Promise.reject = function(value) {
    return new Promise(function(resolve, reject) {
        reject(value);
    });
};

// 只要有一个promise对象状态发生改变则，返回对应的结果
Promise.race = function(values) {
    return new Promise(function(resolve, reject) {
        values.forEach(function(value) {
            Promise.resolve(value).then(resolve, reject);
        });
    });
};

/* Prototype Methods */
// catch方法就是then(null,onRejected)的语法糖
Promise.prototype['catch'] = function(onRejected) {
    return this.then(null, onRejected);
};