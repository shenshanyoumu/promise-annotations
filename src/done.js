'use strict';

// require与import的不同之处在于，require会执行模块文件并返回对象
// import会返回引用
var Promise = require('./core.js');

module.exports = Promise;

// Promise原型对象增加done
Promise.prototype.done = function(onFulfilled, onRejected) {
    // 如果done方法没有回调函数，则self指向当前promise对象
    // 如果done方法接收了回调函数作为参数，则self指向当前promise对象的then方法
    var self = arguments.length ? this.then.apply(this, arguments) : this;

    // 异步执行，如果promise状态为resolve则结束；如果时rejected则向外部抛出异常
    self.then(null, function(err) {
        setTimeout(function() {
            throw err;
        }, 0);
    });
};