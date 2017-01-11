/**
 * `route` option tests.
 */

const bundle: any = require('../../built/map/index');
const portfinder: any = require('portfinder');

import * as Bluebird from 'bluebird';
import {expect, use as chaiUse} from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as promClient from 'prom-client';
import * as RequestPromise from 'request-promise';
import * as restify from 'restify';

chaiUse(chaiAsPromised);

describe('`route` options', () => {
  let server: restify.Server;
  let port: Number;
  const uri: (path?: string) => string =
    (path) => `http://127.0.0.1:${port}${path || '/'}`;

  beforeEach((done: Function) => {
    portfinder.getPort((err: Error, _port: Number) => {
      if (err) {
        return done(err);
      }
      port = _port;
      promClient.register.clear();
      server = restify.createServer();
      server.on('listening', () => done());
      server.listen(port);
    });
  });

  it('should only accept a non empty string', () => {
    const testOption = (route?: any) => () => { promClient.register.clear(); bundle.preMiddleware(server, {route}) };
    const error: string = '`route` option for restify-prom-bundle.middleware() must be a non empty string or false';

    expect(testOption(1)).to.throw(error);
    expect(testOption(null)).to.throw(error);
    expect(testOption({})).to.throw(error);
    expect(testOption('')).to.throw(error);

    expect(testOption(false)).to.not.throw();
    expect(testOption('/')).to.not.throw();
    expect(testOption('/ok')).to.not.throw();
  });

  it('should have a the correct default value', () => {
    server.pre(bundle.preMiddleware(server));
    return expect(
      RequestPromise.get(uri('/metrics'))
    ).to.eventually.be.fulfilled;
  });

  it('should expose metrics to the specified route', () => {
    server.pre(bundle.preMiddleware(server, { route: '/test' }));
    return expect(
      Bluebird.all([
        RequestPromise.get(uri('/test')),
        RequestPromise.get(uri('/metrics'))
          .then(() => { throw new Error('/metrics route should not be exposed'); })
          .catch((err: any) => {
            if (err.statusCode === 404) {
              return;
            }
            throw err;
          })
      ])
    ).to.eventually.be.fulfilled;
  });

  it('should not expose metrics when route if false', () => {
    server.pre(bundle.preMiddleware(server, { route: false }));
    return expect(
      Bluebird.all([
        RequestPromise.get(uri('/metrics'))
          .then(() => { throw new Error('/metrics route should not be exposed'); })
          .catch((err: any) => {
            if (err.statusCode === 404) {
              return;
            }
            throw err;
          })
      ])
    ).to.eventually.be.fulfilled;
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });
});
