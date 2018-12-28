# promise-annotations

对 promise 库的注解，帮助开发者加深理解.

## promise 实例对象的链接

```
  // 内部状态为3，表示调用then返回新的promise实例
  // 而self._value得到当前promise实例链接的后一个promise实例
  // 迭代进行，直到调用链最后一个promise 实例，也即最后一个then调用
  while (self._state === 3) {
    self = self._value;
  }

```
