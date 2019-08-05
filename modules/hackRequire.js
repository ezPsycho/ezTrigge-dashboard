global.__non_webpack_require__ = require;

const mock = __non_webpack_require__('mock-require');

const serverModules = require('@ez-trigger/server');

const hackRequire = () => {
  mock('~server', serverModules);
}

export default hackRequire;
