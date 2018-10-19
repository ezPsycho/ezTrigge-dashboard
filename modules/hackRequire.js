import mock from 'mock-require';

const serverModules = require('@ez-trigger/server');

const hackRequire = () => {
  mock('~server', serverModules);
}

export default hackRequire;
