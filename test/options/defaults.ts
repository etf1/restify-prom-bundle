/**
 * `defaults` option tests.
 */

const bundle: any = require('../../built/map/index');
const portfinder: any = require('portfinder');

import * as Bluebird from 'bluebird';
import {expect, use as chaiUse} from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as promClient from 'prom-client';
import * as RequestPromise from 'request-promise';
import * as restify from 'restify';
import * as util from 'util';

chaiUse(chaiAsPromised);

describe('`defaults` options', () => {
  let server: restify.Server;
  let port: Number;
  const uri: (path?: string) => string =
    (path) => `http://127.0.0.1:${port}${path || '/'}`;
  const reinitServer = (done: Function): void => {
    if (server) {
      server.close();
    }
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
  };
  const testMetricPresent = (metric: string, type: string): Bluebird<void> => {
    return RequestPromise.get(uri('/metrics'))
      .then((response: string) => {
        if (!(new RegExp(`^# TYPE ${metric} ${type}\\s?$`, 'm')).test(response)) {
          throw new Error(`No metric "${metric}" of type ${type} exposed`);
        }
      });
  };

  beforeEach(reinitServer);

  it('should only accept an array', () => {
    const testOption = (defaults: any) => () => bundle.preMiddleware(server, {defaults});
    const error: string = '`defaults` option for restify-prom-bundle.middleware() must be an array';

    expect(testOption(1)).to.throw(error);
    expect(testOption(null)).to.throw(error);
    expect(testOption({})).to.throw(error);
    expect(testOption('status')).to.throw(error);

    expect(testOption([])).to.not.throw();
    expect(testOption(['status'])).to.not.throw();
  });

  it('should have the correct default value', () => {
    server.pre(bundle.preMiddleware(server));

    return expect(
      Bluebird.all([
        testMetricPresent('restify_status_codes', 'counter'),
        testMetricPresent('restify_path_duration', 'histogram'),
        testMetricPresent('restify_path_count', 'counter'),
      ])
    ).to.eventually.be.fulfilled;
  });

  it('should respect specified value', () => {
    const expecteds: any[] = [
      [
        // Specified value.
        [],
        // Should be present.
        [],
        // Should not be present.
        [
          ['restify_status_codes', 'counter'],
          ['restify_path_duration', 'histogram'],
          ['restify_path_count', 'counter'],
        ]
      ],
      [
        // Specified value.
        ['status'],
        // Should be present.
        [
          ['restify_status_codes', 'counter'],
        ],
        // Should not be present.
        [
          ['restify_path_duration', 'histogram'],
          ['restify_path_count', 'counter'],
        ]
      ],
      [
        // Specified value.
        ['pathDuration', 'pathCount'],
        // Should be present.
        [
          ['restify_path_duration', 'histogram'],
          ['restify_path_count', 'counter'],
        ],
        // Should not be present.
        [
          ['restify_status_codes', 'counter'],
        ]
      ],
    ];

    return expect(
      Bluebird.map(
        expecteds,
        (expected: any[]) => Bluebird.promisify(reinitServer)()
            .then(() => server.pre(bundle.preMiddleware(server, { defaults: expected[0]})))
            .then(() => {
              if (!expected[1].length) {
                return;
              }
              return Bluebird.map(
                expected[1],
                (args: string[]): Bluebird<void> => testMetricPresent.apply(null, args)
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
                (args: string[]): Bluebird<void> => testMetricPresent.apply(null, args)
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
