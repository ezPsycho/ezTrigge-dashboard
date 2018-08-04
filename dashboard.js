import fs from 'fs';
import path from 'path';

import mri from 'mri';
import glob from 'glob';
import blessed from 'blessed';
import contrib from 'blessed-contrib';

import { i } from '@ez-trigger/server';

import config from './config';
import welcomeMessage from './modules/welcome';
import Logger from './modules/Logger';

import TriggerServer from './modules/Server';
import EzNirsTrigger from './modules/EzNirsTrigger';

const DEBUG_NO_CUI = false;

// Argvs related code

const argvs = mri(process.argv);

// Dashboard related objects

const logger = new Logger();

logger.log(i('Initializing ezTrigger system dashboard.'));

const screen = blessed.screen();

// Server components
let clientTypes, actions;

clientTypes = {};
actions = {};

const server = new TriggerServer({
  ip: config.ip,
  port: config.port,
  clientTypes,
  logger: logger
});

const triggerSystem = new EzNirsTrigger(server);

// Scan the server dirs.

if (argvs._ && argvs._[2]) {
  const serverPackagePath = argvs._[2].replace(/\\/g, '/');

  logger.log(
    i(`Will read server package information from ${serverPackagePath}.`)
  );

  const serverPackageManifestPaths = glob.sync(
    `${serverPackagePath}/*/package.json`
  );

  logger.log(i(`Found ${serverPackageManifestPaths.length} packages.`));

  const serverPackageManifests = serverPackageManifestPaths.map(filePath => {
    const rawData = fs.readFileSync(filePath);
    const result = JSON.parse(rawData);

    result.path = path.dirname(filePath);

    return result;
  });

  serverPackageManifests.forEach(manifest => {
    logger.log(i(`Loading "${manifest.functionListName}"...`));

    const ServerPackageClass = require(path.join(manifest.path, manifest.main))
      .default;
    const serverPackageObject = new ServerPackageClass(server);

    clientTypes[manifest.clientTypeId] = manifest.clientTypeName;
    actions[manifest.functionListName] = { children: {} };

    serverPackageObject.fns.forEach(fnDescription => {
      actions[manifest.functionListName].children[fnDescription.name] = {
        fn: fnDescription.fn
      };
    });
  });
} else {
  clientTypes = {
    TRG: 'ezNirsTrigger client',
    EXP: 'experiment client'
  };
}

// Start drawing the dashboard.

const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

const log = grid.set(0, 0, 8, 9, contrib.log, {
  label: 'Server Log'
});

const experiment = grid.set(0, 9, 6, 3, contrib.tree, {
  label: 'Experiment actions'
});

const users = grid.set(6, 9, 6, 3, contrib.table, {
  interactive: false,
  label: 'Connected client',
  columnSpacing: 1,
  columnWidth: [7, 15, 5]
});

users.setData({
  headers: ['UUID', 'IP', 'Group'],
  data: []
});

experiment.setData({
  lines: false,
  extended: true,
  children: actions
});

experiment.on('select', node => {
  if (node.fn) {
    node.fn();
  }
});

const logFn = msg => {
  log.log(msg);
  screen.render();
};

screen.key(['C-c'], () => {
  return process.exit(0);
});

screen.on('resize', () => {
  log.emit('attach');
});

(async () => {
  logger.setTarget(logFn);

  welcomeMessage.split('\n').forEach(msg => logger.log(msg));
  logger.log('');

  triggerSystem.integrate();
  await server.start();

  experiment.focus();
})();
