/**
 * The metrics exposition route.
 */

import * as client from 'prom-client';
import * as restify from 'restify';

export const exposeRoute: Function = (path: string): restify.RequestHandlerType =>
    (req: restify.Request, res: restify.Response, next: restify.Next): void => {
      if (req.path() === path) {
        res.status(200);
        res.header('Content-Type', 'text/plain');
        res.end(client.register.metrics());
        return;
      }
      next();
    };
