/**
 * `maxPathsToCount` option tests.
 */

let bundle: any = require('../../built/map/index');
const portfinder: any = require('portfinder');

import * as Bluebird from 'bluebird';
import {expect, use as chaiUse} from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as promClient from 'prom-client';
import * as RequestPromise from 'request-promise';
import * as restify from 'restify';

chaiUse(chaiAsPromised);

describe('`maxPathsToCount` options', () => {
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
      server.on('listening', () => done());
      server.listen(port);
    });
  };
  const testPathCounted = (path: string): Bluebird<void> => RequestPromise.get(uri('/metrics'))
      .then((response: string) => {
        if (!(new RegExp(`^restify_path_count\\{.*path="${path}"`, 'm')).test(response)) {
          throw new Error('Path was not counted');
        }
      });
  const okRoute = (req: restify.Request, res: restify.Response, next: Function) => { res.end('ok'); next(); };

  beforeEach(reinitServer);

  it('should only accept a number >=0 ', () => {
    const testValue = (maxPathsToCount?: any) => () => { promClient.register.clear(); bundle.preMiddleware(server, {maxPathsToCount}); };
    const error: string = '`maxPathsToCount` option for restify-prom-bundle.middleware() must be >=0 number';

    expect(testValue(-1)).to.throw(error);
    expect(testValue({})).to.throw(error);
    expect(testValue()).to.throw(error);

    expect(testValue(0)).to.not.throw();
    expect(testValue(1)).to.not.throw();
    expect(testValue(10000)).to.not.throw();
  });

  it('should respect specified values', () => {
    return expect(
      Bluebird.promisify(reinitServer)()
        .then(() => server.pre(bundle.preMiddleware(server, { maxPathsToCount: 10 })))
        .then(() => Bluebird.map(
          Array.from(new Array(11), (value:any, index:number)=> index + 1),
          (i: number) => RequestPromise.get({uri: uri(`/test/${i}`), simple: false})
        ))
        .then(() => testPathCounted('/test/10'))
        .catch((err: Error) => {
          if (err.message === 'Path was not counted') {
            throw new Error('/test/10 should have been counted when limited to 10')
          }
          return;
        })
        .then(() => testPathCounted('/test/11'))
        .then(() => { throw new Error('/test/11 should not have been counted when limited to 10')})
        .catch((err: Error) => {
          if (err.message !== 'Path was not counted') {
            throw err;
          }
          return;
        })
    ).to.eventually.be.fulfilled
      .then(() => expect(
          Bluebird.promisify(reinitServer)()
            .then(() => server.pre(bundle.preMiddleware(server, { maxPathsToCount: 0 })))
            .then(() => Bluebird.map(
              Array.from(new Array(11), (value:any, index:number)=> index + 1),
              (i: number) => RequestPromise.get({uri: uri(`/test/${i}`), simple: false})
            ))
            .then(() => testPathCounted('/test/10'))
            .then(() => testPathCounted('/test/11'))
            .catch((err: Error) => {
              if (err.message === 'Path was not counted') {
                throw new Error('/test/11 should have been counted when unlimited')
              }
              return;
            })
        ).to.eventually.be.fulfilled
      );
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });
});
