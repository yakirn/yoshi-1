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
    try {
      real = require('./real');
      appInstance._router.stack = appInstance._router.stack.slice(0, 4);
      real(appInstance, contextInstance);
    } catch (error) {
      console.error(error);
    }
  });
}
