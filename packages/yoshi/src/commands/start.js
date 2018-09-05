// Assign env vars before requiring anything so that it is available to all files
process.env.BABEL_ENV = 'development';
process.env.NODE_ENV = 'development';

const parseArgs = require('minimist');

const cliArgs = parseArgs(process.argv.slice(2));

if (cliArgs.production) {
  // run start with production configuration
  process.env.BABEL_ENV = 'production';
  process.env.NODE_ENV = 'production';
}

const path = require('path');
// const execa = require('execa');
const child_process = require('child_process');
const express = require('express');
const webpack = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');
// const webpackHotMiddleware = require('webpack-hot-middleware');
const errorOverlayMiddleware = require('react-dev-utils/errorOverlayMiddleware');
const webpackConfig = require('./webpack.config');

function format(time) {
  return time.toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, '$1');
}

function createCompilationPromise(name, compiler, config) {
  return new Promise((resolve, reject) => {
    let timeStart = new Date();
    compiler.hooks.compile.tap(name, () => {
      timeStart = new Date();
      console.info(`[${format(timeStart)}] Compiling '${name}'...`);
    });

    compiler.hooks.done.tap(name, stats => {
      console.info(stats.toString(config.stats));
      const timeEnd = new Date();
      const time = timeEnd.getTime() - timeStart.getTime();
      if (stats.hasErrors()) {
        console.info(
          `[${format(timeEnd)}] Failed to compile '${name}' after ${time} ms`,
        );
        reject(new Error('Compilation failed!'));
      } else {
        console.info(
          `[${format(
            timeEnd,
          )}] Finished '${name}' compilation after ${time} ms`,
        );
        resolve(stats);
      }
    });
  });
}

module.exports = async () => {
  const clientConfig = webpackConfig.find(config => config.name === 'client');

  const serverConfig = webpackConfig.find(config => config.name === 'server');

  serverConfig.output.hotUpdateMainFilename = 'updates/[hash].hot-update.json';
  serverConfig.output.hotUpdateChunkFilename =
    'updates/[id].[hash].hot-update.js';
  serverConfig.module.rules = serverConfig.module.rules.filter(
    x => x.loader !== 'null-loader',
  );
  serverConfig.plugins.push(new webpack.HotModuleReplacementPlugin());

  const multiCompiler = webpack(webpackConfig);

  const clientCompiler = multiCompiler.compilers.find(
    compiler => compiler.name === 'client',
  );

  const serverCompiler = multiCompiler.compilers.find(
    compiler => compiler.name === 'server',
  );

  const clientPromise = createCompilationPromise(
    'client',
    clientCompiler,
    clientConfig,
  );

  const serverPromise = createCompilationPromise(
    'server',
    serverCompiler,
    serverConfig,
  );

  const server = express();

  server.use(errorOverlayMiddleware());
  server.use(express.static(path.resolve(__dirname, '../public')));

  server.use(
    webpackDevMiddleware(clientCompiler, {
      publicPath: clientConfig.output.publicPath,
      logLevel: 'silent',
      watchOptions: {},
    }),
  );

  let serverProcess;

  serverCompiler.watch({}, (error, stats) => {
    if (serverProcess) {
      return;
      // serverProcess.kill('SIGHUP');
    }

    serverProcess = child_process.spawn('node', ['index.js'], {
      stdio: 'inherit',
    });
  });

  await clientPromise;
  await serverPromise;

  await new Promise((resolve, reject) => {
    server.listen(3200, err => (err ? reject(err) : resolve()));
  });

  console.info(`Server launched!`);
};
