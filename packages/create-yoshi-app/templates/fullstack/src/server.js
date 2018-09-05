let real = require('./real');

let appInstance;
let contextInstance;

module.exports = (app, context) => {
  if (!appInstance) {
    appInstance = app;
  }

  if (!contextInstance) {
    contextInstance = context;
  }

  return real(app, context);
};

if (module.hot) {
  module.hot.accept('./real', () => {
    real = require('./real');

    // console.log('check', appInstance._router.stack);

    appInstance._router.stack = appInstance._router.stack.slice(0, 4);

    // console.log('check', appInstance._router.stack);

    real(appInstance, contextInstance);

    // console.log('check', appInstance._router.stack);
  });
}
