const path = require('path');
const webpack = require('webpack');
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
const BUILD_DIR = resolvePath('dist/statics');

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

const isDevelopment = process.env.NODE_ENV === 'development';

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

//
// Common configuration chunk to be used for both
// client-side (client.js) and server-side (server.js) bundles
// -----------------------------------------------------------------------------
function createCommonWebpackConfig({ isDebug = true } = {}) {
  const config = {
    context: SRC_DIR,

    mode: isProduction ? 'production' : 'development',

    output: {
      path: BUILD_DIR,
      publicPath,
      pathinfo: isDebug,
      filename: isDebug ? '[name].bundle.js' : '[name].bundle.min.js',
      chunkFilename: isDebug ? '[name].chunk.js' : '[name].chunk.min.js',
      // Point sourcemap entries to original disk location (format as URL on Windows)
      devtoolModuleFilenameTemplate: info =>
        path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'),
    },

    resolve: {
      modules: ['node_modules', SRC_DIR],

      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],

      alias: project.resolveAlias,

      // Whether to resolve symlinks to their symlinked location.
      symlinks: false,
    },

    // Since Yoshi doesn't depend on every loader it uses directly, we first look
    // for loaders in Yoshi's `node_modules` and then look at the root `node_modules`
    //
    // See https://github.com/wix/yoshi/pull/392
    resolveLoader: {
      modules: [path.join(__dirname, '../node_modules'), 'node_modules'],
    },

    plugins: [
      // https://github.com/Urthen/case-sensitive-paths-webpack-plugin
      new CaseSensitivePathsPlugin(),
      // Hacky way of communicating to our `babel-preset-yoshi` or `babel-preset-wix`
      // that it should optimize for Webpack
      { apply: () => (process.env.IN_WEBPACK = 'true') },
    ],

    module: {
      // Make missing exports an error instead of warning
      strictExportPresence: true,

      rules: [
        // https://github.com/wix/externalize-relative-module-loader
        ...(project.features.externalizeRelativeLodash
          ? [
              {
                test: /[\\/]node_modules[\\/]lodash/,
                loader: require.resolve('externalize-relative-module-loader'),
              },
            ]
          : []),

        // https://github.com/huston007/ng-annotate-loader
        ...(project.isAngularProject
          ? [
              {
                test: reScript,
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
                  // optimize target to latest chrome for local development
                  ...(isDevelopment
                    ? {
                        // allow using Promises, Array.prototype.includes, String.prototype.padStart, etc.
                        lib: ['es2017'],
                        // use async/await instead of embedding polyfills
                        target: 'es2017',
                      }
                    : {}),
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

    // https://webpack.js.org/configuration/stats/
    stats: 'none',

    // https://webpack.js.org/configuration/devtool
    devtool: inTeamCity ? 'source-map' : 'cheap-module-source-map',
  };

  return config;
}

//
// Configuration for the client-side bundle (client.js)
// -----------------------------------------------------------------------------
function createClientWebpackConfig({ isAnalyze = false, isDebug = true } = {}) {
  const config = createCommonWebpackConfig({ isDebug });

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

      // https://github.com/wix/yoshi/pull/497
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

      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),

      // https://github.com/wix/stylable
      new StylableWebpackPlugin({
        outputCSS: stylableSeparateCss,
        filename: '[name].stylable.bundle.css',
        includeCSSInJS: !stylableSeparateCss,
        optimize: { classNameOptimizations: false, shortNamespaces: false },
      }),

      // https://github.com/th0r/webpack-bundle-analyzer
      ...(isAnalyze
        ? [
            new BundleAnalyzerPlugin({
              generateStatsFile: true,
              // Path is relative to the output dir
              statsFilename: '../../target/webpack-stats.min.json',
            }),
          ]
        : []),
    ],

    module: {
      ...config.module,

      rules: [
        ...config.module.rules,

        // Rules for Style Sheets
        {
          test: reStyle,
          exclude: /\.st\.css$/,
          rules: [
            // https://github.com/shepherdwind/css-hot-loader
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

            {
              oneOf: [
                // Files ending with `.global.(css|sass|scss|less)` will be transpiled with
                // `modules: false`
                {
                  test: /\.global\.[A-z]*$/,
                  loader: require.resolve('css-loader'),
                  options: {
                    // https://github.com/webpack/css-loader
                    importLoaders: 1,
                    sourceMap: separateCss,
                    // https://github.com/css-modules/css-modules
                    modules: false,
                  },
                },
                {
                  // https://github.com/webpack/css-loader
                  loader: require.resolve('css-loader'),
                  options: {
                    camelCase: true,
                    sourceMap: !!separateCss,
                    localIdentName: isDebug
                      ? localIdentName.long
                      : localIdentName.short,
                    // Make sure every package has unique class names
                    hashPrefix: project.name,
                    // https://github.com/css-modules/css-modules
                    modules: project.cssModules,
                    // PostCSS, sass-loader and resolve-url-loader, so composition
                    // will work with import
                    importLoaders: 3 + Number(project.tpaStyle),
                  },
                },
              ],
            },

            {
              loader: require.resolve('postcss-loader'),
              options: {
                // https://github.com/facebookincubator/create-react-app/issues/2677
                ident: 'postcss',
                plugins: [require('autoprefixer')],
                sourceMap: isDebug,
              },
            },

            // https://github.com/bholloway/resolve-url-loader
            {
              loader: require.resolve('resolve-url-loader'),
              options: { attempts: 1 },
            },

            // https://github.com/wix/wix-tpa-style-loader
            ...(project.tpaStyle
              ? [{ loader: require.resolve('wix-tpa-style-loader') }]
              : []),

            // https://github.com/webpack-contrib/less-loader
            {
              test: /\.less$/,
              loader: require.resolve('less-loader'),
              options: {
                sourceMap: true,
                paths: ['.', 'node_modules'],
              },
            },

            // https://github.com/webpack-contrib/sass-loader
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

    // https://github.com/webpack/node-libs-browser/tree/master/mock
    node: {
      fs: 'empty',
      net: 'empty',
      tls: 'empty',
      __dirname: true,
    },

    externals: project.externals,

    // https://webpack.js.org/configuration/performance
    performance: {
      ...(isProduction
        ? project.performanceBudget || { hints: false }
        : {
            hints: false,
          }),
    },
  };

  return clientConfig;
}

//
// Configuration for the server-side bundle (server.js)
// -----------------------------------------------------------------------------
function createServerWebpackConfig({ isDebug = true } = {}) {
  const config = createCommonWebpackConfig({ isDebug });

  const serverConfig = {
    ...config,

    name: 'server',

    target: 'node',

    entry: {
      server: [require.resolve('./hot'), './real.js'],
    },

    output: {
      ...config.output,
      path: BUILD_DIR,
      filename: '[name].js',
      chunkFilename: 'chunks/[name].js',
      libraryTarget: 'umd',
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
          exclude: /\.st\.css$/,
          rules: [
            {
              loader: require.resolve('css-loader/locals'),
              options: {
                camelCase: true,
                localIdentName: isDebug
                  ? localIdentName.long
                  : localIdentName.short,
                // Make sure every package has unique class names
                hashPrefix: project.name,
                // https://github.com/css-modules/css-modules
                modules: project.cssModules,
              },
            },

            // https://github.com/wix/wix-tpa-style-loader
            ...(project.tpaStyle
              ? [{ loader: require.resolve('wix-tpa-style-loader') }]
              : []),

            // https://github.com/webpack-contrib/less-loader
            {
              test: /\.less$/,
              loader: require.resolve('less-loader'),
              options: {
                paths: ['.', 'node_modules'],
              },
            },

            // https://github.com/webpack-contrib/sass-loader
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
        whitelist: [reStyle, reAssets],
      }),
    ],

    plugins: [
      ...config.plugins,

      // https://webpack.js.org/plugins/define-plugin/
      new webpack.DefinePlugin({
        'process.env.BROWSER': false,
        __DEV__: isDebug,
      }),

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

  return serverConfig;
}

module.exports = {
  createCommonWebpackConfig,
  createClientWebpackConfig,
  createServerWebpackConfig,
};
