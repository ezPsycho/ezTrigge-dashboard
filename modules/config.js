import fs from 'fs';
import path from 'path';
import process from 'process';

import mri from 'mri';

import { e } from '@ez-trigger/server';

const args = mri(process.argv.slice(2));

let configPath;

if (args.config) {
  if (!fs.existsSync(args.config)) {
    console.log(e(`Config file ${args.config} does not exists.`));
    process.exit(1);
  } else {
    configPath = args.config;
  }
} else if (fs.existsSync(path.join(__dirname, 'config.json'))) {
  configPath = path.join(__dirname, 'config.json');
} else if (fs.existsSync(path.join(__dirname, '../config.json'))) {
  configPath = path.join(__dirname, '../config.json');
} else if (fs.existsSync(path.join(process.cwd(), 'config.json'))) {
  configPath = path.join(process.cwd(), 'config.json');
} else {
  console.log(e(`Config file not found.`));
  process.exit(1);
}

configPath = path.normalize(configPath);

const basePath = path.dirname(configPath);

const configFile = JSON.parse(fs.readFileSync(configPath));

const serverPackagePath = args.dir
  ? args.dir
  : path.join(basePath, 'programs');

export { serverPackagePath, configFile, configPath };
