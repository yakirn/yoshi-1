const path = require('path');
const glob = require('glob');
const cosmiconfig = require('cosmiconfig');
const project = require('yoshi-config');
const globs = require('yoshi-config/globs');
const { tryRequire } = require('./utils');

const readDir = patterns =>
  []
    .concat(patterns)
    .reduce((acc, pattern) => acc.concat(glob.sync(pattern)), []);

const exists = (module.exports.exists = patterns => !!readDir(patterns).length);

module.exports.isSingleEntry = entry =>
  typeof entry === 'string' || Array.isArray(entry);

module.exports.watchMode = value => {
  if (value !== undefined) {
    process.env.WIX_NODE_BUILD_WATCH_MODE = value;
  }
  return !!process.env.WIX_NODE_BUILD_WATCH_MODE;
};

module.exports.inTeamCity = () =>
  process.env.BUILD_NUMBER || process.env.TEAMCITY_VERSION;

module.exports.isProduction = () =>
  (process.env.NODE_ENV || '').toLowerCase() === 'production';

module.exports.shouldRunWebpack = webpackConfig => {
  const defaultEntryPath = path.join(
    webpackConfig.context,
    project.defaultEntry,
  );
  return project.entry || exists(`${defaultEntryPath}.{js,jsx,ts,tsx}`);
};

module.exports.migrateToScopedPackages = () =>
  process.env.MIGRATE_TO_SCOPED_PACKAGES === 'true';

module.exports.shouldRunStylelint = () => {
  return cosmiconfig('stylelint')
    .load()
    .then(Boolean);
};

module.exports.shouldRunSass = () => {
  return (
    glob
      .sync(`${globs.base}/**/*.scss`)
      .filter(file => path.basename(file)[0] !== '_').length > 0
  );
};

module.exports.isTypescriptProject = () =>
  !!tryRequire(path.resolve('tsconfig.json'));

module.exports.isBabelProject = () => {
  return !!glob.sync(path.resolve('.babelrc')).length || !!project.babel;
};

module.exports.shouldExportModule = () => {
  const pkg = tryRequire(path.resolve('package.json'));
  return !!(pkg && pkg.module);
};

module.exports.shouldRunLess = () => {
  return glob.sync(`${globs.base}/**/*.less`).length > 0;
};

module.exports.hasE2ETests = () => {
  return glob.sync(globs.e2e).length > 0;
};

module.exports.hasProtractorConfigFile = () => {
  return exists(path.resolve('protractor.conf.js'));
};

module.exports.hasBundleInStaticsDir = () => {
  const statics = glob.sync(path.resolve(globs.statics, '*'));
  return statics.some(fileName => fileName.endsWith('bundle.js'));
};
