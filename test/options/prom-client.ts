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

describe('`promBlacklist` and `promDefaultDelay` options', () => {
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

  it('`promBlacklist` should only accept string[]', () => {
    const error: string = '`promBlacklist` option for restify-prom-bundle.middleware() must be an array';
    const testValue = (promBlacklist?: any) => () => { promClient.register.clear(); bundle.preMiddleware(server, {promBlacklist}) };


    expect(testValue('something')).to.throw(error);
    expect(testValue({})).to.throw(error);
    expect(testValue(1)).to.throw(error);
    expect(testValue()).to.throw(error);

    expect(testValue([])).to.not.throw();
    expect(testValue(['something'])).to.not.throw();
  });

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

  it('should respect specified values', () => {
    const expecteds: any[] = [
      [
        // Specified value.
        [''],
        // Should be present.
        [
          'process_open_fds',
        ],
        // Should not be present.
        [],
      ],
      [
        // Specified value.
        ['processCpuTotal'],
        // Should be present.
        [
          'nodejs_eventloop_lag_seconds',
        ],
        // Should not be present.
        [
          'process_cpu_seconds_total',
        ],
      ],
      [
        // Specified value.
        ['processCpuTotal', 'eventLoopLag'],
        // Should be present.
        [
          'process_start_time_seconds',
        ],
        // Should not be present.
        [
          'process_cpu_seconds_total',
          'nodejs_eventloop_lag_seconds',
        ],
      ],
    ];

    return expect(
      Bluebird.map(
        expecteds,
        (expected: any[]) => Bluebird.promisify(reinitServer)()
          .then(() => server.pre(bundle.preMiddleware(server, { promBlacklist: expected[0]})))
          .then(() => {
            if (!expected[1].length) {
              return;
            }
            return Bluebird.map(
              expected[1],
              (metric: string): Bluebird<void> => testMetricPresent(metric)
                .catch((err: Error) => {
                  if (err.message.indexOf('No metric ') === 0) {
                    throw new Error(`Specified ${util.inspect(expected[0])}, should have ${util.inspect(expected[1])}`)
                  }
                  throw err;
                })
            );
          })
          .then(() => {
            if (!expected[2].length) {
              return;
            }
            return Bluebird.map(
              expected[2],
              (metric: string): Bluebird<void> => testMetricPresent(metric)
                .then(() => {
                  throw new Error(`Specified ${util.inspect(expected[0])}, should not have ${util.inspect(expected[2])}`)
                })
                .catch((err: Error) => {
                  if (err.message.indexOf('No metric ') !== 0) {
                    throw err;
                  }
                  return;
                })
            );
          }),
        { concurrency: 1}
      )
    ).to.eventually.be.fulfilled;
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });
});
