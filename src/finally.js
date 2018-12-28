"use strict";

var Promise = require("./core.js");

module.exports = Promise;

/**
 * f 表示finally函数接受的函数参数
 */
Promise.prototype.finally = function(f) {
  return this.then(
    function(value) {
      return Promise.resolve(f()).then(function() {
        return value;
      });
    },
    function(err) {
      return Promise.resolve(f()).then(function() {
        throw err;
      });
    }
  );
};
