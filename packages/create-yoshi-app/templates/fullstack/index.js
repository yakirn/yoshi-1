const bootstrap = require('wix-bootstrap-ng');

const app = bootstrap()
  .use(require('wix-bootstrap-greynode'))
  .use(require('wix-bootstrap-hadron'))
  .use(require('wix-bootstrap-renderer'));

app.express('./build/server.js');

app.start({
  disableCluster: process.env.NODE_ENV !== 'production',
});
