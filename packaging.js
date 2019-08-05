const { compile } = require('nexe')

compile({
  input: './deploy/bundle.js',
  build: true,
  output: './deploy/ezTrigger-dashboard',
  flags: ['--require=esm'],
  resources:  [
    "node_modules/blessed/**/*",
    "node_modules/mock-require/**/*",
    "node_modules/@ez-trigger/**/*",
    "node_modules/esm/**/*.js"
  ]
}).then(() => {
  console.log('success')
})