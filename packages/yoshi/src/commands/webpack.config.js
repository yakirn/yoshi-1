// const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
// const WebpackAssetsManifest = require('webpack-assets-manifest');
const { isObject } = require('lodash');
const nodeExternals = require('webpack-node-externals');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const StylableWebpackPlugin = require('stylable-webpack-plugin');
const TpaStyleWebpackPlugin = require('tpa-style-webpack-plugin');
const RtlCssPlugin = require('rtlcss-webpack-plugin');
const DynamicPublicPath = require('../webpack-plugins/dynamic-public-path');
const { localIdentName, staticsDomain } = require('../constants');
// const overrideRules = require('./lib/overrideRules');
const pkg = require(path.join(process.cwd(), './package.json'));

const project = require('yoshi-config');
const {
  unprocessedModules,
  toIdentifier,
  isSingleEntry,
  isProduction: checkIsProduction,
  inTeamCity: checkInTeamCity,
} = require('yoshi-helpers');

const ROOT_DIR = process.cwd();
const resolvePath = (...args) => path.resolve(ROOT_DIR, ...args);
const SRC_DIR = resolvePath('src');
const BUILD_DIR = resolvePath('build');

const artifactName = process.env.ARTIFACT_ID;
const artifactVersion = process.env.ARTIFACT_VERSION;

const reScript = /\.(js|jsx|mjs)$/;
const reStyle = /\.(css|less|styl|scss|sass|sss)$/;
const reAssets = /\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|otf|eot|wav|mp3)$/;

const disableTsThreadOptimization =
  process.env.DISABLE_TS_THREAD_OPTIMIZATION === 'true';

const disableModuleConcat = process.env.DISABLE_MODULE_CONCATENATION === 'true';

const isProduction = checkIsProduction();

const inTeamCity = checkInTeamCity();

const separateCss =
  project.separateCss === 'prod'
    ? inTeamCity || isProduction
    : project.separateCss;

// Projects that uses `wnpm-ci` have their package.json version field on a fixed version which is not their real version
// These projects determine their version on the "release" step, which means they will have a wrong public path
// We currently can't support static public path of packages that deploy to unpkg
const publicPath =
  artifactName && artifactVersion
    ? `${staticsDomain}/${artifactName}/${artifactVersion.replace(
        '-SNAPSHOT',
        '',
      )}/`
    : '/';

const stylableSeparateCss = project.enhancedTpaStyle;

// CSS Nano options http://cssnano.co/
const minimizeCssOptions = {
  discardComments: { removeAll: true },
};

const defaultSplitChunksConfig = {
  chunks: 'all',
  name: 'commons',
  minChunks: 2,
};

const useSplitChunks = project.splitChunks;

const splitChunksConfig = isObject(useSplitChunks)
  ? useSplitChunks
  : defaultSplitChunksConfig;

