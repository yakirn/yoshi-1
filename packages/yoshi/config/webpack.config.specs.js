const path = require('path');
const fs = require('fs');
const glob = require('glob');
const StylableWebpackPlugin = require('stylable-webpack-plugin');
const { createCommonWebpackConfig } = require('../src/commands/webpack.config');
const globs = require('yoshi-config/globs');
const projectConfig = require('yoshi-config');
const { localIdentName } = require('../src/constants');

const specsGlob = projectConfig.specs.browser || globs.specs;
const karmaSetupPath = path.join(process.cwd(), 'test', `karma-setup.js`);

const entry = glob.sync(specsGlob).map(p => path.resolve(p));

if (fs.existsSync(karmaSetupPath)) {
  entry.unshift(karmaSetupPath);
}

const config = createCommonWebpackConfig({ isDebug: true });

module.exports = {
  ...config,

  entry,

  output: {
    ...config.output,
    path: path.resolve('dist'),
    filename: 'specs.bundle.js',
  },

  module: {
    ...config.module,

    rules: [
      ...config.module.rules,

      {
        test: /\.(css|less|scss|sass)$/,
        exclude: /\.st\.css$/,
        rules: [
          {
            loader: 'css-loader/locals',
            options: {
              camelCase: true,
              sourceMap: false,
              localIdentName: localIdentName.long,
              modules: projectConfig.cssModules,
              // PostCSS, sass-loader and resolve-url-loader, so composition
              // will work with import
              importLoaders: 3 + Number(projectConfig.tpaStyle),
            },
          },
          ...(projectConfig.tpaStyle
            ? [{ loader: 'wix-tpa-style-loader' }]
            : []),
          {
            test: /\.(scss|sass)$/,
            loader: 'sass-loader',
            options: {
              sourceMap: true,
              includePaths: ['node_modules', 'node_modules/compass-mixins/lib'],
            },
          },
          {
            test: /\.less$/,
            loader: 'less-loader',
            options: {
              sourceMap: true,
              paths: ['.', 'node_modules'],
            },
          },
        ],
      },
    ],
  },

  plugins: [
    ...config.plugins,

    new StylableWebpackPlugin({
      outputCSS: false,
      filename: '[name].stylable.bundle.css',
      includeCSSInJS: true,
      optimize: { classNameOptimizations: false },
    }),
  ],

  externals: {
    ...config.externals,

    cheerio: 'window',
    'react/addons': true,
    'react/lib/ExecutionEnvironment': true,
    'react/lib/ReactContext': true,
  },
};
