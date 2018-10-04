import fs from 'fs';
import path from 'path';

import mri from 'mri';
import glob from 'glob';
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import colors from 'colors/safe';

import { i, w } from '@ez-trigger/server';

import {
  pluginPackagePath,
  serverPackagePath,
  configFile,
  configPath
} from './modules/config';
import welcomeMessage from './modules/welcome';
import Logger from './modules/Logger';

import TriggerServer from './modules/Server';

const DEBUG_NO_CUI = false;

// Argvs related code

const argvs = mri(process.argv);

console.log(i(`Current config path is: ${configPath}`));

// Dashboard related objects

const logger = new Logger();

logger.log(i('Initializing ezTrigger system dashboard.'));

const screen = blessed.screen({
  title: 'ezTrigger System'
});

// Server components
let clientTypes, actions;

clientTypes = {};
actions = {};

const server = new TriggerServer({
  ip: configFile.ip,
  port: configFile.port,
  clientTypes,
  logger: logger
});

// Scan the plugins dirs.

const pluginPackageManifestPaths = glob.sync(
  `${pluginPackagePath}/*/package.json`
);

const plugins = [];

if (pluginPackageManifestPaths.length) {
  logger.log(
    i(`Will read plugin package information from ${pluginPackagePath}.`)
  );

  logger.log(i(`Found ${pluginPackageManifestPaths.length} packages.`));

  const pluginPackageManifests = pluginPackageManifestPaths.map(filePath => {
    const rawData = fs.readFileSync(filePath);
    const result = JSON.parse(rawData);

    result.path = path.dirname(filePath);

    return result;
  });

  pluginPackageManifests.forEach(manifest => {
    logger.log(i(`Loading "${manifest.name}"...`));

    const pluginPackageClass = eval('require')(
      path.join(manifest.path, manifest.main)
    ).default;

    new pluginPackageClass(server).integrate();
  });
}

// Scan the server dirs.

const serverPackageManifestPaths = glob.sync(
  `${serverPackagePath}/*/package.json`
);

if (serverPackagePath.length) {
  logger.log(
    i(`Will read server package information from ${serverPackagePath}.`)
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

    const ServerPackageClass = eval('require')(
      path.join(manifest.path, manifest.main)
    ).default; //__non_webpack_require__
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
    EXP: 'experiment client'
  };
}

// Wait for several second before loading the cui.

logger.log(i('The system will start soon...'));
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);

// Start drawing the dashboard.

const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

const log = grid.set(0, 0, 8, 9, contrib.log, {
  label: 'Server Log'
});

const debugType = grid.set(8, 0, 4, 3, blessed.list, {
  label: 'Boroadcast Client Types',
  keys: true,
  style: {
    selected: {
      bg: '',
      fg: 'white',
      bold: true
    }
  }
});

const debugCommand = grid.set(8, 3, 4, 3, blessed.list, {
  label: 'Broadcast Commands',
  keys: true,
  style: {
    selected: {
      bg: '',
      fg: 'white',
      bold: true
    }
  }
});

const debugLatency = grid.set(8, 6, 4, 3, blessed.list, {
  label: 'Latency View'
});

const experiment = grid.set(0, 9, 5, 3, contrib.tree, {
  label: 'Experiment actions'
});

const users = grid.set(5, 9, 7, 3, contrib.table, {
  interactive: false,
  label: 'Connected clients',
  columnSpacing: 0,
  columnWidth: [10, 15, 5]
});

users.setData({
  headers: ['UUID', 'IP', 'Type'],
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

debugType.on('select', node => {
  const item = node.getText().match(/^\[[ X]\] (.*)$/)[1];
  const clientType = Object.entries(clientTypes).find(x => x[1] === item)[0];

  selectedTypes[clientType] = !selectedTypes[clientType];

  updateTypeUI(server.clientTypes);
});

debugCommand.on('select', node => {
  const command = node.getText();
  if (!Object.values(selectedTypes).filter(x => x).length) {
    logger.log(
      w(
        'No message sent, check some type of clients on the "Broadcast Client Types" box.'
      )
    );

    return false;
  }

  logger.log(
    i(`Broadcasting ${command} as debug information to all selected clients.`)
  );
  Object.keys(selectedTypes).map(type => {
    server.broadcast(command, type);
  });
});

screen.key(['C-c'], () => {
  return process.exit(0);
});

screen.key(['e'], () => {
  logger.log(i('Focused on experiment panel.'));
  experiment.rows.style.selected.bg = 'blue';
  debugType.style.selected.bg = '';
  debugCommand.style.selected.bg = '';
  experiment.focus();
  screen.render();
});

screen.key(['t'], () => {
  logger.log(i('Focused on broadcast client type panel.'));
  experiment.rows.style.selected.bg = '';
  debugType.style.selected.bg = 'blue';
  debugCommand.style.selected.bg = '';
  debugType.focus();
  screen.render();
});

screen.key(['c'], () => {
  logger.log(i('Focused on broadcast commands panel.'));
  experiment.rows.style.selected.bg = '';
  debugType.style.selected.bg = '';
  debugCommand.style.selected.bg = 'blue';
  debugCommand.focus();
  screen.render();
});

screen.on('resize', () => {
  log.emit('attach');
});

const logFn = msg => {
  log.log(`${msg}`);
  screen.render();
};

const selectedTypes = {};

const updateTypeUI = clientTypes => {
  const uiElements = Object.keys(clientTypes).map(
    clientType =>
      `[${selectedTypes[clientType] ? 'X' : ' '}] ${clientTypes[clientType]}`
  );

  debugType.setItems(uiElements);

  screen.render();
};

const updateCommandUI = commands => {
  debugCommand.setItems(server.debugCommands);
};

const updateClientUI = clients => {
  const result = [];

  Object.values(clients).forEach(client => {
    const type = client.props.type ? client.props.type : '???';

    const id = client.props.id
      ? colors.white(client.props.id)
      : client.shortUuid;

    result.push([id, client.ip, type]);
  });

  users.setData({
    headers: ['ID', 'IP', 'Type'],

    data: result
  });

  screen.render();

  return true;
};

server.on('client-updated', updateClientUI);
server.on('type-updated', updateTypeUI);
server.on('debug-command-updated', updateCommandUI);

(async () => {
  logger.setTarget(logFn);

  welcomeMessage.split('\n').forEach(msg => logger.log(msg));
  logger.log('');

  await server.start();
  updateTypeUI(server.clientTypes);
  updateCommandUI(server.debugCommands);
  experiment.focus();
})();