const entry = project.entry || project.defaultEntry;

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

    mode: isProduction ? 'production' : 'development',

    output: {
      path: resolvePath(BUILD_DIR, 'public/assets'),
      publicPath,
      pathinfo: isDebug,
      filename: isDebug ? '[name].bundle.js' : '[name].bundle.min.js',
      chunkFilename: isDebug ? '[name].chunk.js' : '[name].chunk.min.js',
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

      // The user can configure its own aliases
      alias: project.resolveAlias,

      // Whether to resolve symlinks to their symlinked location.
      symlinks: false,
    },

    // Since Yoshi doesn't depend on every loader it uses directly, we first look
    // for loaders in Yoshi's `node_modules` and then look at the root `node_modules`.
    // See https://github.com/wix/yoshi/pull/392.
    resolveLoader: {
      modules: [path.join(__dirname, '../node_modules'), 'node_modules'],
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
        // Rules for optimizing Lodash
        ...(project.features.externalizeRelativeLodash
          ? [
              {
                test: /[\\/]node_modules[\\/]lodash/,
                loader: require.resolve('externalize-relative-module-loader'),
              },
            ]
          : []),

        // Rules specific for Angular
        ...(project.isAngularProject
          ? [
              {
                test: [reScript, /\.(ts|tsx)$/],
                loader: require.resolve('ng-annotate-loader'),
                include: unprocessedModules,
              },
            ]
          : []),

        // Rules for TS / TSX
        {
          test: /\.(ts|tsx)$/,
          exclude: /(node_modules)/,
          use: [
            ...(disableTsThreadOptimization
              ? []
              : [
                  // This loader parallelizes code compilation, it is optional but
                  // improves compile time on larger projects
                  {
                    loader: require.resolve('thread-loader'),
                    options: {
                      workers: require('os').cpus().length - 1,
                    },
                  },
                ]),
            {
              loader: require.resolve('ts-loader'),
              options: {
                // This implicitly sets `transpileOnly` to `true`
                happyPackMode: !disableTsThreadOptimization,
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
          include: unprocessedModules,
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

    entry: isSingleEntry(entry) ? { app: entry } : entry,

    optimization: {
      minimize: !isDebug,
      splitChunks: useSplitChunks ? splitChunksConfig : false,
      concatenateModules: isProduction && !disableModuleConcat,
      minimizer: [
        new UglifyJsPlugin({
          // Use multi-process parallel running to improve the build speed
          // Default number of concurrent runs: os.cpus().length - 1
          parallel: true,
          // Enable file caching
          cache: true,
          sourceMap: true,
          uglifyOptions: {
            output: {
              // support emojis
              ascii_only: true,
            },
            keep_fnames: project.keepFunctionNames,
          },
        }),
      ],
    },

    output: {
      ...config.output,

      // This is changed to support running multiple webpack runtimes
      // (from different compilation) on the same webpage.
      jsonpFunction: `webpackJsonp_${toIdentifier(project.name)}`,

      // Bundle as UMD format if the user configured that this is a library
      ...(project.exports
        ? {
            library: project.exports,
            libraryTarget: 'umd',
            globalObject: "(typeof self !== 'undefined' ? self : this)",
          }
        : {}),

      // https://webpack.js.org/configuration/output/#output-umdnameddefine
      umdNamedDefine: project.umdNamedDefine,
    },

    plugins: [
      ...config.plugins,

      // https://webpack.js.org/plugins/loader-options-plugin
      new webpack.LoaderOptionsPlugin({
        minimize: !isDebug,
      }),

      ...(separateCss
        ? [
            // https://github.com/webpack-contrib/mini-css-extract-plugin
            new MiniCssExtractPlugin({
              filename: isDebug ? '[name].css' : '[name].min.css',
            }),
            // https://github.com/wix-incubator/tpa-style-webpack-plugin
            ...(project.enhancedTpaStyle ? [new TpaStyleWebpackPlugin()] : []),
            // https://github.com/wix/rtlcss-webpack-plugin
            new RtlCssPlugin(isDebug ? '[name].rtl.css' : '[name].rtl.min.css'),
          ]
        : []),

      // Hacky way of correcting Webpack's publicPath
      new DynamicPublicPath(),

      // Define free variables
      // https://webpack.js.org/plugins/define-plugin/
      new webpack.DefinePlugin({
        'process.env.BROWSER': true,
        __DEV__: isDebug,
        'process.env.NODE_ENV': JSON.stringify(
          isProduction ? 'production' : 'development',
        ),
        'window.__CI_APP_VERSION__': JSON.stringify(
          artifactVersion ? artifactVersion : '0.0.0',
        ),
      }),

      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how Webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      // You can remove this if you don't use Moment.js:
      new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),

      // https://github.com/wix/stylable
      new StylableWebpackPlugin({
        outputCSS: stylableSeparateCss,
        filename: '[name].stylable.bundle.css',
        includeCSSInJS: !stylableSeparateCss,
        optimize: { classNameOptimizations: false, shortNamespaces: false },
      }),

      // Webpack Bundle Analyzer
      // https://github.com/th0r/webpack-bundle-analyzer
      ...(isAnalyze ? [new BundleAnalyzerPlugin()] : []),
    ],

    module: {
      ...config.module,

      rules: [
        ...config.module.rules,

        // Rules for Style Sheets
        {
          test: reStyle,
          rules: [
            // Process style assets with `css-hot-loader` if HMR
            // is `true` or `auto`
            ...(project.hmr
              ? [{ loader: require.resolve('css-hot-loader') }]
              : []),

            // Process every style asset with either `style-loader`
            // or `mini-css-extract-plugin`
            ...(separateCss
              ? [
                  {
                    loader: MiniCssExtractPlugin.loader,
                  },
                ]
              : [
                  {
                    loader: require.resolve('style-loader'),
                    options: {
                      // Reuses a single `<style></style>` element
                      singleton: true,
                    },
                  },
                ]),

            // Process internal/project styles (from src folder)
            {
              oneOf: [
                {
                  test: /\.global\.[A-z]*$/,
                  loader: require.resolve('css-loader'),
                  options: {
                    // CSS Loader https://github.com/webpack/css-loader
                    importLoaders: 1,
                    sourceMap: separateCss,
                    // CSS Modules https://github.com/css-modules/css-modules
                    modules: false,
                    // CSS Nano http://cssnano.co/
                    minimize: isDebug ? false : minimizeCssOptions,
                  },
                },
                {
                  // CSS Loader https://github.com/webpack/css-loader
                  loader: require.resolve('css-loader'),
                  options: {
                    camelCase: true,
                    sourceMap: !!separateCss,
                    localIdentName: isDebug
                      ? localIdentName.long
                      : localIdentName.short,
                    // Make sure every package has unique class names
                    hashPrefix: project.name,
                    // CSS Modules https://github.com/css-modules/css-modules
                    modules: project.cssModules,
                    // PostCSS, sass-loader and resolve-url-loader, so composition
                    // will work with import
                    importLoaders: 3 + Number(project.tpaStyle),
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
              options: {
                sourceMap: true,
                paths: ['.', 'node_modules'],
              },
            },

            // Compile Sass to CSS
            // https://github.com/webpack-contrib/sass-loader
            // Install dependencies before uncommenting: yarn add --dev sass-loader node-sass
            {
              test: /\.(scss|sass)$/,
              loader: require.resolve('sass-loader'),
              options: {
                sourceMap: true,
                includePaths: [
                  'node_modules',
                  'node_modules/compass-mixins/lib',
                ],
              },
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
      __dirname: true,
    },

    // The user can configure its own externals
    externals: project.externals,

    // https://webpack.js.org/configuration/performance/#performance
    performance: {
      ...(isProduction
        ? project.performanceBudget || { hints: false }
        : {
            hints: false,
          }),
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
                camelCase: true,
                localIdentName: isDebug
                  ? localIdentName.long
                  : localIdentName.short,
                // Make sure every package has unique class names
                hashPrefix: project.name,
                // CSS Modules https://github.com/css-modules/css-modules
                modules: project.cssModules,
              },
            },

            // Compile Less to CSS
            // https://github.com/webpack-contrib/less-loader
            // Install dependencies before uncommenting: yarn add --dev less-loader less
            {
              test: /\.less$/,
              loader: require.resolve('less-loader'),
              options: {
                paths: ['.', 'node_modules'],
              },
            },

            // Compile Sass to CSS
            // https://github.com/webpack-contrib/sass-loader
            // Install dependencies before uncommenting: yarn add --dev sass-loader node-sass
            {
              test: /\.(scss|sass)$/,
              loader: require.resolve('sass-loader'),
              options: {
                includePaths: [
                  'node_modules',
                  'node_modules/compass-mixins/lib',
                ],
              },
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

    // https://webpack.js.org/configuration/optimization
    optimization: {
      // Do not modify/set the value of `process.env.NODE_ENV`
      nodeEnv: false,
    },

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
