## Yoshi CLI

The following sections describe the available tasks in `yoshi`. You can always use the `--help` flag for every task to see its usage.

### start

This will run the specified (server) `entryPoint` file and mount a CDN server.

Flag | Short Flag | Description | Default Value
---- | ---------- | ----------- | --------------
--entry-point | -e | Entry point for the app. | `./dist/index.js`
--manual-restart | | Get SIGHUP on change and manage application reboot manually | false
--no-test | | Do not spawn `npm test` after start | false
--no-server | | Do not spawn the app server | false
--ssl | | Serve the app bundle on https | false
--debug | | Allow server debugging, debugger will be available at 127.0.0.1:[port] | 0
--debug-brk | | Allow server debugging, debugger will be available at 127.0.0.1:[port], process won't start until debugger will be attached| 0
--production | | Start using unminified production build (the tests would not run in this mode)

The following are the default values for the CDN server's port, mount directory and whether to serve statics over https or regular http. You can change them in your `package.json`:

```json
"yoshi": {
  "servers": {
    "cdn": {
      "port": 3200,
      "dir": "dist/statics",
      "ssl": false
    }
  }
}
```

### build

Flag | Short Flag | Description | Default Value
---- | ---------- | ----------- | ------------
--analyze | | run webpack-bundle-analyzer plugin. |
--source-map | | Explictly emit bundle source maps. |

This task will perform the following:

1. Compile using `TypeScript` (`*.ts`) or `babel` (`*.js`) files into `dist/`. In case you do not want to transpile server (node), you can remove `.babelrc`/`tsconfig`/package json's `babel` key. If you still need those (for transpiling client code), please use `yoshi.runIndividualTranspiler`.
2. Copy assets to `dist` folder (ejs/html/images...).
3. Add [Webpack stats](https://webpack.js.org/api/stats/) files to `target/`. Two files will be created: `target/webpack-stats.min.json` and `target/webpack-stats.json` for production and development builds respectively. These files can later be used for [bundle analysis](docs/faq/WEBPACK-ANALYZE.md).

You can specify multiple entry points in your `package.json` file. This gives the ability build multiple bundles at once. More info about Webpack entries can be found [here](http://webpack.github.io/docs/configuration.html#entry).

```json
"yoshi": {
  "entry": {
    "a": "./a",
    "b": "./b",
    "c": ["./c", "./d"]
  }
}
```

**Note:** if you have multiple entries you should consider using the [`optimization.splitChunks`](https://gist.github.com/sokra/1522d586b8e5c0f5072d7565c2bee693)

**Note2:** the decision whether to use `TypeScript` or `babel` is done by searching `tsconfig.json` inside the root directory.

### test

Flag | Description
---- | -----------
--mocha | Run unit tests with Mocha - this is the default
--jasmine | Run unit tests with Jasmine
--karma | Run tests with Karma (browser)
--jest | Run tests with Jest
--protractor | Run e2e tests with Protractor (e2e)
--watch | Run tests on watch mode (works for mocha, jasmine, jest & karma)
--debug | Allow test debugging (works for mocha, jest & protractor)
--debug-brk | Allow test debugging (works for mocha, jest & protractor), process won't start until debugger will be attached
--coverage | Collect and output code coverage

By default, this task executes both unit test (using `mocha` as default) and e2e test using `protractor`.
Default unit test glob is `{test,app,src}/**/*.spec.+(js|ts)`. You can change this by adding the following to your package.json:

```js
yoshi: {
  specs: {
    node: 'my-crazy-tests-glob-here'
  }
}
```

* Note that when specifying multiple flags, only the first one will be considered, so you can't compose test runners (for now).

* Mocha tests setup:

  You can add a `test/mocha-setup.js` file, with mocha tests specific setup. Mocha will `require` this file, if exists.
  Example for such `test/mocha-setup.js`:

  ```js
  import 'babel-polyfill';
  import 'isomorphic-fetch';
  import sinonChai from 'sinon-chai';
  import chaiAsPromised from 'chai-as-promised';
  import chai from 'chai';

  chai.use(sinonChai);
  chai.use(chaiAsPromised);
  ```

* Karma tests setup:

  When running tests using Karma, make sure you have the right configurations in your `package.json` as described in [`yoshi.specs`](#wixspecs) section. In addition, if you have a `karma.conf.js` file, the configurations will be merged with our [built-in configurations](yoshi/config/karma.conf.js).
* Jasmine tests setup:

  Specifying a custom glob for test files is possible by configuring `package.json` as described in [`yoshi.specs`](#wixspecs). The default glob matches `.spec.` files in all folders.
  <br />
  If you wish to load helpers, import them all in a file placed at `'test/setup.js'`.
* Jest test setup:

  You may specify a jest config object in your `package.json`, for example:
  ```json
    "jest": {
      "testRegex": "/src/.*\\.spec\\.(ts|tsx)$"
    }
  ```

### lint

Flag | Short Flag | Description | Default Value
---- | ---------- | ----------- | ------------|
--fix | | Automatically fix lint problems | false
--format | | Use a specific formatter for eslint/tslint | stylish
[files...] | | Optional list of files (space delimited) to run lint on | empty

Executes `TSLint` or `ESLint` (depending on the type of the project) over all matched files. An '.eslintrc' / `tslint.json` file with proper configurations is required.

### release

Bump the patch version in `package.json` using `wnpm-release`.

Flag | Short Flag | Description | Default Value
---- | ---------- | ----------- | ------------|
--minor | | bump a minor version instead of a patch | false
