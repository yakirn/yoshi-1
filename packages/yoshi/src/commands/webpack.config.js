// const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
// const WebpackAssetsManifest = require('webpack-assets-manifest');
const nodeExternals = require('webpack-node-externals');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
// const overrideRules = require('./lib/overrideRules');
const pkg = require(path.join(process.cwd(), './package.json'));

const ROOT_DIR = process.cwd();
const resolvePath = (...args) => path.resolve(ROOT_DIR, ...args);
const SRC_DIR = resolvePath('src');
const BUILD_DIR = resolvePath('build');

const reScript = /\.(js|jsx|mjs)$/;
const reStyle = /\.(css|less|styl|scss|sass|sss)$/;
const reAssets = /\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|otf|eot|wav|mp3)$/;

// CSS Nano options http://cssnano.co/
const minimizeCssOptions = {
  discardComments: { removeAll: true },
};

function overrideRules(rules, patch) {
  return rules.map(ruleToPatch => {
    let rule = patch(ruleToPatch);
    if (rule.rules) {
      rule = { ...rule, rules: overrideRules(rule.rules, patch) };
    }
    if (rule.oneOf) {
      rule = { ...rule, oneOf: overrideRules(rule.oneOf, patch) };
    }
    return rule;
  });
}

module.exports = function createWebpackConfig({
  isAnalyze = false,
  isDebug = true,
}) {
  //
  // Common configuration chunk to be used for both
  // client-side (client.js) and server-side (server.js) bundles
  // -----------------------------------------------------------------------------

  const config = {
    context: SRC_DIR,

    mode: isDebug ? 'development' : 'production',

    output: {
      path: resolvePath(BUILD_DIR, 'public/assets'),
      publicPath: 'http://localhost:3200/',
      pathinfo: isDebug,
      filename: isDebug ? '[name].js' : '[name].[chunkhash:8].js',
      chunkFilename: isDebug
        ? '[name].chunk.js'
        : '[name].[chunkhash:8].chunk.js',
      // Point sourcemap entries to original disk location (format as URL on Windows)
      devtoolModuleFilenameTemplate: info =>
        path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'),
    },

    resolve: {
      // Allow absolute paths in imports, e.g. import Button from 'components/Button'
      // Keep in sync with .flowconfig and .eslintrc
      modules: ['node_modules', SRC_DIR],

      // These are the reasonable defaults supported by the Node ecosystem.
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see:
      // https://github.com/facebookincubator/create-react-app/issues/290
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    },

    plugins: [
      // Watcher doesn't work well if you mistype casing in a path so we use
      // a plugin that prints an error when you attempt to do this.
      // See https://github.com/facebookincubator/create-react-app/issues/240
      new CaseSensitivePathsPlugin(),
    ],

    module: {
      // Make missing exports an error instead of warning
      strictExportPresence: true,

      rules: [
        // Rules for TS / TSX
        {
          test: /\.(ts|tsx)$/,
          include: [SRC_DIR],
          use: [
            {
              loader: require.resolve('thread-loader'),
              options: {
                workers: require('os').cpus().length - 1,
              },
            },
            {
              loader: require.resolve('ts-loader'),
              options: {
                // This implicitly sets `transpileOnly` to `true`
                happyPackMode: true,
                compilerOptions: {
                  // force es modules for tree shaking
                  module: 'esnext',
                  // use same module resolution
                  moduleResolution: 'node',
                  // allow using Promises, Array.prototype.includes, String.prototype.padStart, etc.
                  lib: ['es2017'],
                  // use async/await instead of embedding polyfills
                  target: 'es2017',
                },
              },
            },
          ],
        },

        // Rules for JS / JSX
        {
          test: reScript,
          include: [SRC_DIR],
          use: [
            {
              loader: require.resolve('thread-loader'),
              options: {
                workers: require('os').cpus().length - 1,
              },
            },
            {
              loader: require.resolve('babel-loader'),
              options: {
                // https://github.com/babel/babel-loader#options
                cacheDirectory: isDebug,

                // https://babeljs.io/docs/usage/options/
                babelrc: false,
                presets: [
                  // A Babel preset that can automatically determine the Babel plugins and polyfills
                  // https://github.com/babel/babel-preset-env
                  [
                    require.resolve('babel-preset-yoshi'),
                    {
                      targets: {
                        browsers: pkg.browserslist,
                      },
                      forceAllTransforms: !isDebug, // for UglifyJS
                      modules: false,
                      useBuiltIns: false,
                      debug: false,
                    },
                  ],
                ],
              },
            },
          ],
        },

        // Rules for assets
        {
          oneOf: [
            // Inline SVG images into CSS
            {
              test: /\.inline\.svg$/,
              loader: require.resolve('svg-inline-loader'),
            },

            // Or return public URL to image resource
            {
              test: reAssets,
              loader: require.resolve('url-loader'),
              options: {
                name: '[path][name].[ext]?[hash]',
                limit: 10000,
              },
            },
          ],
        },

        // Rules for Markdown
        {
          test: /\.md$/,
          loader: require.resolve('raw-loader'),
        },

        // Rules for HAML
        {
          test: /\.haml$/,
          loader: require.resolve('ruby-haml-loader'),
        },

        // Rules for HTML
        {
          test: /\.html$/,
          loader: require.resolve('html-loader'),
        },

        // Rules for GraphQL
        {
          test: /\.(graphql|gql)$/,
          include: [SRC_DIR],
          loader: require.resolve('graphql-tag/loader'),
        },
      ],
    },

    // Don't attempt to continue if there are any errors.
    bail: !isDebug,

    cache: isDebug,

    // Specify what bundle information gets displayed
    // https://webpack.js.org/configuration/stats/
    stats: 'none',

    // Choose a developer tool to enhance debugging
    // https://webpack.js.org/configuration/devtool/#devtool
    devtool: isDebug ? 'cheap-module-inline-source-map' : 'source-map',
  };

  //
  // Configuration for the client-side bundle (client.js)
  // -----------------------------------------------------------------------------

  const clientConfig = {
    ...config,

    name: 'client',

    target: 'web',

    entry: {
      client: [
        // require.resolve('@babel/polyfill'),
        './client.js',
      ],
    },

    plugins: [
      ...config.plugins,

      new MiniCssExtractPlugin({
        // Options similar to the same options in webpackOptions.output
        // both options are optional
        filename: '[name].css',
        chunkFilename: '[id].css',
      }),

      // Define free variables
      // https://webpack.js.org/plugins/define-plugin/
      new webpack.DefinePlugin({
        'process.env.BROWSER': true,
        __DEV__: isDebug,
      }),

      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how Webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      // You can remove this if you don't use Moment.js:
      new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),

      ...(isDebug
        ? []
        : [
            // Webpack Bundle Analyzer
            // https://github.com/th0r/webpack-bundle-analyzer
            ...(isAnalyze ? [new BundleAnalyzerPlugin()] : []),
          ]),
    ],

    module: {
      ...config.module,

      rules: [
        ...config.module.rules,

        // Rules for Style Sheets
        {
          test: reStyle,
          rules: [
            {
              loader: MiniCssExtractPlugin.loader,
            },

            // Process internal/project styles (from src folder)
            {
              oneOf: [
                {
                  test: /\.global\.[A-z]*$/,
                  loader: require.resolve('css-loader'),
                  options: {
                    // CSS Loader https://github.com/webpack/css-loader
                    importLoaders: 1,
                    sourceMap: isDebug,
                    // CSS Modules https://github.com/css-modules/css-modules
                    modules: false,
                    // CSS Nano http://cssnano.co/
                    minimize: isDebug ? false : minimizeCssOptions,
                  },
                },
                {
                  loader: require.resolve('css-loader'),
                  options: {
                    // CSS Loader https://github.com/webpack/css-loader
                    importLoaders: 1,
                    sourceMap: isDebug,
                    // CSS Modules https://github.com/css-modules/css-modules
                    modules: true,
                    localIdentName: isDebug
                      ? '[name]-[local]-[hash:base64:5]'
                      : '[hash:base64:5]',
                    // CSS Nano http://cssnano.co/
                    minimize: isDebug ? false : minimizeCssOptions,
                  },
                },
              ],
            },

            // Apply PostCSS plugins including autoprefixer
            {
              loader: require.resolve('postcss-loader'),
              options: {
                // Necessary for external CSS imports to work
                // https://github.com/facebookincubator/create-react-app/issues/2677
                ident: 'postcss',
                plugins: [require('autoprefixer')],
                sourceMap: isDebug,
              },
            },

            // Compile Less to CSS
            // https://github.com/webpack-contrib/less-loader
            // Install dependencies before uncommenting: yarn add --dev less-loader less
            {
              test: /\.less$/,
              loader: require.resolve('less-loader'),
            },

            // Compile Sass to CSS
            // https://github.com/webpack-contrib/sass-loader
            // Install dependencies before uncommenting: yarn add --dev sass-loader node-sass
            {
              test: /\.(scss|sass)$/,
              loader: require.resolve('sass-loader'),
            },
          ],
        },
      ],
    },

    // Some libraries import Node modules but don't use them in the browser.
    // Tell Webpack to provide empty mocks for them so importing them works.
    // https://webpack.js.org/configuration/node/
    // https://github.com/webpack/node-libs-browser/tree/master/mock
    node: {
      fs: 'empty',
      net: 'empty',
      tls: 'empty',
    },
  };

  //
  // Configuration for the server-side bundle (server.js)
  // -----------------------------------------------------------------------------

  const serverConfig = {
    ...config,

    name: 'server',

    target: 'node',

    entry: {
      server: [
        // require.resolve('@babel/polyfill'),
        'webpack/hot/poll?1000',
        './real.js',
      ],
    },

    output: {
      ...config.output,
      path: BUILD_DIR,
      filename: '[name].js',
      chunkFilename: 'chunks/[name].js',
      libraryTarget: 'umd',
      // library: pkg.name,
      libraryExport: 'default',
      globalObject: "(typeof self !== 'undefined' ? self : this)",
    },

    // Webpack mutates resolve object, so clone it to avoid issues
    // https://github.com/webpack/webpack/issues/4817
    resolve: {
      ...config.resolve,
    },

    module: {
      ...config.module,

      rules: [
        ...overrideRules(config.module.rules, rule => {
          // Override paths to static assets
          if (
            rule.loader === require.resolve('file-loader') ||
            rule.loader === require.resolve('url-loader')
          ) {
            return {
              ...rule,
              options: {
                ...rule.options,
                emitFile: false,
              },
            };
          }

          return rule;
        }),

        // Rules for Style Sheets
        {
          test: reStyle,
          rules: [
            // Process internal/project styles (from src folder)
            {
              loader: require.resolve('css-loader/locals'),
              options: {
                // CSS Loader https://github.com/webpack/css-loader
                importLoaders: 1,
                // CSS Modules https://github.com/css-modules/css-modules
                modules: true,
                localIdentName: isDebug
                  ? '[name]-[local]-[hash:base64:5]'
                  : '[hash:base64:5]',
              },
            },

            // Compile Less to CSS
            // https://github.com/webpack-contrib/less-loader
            // Install dependencies before uncommenting: yarn add --dev less-loader less
            {
              test: /\.less$/,
              loader: require.resolve('less-loader'),
            },

            // Compile Sass to CSS
            // https://github.com/webpack-contrib/sass-loader
            // Install dependencies before uncommenting: yarn add --dev sass-loader node-sass
            {
              test: /\.(scss|sass)$/,
              loader: require.resolve('sass-loader'),
            },
          ],
        },
      ],
    },

    externals: [
      nodeExternals({
        whitelist: [reStyle, reAssets, 'webpack/hot/poll?1000'],
      }),
    ],

    plugins: [
      ...config.plugins,

      // Define free variables
      // https://webpack.js.org/plugins/define-plugin/
      new webpack.DefinePlugin({
        'process.env.BROWSER': false,
        __DEV__: isDebug,
      }),

      // Adds a banner to the top of each generated chunk
      // https://webpack.js.org/plugins/banner-plugin/
      new webpack.BannerPlugin({
        banner: 'require("source-map-support").install();',
        raw: true,
        entryOnly: false,
      }),
    ],

    // Do not replace node globals with polyfills
    // https://webpack.js.org/configuration/node/
    node: {
      console: false,
      global: false,
      process: false,
      Buffer: false,
      __filename: false,
      __dirname: false,
    },
  };

  return [clientConfig, serverConfig];
};
