/**
 * `exclude` option tests.
 */

let bundle: any = require('../../built/map/index');
const portfinder: any = require('portfinder');

import * as Bluebird from 'bluebird';
import {expect, use as chaiUse} from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as promClient from 'prom-client';
import * as RequestPromise from 'request-promise';
import * as restify from 'restify';
import * as util from 'util';

chaiUse(chaiAsPromised);

describe('`promDefaultDelay` options', () => {
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

  const testMetricPresent = (metric: string): Bluebird<void> => {
    return RequestPromise.get(uri('/metrics'))
      .then((response: string) => {
        if (!(new RegExp(`^# TYPE ${metric}\\s`, 'm')).test(response)) {
          throw new Error(`No metric "${metric}" exposed`);
        }
      });
  };

  beforeEach(reinitServer);

  it('`promDefaultDelay` should only accept number >= 1000', () => {
    const error: string = '`promDefaultDelay` option for restify-prom-bundle.middleware() must be number >= 1000';
    const testValue = (promDefaultDelay?: any) => () => { promClient.register.clear(); bundle.preMiddleware(server, {promDefaultDelay}) };


    expect(testValue('something')).to.throw(error);
    expect(testValue({})).to.throw(error);
    expect(testValue(1)).to.throw(error);
    expect(testValue()).to.throw(error);

    expect(testValue(1000)).to.not.throw();
    expect(testValue(Number.MAX_SAFE_INTEGER)).to.not.throw();
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });
});
