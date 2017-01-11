/**
 * The metrics exposition route.
 */

import * as client from 'prom-client';
import * as restify from 'restify';

export const exposeRoute: (path: string) => restify.RequestHandler = (path: string) =>
  (req: restify.Request, res: restify.Response, next: Function): void => {
    if (req.path() === path) {
      res.writeHead(
        200,
        {
          'Content-Type': 'text/plain',
        },
      );
      res.end(client.register.metrics());
      return;
    }
    next();
  };
