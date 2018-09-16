import { Router } from 'express';

let context
let router;
let wrappedFunction;

const makeHotExport = sourceModule => {
  if (sourceModule.hot) {
    sourceModule.hot.accept();

    sourceModule.hot.dispose(() => {
      setTimeout(() => {
        router = wrappedFunction(Router(), context);
      });
    });
  }
};

export default (sourceModule) => {
  if (!sourceModule || !sourceModule.id) {
    throw new Error(
      'Could not find the `id` property in the `module` you have provided',
    );
  }

  makeHotExport(sourceModule);

  return _wrappedFunction => {
    wrappedFunction = _wrappedFunction;

    return (app, _context) => {
      context = _context;

      router = wrappedFunction(Router(), context);

      app.use((req, res) => {
        router.handle(req, res);
      });

      return app;
    };
  };
};
