'use strict';

var Promise = require('./core.js');
// 类似try-catch-finally语句
module.exports = Promise;
Promise.prototype.finally = function(f) {
    return this.then(function(value) {
        return Promise.resolve(f()).then(function() {
            return value;
        });
    }, function(err) {
        return Promise.resolve(f()).then(function() {
            throw err;
        });
    });
};