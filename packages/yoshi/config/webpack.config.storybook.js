const union = require('lodash/union');
const StylableWebpackPlugin = require('stylable-webpack-plugin');
const project = require('yoshi-config');
const { localIdentName } = require('../src/constants');
const { createCommonWebpackConfig } = require('../src/commands/webpack.config');

module.exports = config => {
  const webpackCommonConfig = createCommonWebpackConfig({ isDebug: true });

  config.resolve.extensions = union(
    config.resolve.extensions,
    webpackCommonConfig.resolve.extensions,
  );

  config.module.rules = [
    ...webpackCommonConfig.module.rules,

    // Rules for Style Sheets
    {
      test: /\.(css|less|scss|sass)$/,
      exclude: /\.st\.css$/,
      rules: [
        {
          loader: require.resolve('style-loader'),
          options: {
            // Reuses a single `<style></style>` element
            singleton: true,
          },
        },

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
                // https://github.com/css-modules/css-modules
                modules: false,
              },
            },
            {
              // https://github.com/webpack/css-loader
              loader: require.resolve('css-loader'),
              options: {
                camelCase: true,
                localIdentName: localIdentName.long,
                // Make sure every package has unique class names
                hashPrefix: project.name,
                // https://github.com/css-modules/css-modules
                modules: project.cssModules,
                // PostCSS, sass-loader and resolve-url-loader, so composition
                // will work with import
                importLoaders: 3,
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
            sourceMap: true,
          },
        },

        // https://github.com/bholloway/resolve-url-loader
        {
          loader: require.resolve('resolve-url-loader'),
          options: { attempts: 1 },
        },

        // https://github.com/webpack-contrib/sass-loader
        {
          test: /\.(scss|sass)$/,
          loader: require.resolve('sass-loader'),
          options: {
            sourceMap: true,
            includePaths: ['node_modules', 'node_modules/compass-mixins/lib'],
          },
        },
      ],
    },
  ];

  config.plugins = [...(config.plugins || []), new StylableWebpackPlugin()];

  return config;
};
