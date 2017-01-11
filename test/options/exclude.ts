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

describe('`exclude` options', () => {
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

  it('should only accept a string, string[], regex or function', () => {
    const testValue = (exclude: any) => () => { promClient.register.clear(); bundle.preMiddleware(server, {exclude}); };
    const error: string = '`exclude` option for restify-prom-bundle.middleware() must be string | string[] | RegExp | Function';

    expect(testValue(1)).to.throw(error);
    expect(testValue({})).to.throw(error);

    expect(testValue(undefined)).to.not.throw();
    expect(testValue(false)).to.not.throw();
    expect(testValue('/test')).to.not.throw();
    expect(testValue(['/test1', '/test2'])).to.not.throw();
    expect(testValue(/test/)).to.not.throw();
    expect(testValue(()=>true)).to.not.throw();
  });

  it('should respect specified values', () => {
    const expecteds: any[] = [
      [
        // Specified value.
        '',
        // Should be counted.
        [
          '/testWhenEmptyString',
        ],
        // Should not be counted.
        [],
      ],
      [
        // Specified value.
        '/test',
        // Should be counted.
        [
          '/test2',
          // We make sure the cache is covered (1/4).
          '/test2',
        ],
        // Should not be counted.
        [
          '/test',
          // We make sure the cache is covered (2/4).
          '/test',
        ],
      ],
      [
        // Specified value.
        [],
        // Should be counted.
        [
          '/testWhenEmptyArray',
        ],
        // Should not be counted.
        [],
      ],
      [
        // Specified value.
        ['/test1', '/test2', {}],
        // Should be counted.
        [
          '/test3',
        ],
        // Should not be counted.
        [
          '/test1',
          '/test2',
        ],
      ],
      [
        // Specified value.
        /^\/test/,
        // Should be counted.
        [
          '/atest',
          '/bleh',
        ],
        // Should not be counted.
        [
          '/test',
          '/test/something',
        ],
      ],
      [
        // Specified value.
        (path: string) => (path.length !== 5),
        // Should be counted.
        [
          '/test',
          '/1234',
        ],
        // Should not be counted.
        [
          '/test2',
          '/',
        ],
      ],
    ];

    return expect(
      Bluebird.map(
        expecteds,
        (expected: any[]) => Bluebird.promisify(reinitServer)()
          .then(() => server.pre(bundle.preMiddleware(server, { exclude: expected[0]})))
          .then(() => Bluebird.map(
            expected[1],
            (path: string) => RequestPromise.get({uri: uri(path), simple: false}),
            // We make sure the cache is covered (3/4).
            { concurrency: 1 }
          ))
          .then(() => Bluebird.map(
            expected[2],
            (path: string) => RequestPromise.get({uri: uri(path), simple: false}),
            // We make sure the cache is covered (4/4).
            { concurrency: 1 }
          ))
          .then(() => {
            if (!expected[1].length) {
              return;
            }
            return Bluebird.map(
              expected[1],
              (path: string): Bluebird<void> => testPathCounted(path)
                .catch((err: Error) => {
                  if (err.message === 'Path was not counted') {
                    throw new Error(`Path ${path} should have been counted for ${util.inspect(expected[0])}`)
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
              (path: string): Bluebird<void> => testPathCounted(path)
                .then(() => {
                  throw new Error(`Path ${path} should not have be counted for ${util.inspect(expected[0])}`)
                })
                .catch((err: Error) => {
                  if (err.message !== 'Path was not counted') {
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
