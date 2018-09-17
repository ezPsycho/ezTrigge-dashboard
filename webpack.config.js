const fs = require('fs');
const path = require('path');

const nodeExternals = require('webpack-node-externals');
const packageInfo = JSON.parse(fs.readFileSync('package.json'));
const { deployFixWhitelist, packageIntoBundle } = packageInfo;

module.exports = {
  entry: './dashboard.js',
  target: 'node',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'deploy'),
    filename: 'bundle.js'
  },
  externals: [nodeExternals({
    whitelist: deployFixWhitelist.concat(packageIntoBundle)
  })]
};
