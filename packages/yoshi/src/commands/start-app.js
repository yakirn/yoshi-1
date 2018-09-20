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
const stream = require('stream');
// const execa = require('execa');
const child_process = require('child_process');
const chalk = require('chalk');
// const express = require('express');
const webpack = require('webpack');
const cors = require('cors');
const waitPort = require('wait-port');
// const webpackDevMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');
const errorOverlayMiddleware = require('react-dev-utils/errorOverlayMiddleware');
const WebpackDevServer = require('webpack-dev-server');
const {
  createCompiler,
  prepareUrls,
} = require('react-dev-utils/WebpackDevServerUtils');
// const clearConsole = require('react-dev-utils/clearConsole');
const openBrowser = require('react-dev-utils/openBrowser');
const {
  createClientWebpackConfig,
  createServerWebpackConfig,
} = require('../../config/webpack.config');

// const isInteractive = process.stdout.isTTY;

// function format(time) {
//   return time.toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, '$1');
// }

function createCompilationPromise(name, compiler, config) {
  return new Promise((resolve, reject) => {
    // let timeStart = new Date();
    // compiler.hooks.compile.tap(name, () => {
    // timeStart = new Date();
    // console.info(`[${format(timeStart)}] Compiling '${name}'...`);
    // });

    compiler.hooks.done.tap(name, stats => {
      // console.info(stats.toString(config.stats));
      // const timeEnd = new Date();
      // const time = timeEnd.getTime() - timeStart.getTime();
      if (stats.hasErrors()) {
        // console.info(
        //   `[${format(timeEnd)}] Failed to compile '${name}' after ${time} ms`,
        // );
        console.log(stats.toString('errors-only'));
        reject(new Error('Compilation failed!'));
      } else {
        // console.info(
        //   `[${format(
        //     timeEnd,
        //   )}] Finished '${name}' compilation after ${time} ms`,
        // );
        resolve(stats);
      }
    });
  });
}

function serverLogPrefixer() {
  return new stream.Transform({
    transform(chunk, encoding, callback) {
      this.push(`${chalk.greenBright('[SERVER]')}: ${chunk.toString()}`);
      callback();
    },
  });
}

const appName = require(path.join(process.cwd(), 'package.json')).name;

module.exports = async () => {
  const clientConfig = createClientWebpackConfig({
    isDebug: true,
    isAnalyze: false,
  });

  const serverConfig = createServerWebpackConfig({
    isDebug: true,
  });

  // Configure client-side hot module replacement
  clientConfig.entry.app = [
    // require('react-dev-utils/webpackHotDevClient'),
    require.resolve('./webpackHotDevClient'),
    clientConfig.entry.app,
  ];

  clientConfig.output.filename = clientConfig.output.filename.replace(
    'chunkhash',
    'hash',
  );

  clientConfig.output.chunkFilename = clientConfig.output.chunkFilename.replace(
    'chunkhash',
    'hash',
  );

  clientConfig.module.rules = clientConfig.module.rules.filter(
    x => x.loader !== 'null-loader',
  );

  clientConfig.plugins.push(new webpack.HotModuleReplacementPlugin());

  // Configure server-side hot module replacement
  serverConfig.output.hotUpdateMainFilename = 'updates/[hash].hot-update.json';

  serverConfig.output.hotUpdateChunkFilename =
    'updates/[id].[hash].hot-update.js';

  serverConfig.module.rules = serverConfig.module.rules.filter(
    x => x.loader !== 'null-loader',
  );

  serverConfig.plugins.push(new webpack.HotModuleReplacementPlugin());

  // Configure compilation
  const multiCompiler = createCompiler(
    webpack,
    [clientConfig, serverConfig],
    appName,
    prepareUrls('http', '0.0.0.0', 3000),
    false,
  );

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

  const webpackDevServerConfig = {
    compress: true,
    clientLogLevel: 'none',
    contentBase: path.join(process.cwd(), 'build'),
    watchContentBase: true,
    hot: true,
    publicPath: clientConfig.output.publicPath,
    quiet: true,
    https: false,
    host: '0.0.0.0',
    overlay: false,
    historyApiFallback: {
      // Paths with dots should still use the history fallback.
      // See https://github.com/facebookincubator/create-react-app/issues/387.
      disableDotRule: true,
    },
    before(app) {
      app.use(cors());
      // This lets us open files from the runtime error overlay.
      app.use(errorOverlayMiddleware());
    },
    after(app) {
      app.use(webpackHotMiddleware(clientCompiler, { log: false }));
    },
  };

  const devServer = new WebpackDevServer(
    clientCompiler,
    webpackDevServerConfig,
  );

  let serverProcess;

  serverCompiler.watch({ 'info-verbosity': 'none' }, (error, stats) => {
    if (serverProcess && !error && !stats.hasErrors()) {
      serverProcess.send({});
    }
  });

  await new Promise((resolve, reject) => {
    devServer.listen(3200, '0.0.0.0', err => (err ? reject(err) : resolve()));
  });

  await clientPromise;
  await serverPromise;

  const startServerProcess = () => {
    serverProcess = child_process.fork('index.js', {
      stdio: 'pipe',
    });

    serverProcess.stdout.pipe(serverLogPrefixer()).pipe(process.stdout);
    serverProcess.stderr.pipe(serverLogPrefixer()).pipe(process.stderr);

    serverProcess.on('message', () => {
      serverProcess.kill();
      startServerProcess();
    });
  };

  startServerProcess();

  await waitPort({
    port: 3000,
    output: 'silent',
  });

  // openBrowser('http://localhost:3000');
};
