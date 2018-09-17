import { Router } from 'express';

let context
let router;
let wrappedFunction;

const makeHotExport = sourceModule => {
  if (sourceModule.hot) {
    sourceModule.hot.accept(() => {
      setTimeout(() => {
        try {
          router = wrappedFunction(Router(), context);
        } catch (error) {
        //   console.log(error);
        }
      });
    });

    if (sourceModule.hot.addStatusHandler) {
      if (sourceModule.hot.status() === 'idle') {
        sourceModule.hot.addStatusHandler(status => {
          if (status === 'apply') {
            setTimeout(() => {
              // try {
                router = wrappedFunction(Router(), context);
              // } catch (error) {
              //   console.log(error);
              // }
            });
          }
        })
      }
    }

    // sourceModule.hot.dispose(() => {
    //   setTimeout(() => {
    //     // try {
    //       router = wrappedFunction(Router(), context);
    //     // } catch (error) {
    //     //   console.log(error);
    //     // }
    //   });
    // });
  }
};

export default (sourceModule, _wrappedFunction) => {
  makeHotExport(sourceModule);

  wrappedFunction = _wrappedFunction;

  return (app, _context) => {
    context = _context;

    router = wrappedFunction(Router(), context);

    app.use((req, res, next) => {
      router.handle(req, res, next);
    });

    return app;
  };
};
