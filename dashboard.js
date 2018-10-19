import fs from 'fs';
import path from 'path';

import mri from 'mri';
import glob from 'glob';
import fse from 'fs-extra';
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import colors from 'colors/safe';

import { getTimestamp } from '@ez-trigger/core';
import { i, w } from '@ez-trigger/server';

import {
  recordExportPath,
  pluginPackagePath,
  serverPackagePath,
  configFile
} from './modules/config';
import Logger from './modules/Logger';
import hackRequire from './modules/hackRequire';
import welcomeMessage from './modules/welcome';

import TriggerServer from './modules/Server';

// We hacked node's require method here, to ensure that 
// each plugin and program can get the '@ezTrigger/server' 
// without installing them in their own path.
hackRequire();

const DEBUG_NO_CUI = false;

// Argvs related code

const argvs = mri(process.argv);

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

const tools = [
  {
    label: 'Records',
    getBadge: () => server.records.data.length
  },
  {
    label: ' Export Records',
    fn: async () => {
      fse.ensureDirSync(recordExportPath);
      const exportPath = await server.records.export('record');
      logger.log(i(`Exported the records to: ${exportPath}`));
    }
  },
  {
    label: ' Clear Records',
    fn: () => {
      server.records.clear();
      logger.log(i(`Records cleared.`));
    }
  },
  {
    label: 'Logs',
    getBadge: () => logWidget.logLines.length
  },
  {
    label: ' Export Logs',
    fn: async () => {
      const logLines = logWidget.logLines.join('\n');
      const exportPath = path.join(
        recordExportPath,
        `log ${getTimestamp()}.log`
      );
      await fse.writeFile(exportPath, logLines);

      logger.log(i(`Exported the records to: ${exportPath}`));
    }
  }
];

const getToolItems = () =>
  tools.map(
    //item => ()
    item => (item.getBadge ? `${item.label} [${item.getBadge()}]` : item.label)
  );

// Wait for several second before loading the cui.

logger.log(i('The system will start soon...'));
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);

// Start drawing the dashboard.

const generateUnselectedWidgetStyle = () => ({
  selected: {
    bg: '',
    fg: 'white',
    bold: true
  }
});

const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

const logWidget = grid.set(0, 0, 8, 9, contrib.log, {
  label: 'Server Log'
});

const debugTypeWidget = grid.set(8, 0, 4, 3, blessed.list, {
  label: 'Boroadcast Client Types',
  keys: true,
  style: generateUnselectedWidgetStyle()
});

const debugCommandWidget = grid.set(8, 3, 4, 3, blessed.list, {
  label: 'Broadcast Commands',
  keys: true,
  style: generateUnselectedWidgetStyle()
});

const toolListWidget = grid.set(8, 6, 4, 3, blessed.list, {
  label: 'Tools',
  keys: true,
  style: generateUnselectedWidgetStyle()
});

toolListWidget.on('select', (_, itemIndex) => {
  if (tools[itemIndex].fn) {
    tools[itemIndex].fn();
  }
});

const experimentWidget = grid.set(0, 9, 5, 3, contrib.tree, {
  label: 'Experiment Actions',
  style: {
    selected: {
      bg: 'blue',
      fg: 'white',
      bold: true
    }
  }
});

const userWidget = grid.set(5, 9, 7, 3, contrib.table, {
  interactive: false,
  label: 'Connected clients',
  columnSpacing: 0,
  columnWidth: [10, 15, 5]
});

userWidget.setData({
  headers: ['UUID', 'IP', 'Type'],
  data: []
});

experimentWidget.setData({
  lines: false,
  extended: true,
  children: actions
});

experimentWidget.on('select', node => {
  if (node.fn) {
    node.fn();
  }
});

debugTypeWidget.on('select', node => {
  const item = node.getText().match(/^\[[ X]\] (.*)$/)[1];
  const clientType = Object.entries(clientTypes).find(x => x[1] === item)[0];

  selectedTypes[clientType] = !selectedTypes[clientType];

  updateTypeUI(server.clientTypes);
});

debugCommandWidget.on('select', node => {
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

let currentFocusIndex = 0;
const focusOrder = [
  {
    widget: experimentWidget,
    repaintStyleTarget: experimentWidget.rows.style.selected
  },
  {
    widget: debugTypeWidget,
    repaintStyleTarget: debugTypeWidget.style.selected
  },
  {
    widget: debugCommandWidget,
    repaintStyleTarget: debugCommandWidget.style.selected
  },
  {
    widget: toolListWidget,
    repaintStyleTarget: toolListWidget.style.selected
  }
];

const switchFocus = step => {
  currentFocusIndex += step;

  if (currentFocusIndex > focusOrder.length - 1) {
    currentFocusIndex = 0;
  } else if (currentFocusIndex < 0) {
    currentFocusIndex = focusOrder.length - 1;
  }

  focusOrder.forEach((item, index) => {
    item.repaintStyleTarget.bg = index === currentFocusIndex ? 'blue' : '';
  });

  focusOrder[currentFocusIndex].widget.focus();
  screen.render();
};

screen.key(['tab', 'd'], () => switchFocus(1));
screen.key(['a'], () => switchFocus(-1));

screen.on('resize', () => {
  logWidget.emit('attach');
});

const logFn = msg => {
  logWidget.log(`${msg}`);
  screen.render();
};

const selectedTypes = {};

const updateTypeUI = clientTypes => {
  const uiElements = Object.keys(clientTypes).map(
    clientType =>
      `[${selectedTypes[clientType] ? 'X' : ' '}] ${clientTypes[clientType]}`
  );

  debugTypeWidget.setItems(uiElements);

  screen.render();
};

const updateCommandUI = commands => {
  debugCommandWidget.setItems(server.debugCommands);

  screen.render();
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

  userWidget.setData({
    headers: ['ID', 'IP', 'Type'],

    data: result
  });

  screen.render();

  return true;
};

const updateToolsUI = () => {
  toolListWidget.setItems(getToolItems());

  screen.render();
};

server.on('client-updated', updateClientUI);
server.on('type-updated', updateTypeUI);
server.on('debug-command-updated', updateCommandUI);
server.records.on('record-updated', updateToolsUI);
logger.on('log-updated', updateToolsUI);

(async () => {
  logger.setTarget(logFn);

  welcomeMessage.split('\n').forEach(msg => logger.log(msg));
  logger.log('');

  await server.start();
  updateTypeUI(server.clientTypes);
  updateCommandUI(server.debugCommands);
  updateToolsUI();

  experimentWidget.focus();

  screen.render();
})();
