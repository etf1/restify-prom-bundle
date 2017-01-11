/**
 * Ensure types of path are handled.
 */

let bundle: any = require('../built/map/index');
const portfinder: any = require('portfinder');

import * as Bluebird from 'bluebird';
import {expect, use as chaiUse} from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as promClient from 'prom-client';
import * as RequestPromise from 'request-promise';
import * as restify from 'restify';
import * as util from 'util';

chaiUse(chaiAsPromised);

describe('Restify paths types', () => {
  let server: restify.Server;
  let port: Number;
  const uri: (path?: string) => string =
    (path) => `http://127.0.0.1:${port}${path || '/'}`;
  const reinitServer = (done: Function): void => {
    portfinder.getPort((err: Error, _port: Number) => {
      if (server) {
        server.close();
      }
      if (err) {
        return done(err);
      }
      port = _port;
      promClient.register.clear();
      server = restify.createServer();
      server.pre(bundle.preMiddleware(server));
      server.on('listening', () => done());
      server.listen(port);
    });
  };
  const testPathCounted = (path: string, method: string = 'GET'): Bluebird<void> => RequestPromise.get(uri('/metrics'))
      .then((response: string) => {
        let counted: boolean = false;
        //const lineRegex: RegExp = /^restify_path_count\{([^\}]+)\}/m;
        const lineRegex: RegExp = /\{([^\}]+)\}/gm;
        let lineRegexResult: RegExpExecArray;

        while ((lineRegexResult = lineRegex.exec(response))) {
          const paramsRegex: RegExp = /(?:^)?([^=]+)="([^"]+)",?/g;
          let paramsRegexResult: RegExpExecArray;
          const params: any = {};

          while ((paramsRegexResult = paramsRegex.exec(lineRegexResult[1]))) {
            params[paramsRegexResult[1]] = paramsRegexResult[2];
          }
          if ((params['path'] === path) && (params['method'] === method)) {
            counted = true;
            break;
          }
        }
        if (!counted) {
          throw new Error('Path was not counted');
        }
      });
  const okRoute = (req: restify.Request, res: restify.Response, next: Function) => { res.end('ok'); next(); };

  beforeEach(reinitServer);

  it('Simple routes GET (/path)', () => {
    return expect(
      (new Promise<void>((resolve: Function) => { server.get('/path', okRoute); resolve(); }))
        .then(() => RequestPromise.get(uri('/path')))
        .then(() => testPathCounted('/path'))
    ).to.eventually.be.fulfilled;
  });

  it('Simple routes POST (/path)', () => {
    return expect(
      (new Promise<void>((resolve: Function) => { server.post('/path', okRoute); resolve(); }))
        .then(() => RequestPromise.post(uri('/path')))
        .then(() => testPathCounted('/path', 'POST'))
    ).to.eventually.be.fulfilled;
  });

  it('Regex routes GET (/^\/path$/)', () => {
    return expect(
      (new Promise<void>((resolve: Function) => { server.get(/^\/path$/, okRoute); resolve(); }))
        .then(() => RequestPromise.get(uri('/path')))
        .then(() => testPathCounted('RegExp(/^\\\\/path$/)'))
    ).to.eventually.be.fulfilled;
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });
});
