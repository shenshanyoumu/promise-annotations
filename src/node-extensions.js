'use strict';

// This file contains then/promise specific extensions that are only useful
// for node.js interop

var Promise = require('./core.js');
var asap = require('asap');

module.exports = Promise;

/* Static Functions */

Promise.denodeify = function(fn, argumentCount) {
    if (
        typeof argumentCount === 'number' && argumentCount !== Infinity
    ) {
        return denodeifyWithCount(fn, argumentCount);
    } else {
        return denodeifyWithoutCount(fn);
    }
};

var callbackFn = (
    'function (err, res) {' +
    'if (err) { rj(err); } else { rs(res); }' +
    '}'
);

function denodeifyWithCount(fn, argumentCount) {
    var args = [];
    for (var i = 0; i < argumentCount; i++) {
        args.push('a' + i);
    }
    // 返回的外层函数其接受的参数形如a1,a2...
    var body = [
        'return function (' + args.join(',') + ') {',
        'var self = this;',
        'return new Promise(function (rs, rj) {',
        'var res = fn.call(', ['self'].concat(args).concat([callbackFn]).join(','),
        ');',
        'if (res &&',
        '(typeof res === "object" || typeof res === "function") &&',
        'typeof res.then === "function"',
        ') {rs(res);}',
        '});',
        '};'
    ].join('');

    // Function构造函数形如([args1,arg2,...,]函数体)
    return Function(['Promise', 'fn'], body)(Promise, fn);
}

function denodeifyWithoutCount(fn) {
    // fn.length表示计算函数的形式参数
    var fnLength = Math.max(fn.length - 1, 3);
    var args = [];
    for (var i = 0; i < fnLength; i++) {
        args.push('a' + i);
    }
    var body = [
        'return function (' + args.join(',') + ') {',
        'var self = this;',
        'var args;',
        'var argLength = arguments.length;',
        'if (arguments.length > ' + fnLength + ') {',
        'args = new Array(arguments.length + 1);',
        'for (var i = 0; i < arguments.length; i++) {',
        'args[i] = arguments[i];',
        '}',
        '}',
        'return new Promise(function (rs, rj) {',
        'var cb = ' + callbackFn + ';',
        'var res;',
        'switch (argLength) {',
        args.concat(['extra']).map(function(_, index) {
            return (
                'case ' + (index) + ':' +
                'res = fn.call(' + ['self'].concat(args.slice(0, index)).concat('cb').join(',') + ');' +
                'break;'
            );
        }).join(''),
        'default:',
        'args[argLength] = cb;',
        'res = fn.apply(self, args);',
        '}',

        'if (res &&',
        '(typeof res === "object" || typeof res === "function") &&',
        'typeof res.then === "function"',
        ') {rs(res);}',
        '});',
        '};'
    ].join('');

    return Function(
        ['Promise', 'fn'],
        body
    )(Promise, fn);
}

Promise.nodeify = function(fn) {
    return function() {
        var args = Array.prototype.slice.call(arguments);

        // 参数列表最后一个参数为回调函数
        var callback =
            typeof args[args.length - 1] === 'function' ? args.pop() : null;
        var ctx = this;
        try {
            // 再次执行原型方法nodeify
            return fn.apply(this, arguments).nodeify(callback, ctx);
        } catch (ex) {
            if (callback === null || typeof callback == 'undefined') {
                return new Promise(function(resolve, reject) {
                    reject(ex);
                });
            } else {
                asap(function() {
                    callback.call(ctx, ex);
                })
            }
        }
    }
};

// 将promise对象转化为node风格的回调函数
Promise.prototype.nodeify = function(callback, ctx) {
    // 如果连函数都不是，则直接返回
    if (typeof callback != 'function')
        return this;
    // 理解promise的核心在于，then方法是前一个promise对象的方法
    // 并且即使在then中修改了promise的状态，也不会影响前一个promise的状态
    this.then(function(value) {
        // 异步调用库
        asap(function() {
            callback.call(ctx, null, value);
        });
    }, function(err) {
        asap(function() {
            callback.call(ctx, err);
        });
    });
};