/**
 * Restify middleware.
 */

import {exposeRoute} from './exposeRoute';
import {PathLimit} from './PathLimit';

import * as Debug from 'debug';
import * as onFinished from 'on-finished';
import * as client from 'prom-client';
import * as restify from 'restify';

const debug: Debug.IDebugger = Debug('restify-prom-bundle');

let assign: Function;

if (!Object.assign) {
  /* tslint:disable: no-require-imports no-var-requires */
  assign = require('object-assign');
  /* tslint:enable: no-require-imports no-var-requires */
} else {
  assign = Object.assign;
}

export interface IPreMiddlewareConfig {
  /**
   * Exposed route.
   */
  route?: string | false;
  /**
   * Default metrics.
   */
  defaults?: string[];
  /**
   * Excluded paths.
   */
  exclude?: string | string[] | RegExp | Function;
  /**
   * How often (ms) should prom-client fire default probes.
   */
  promDefaultDelay?: number;
  /**
   * How many path at max should we count.
   */
  maxPathsToCount?: number;
}

/**
 * Default configuration.
 */
const defaultConfig: IPreMiddlewareConfig = {
  route           : '/metrics',
  defaults        : [
    'status',
    'pathDuration',
    'pathCount',
  ],
  maxPathsToCount : 100,
  promDefaultDelay: 1000
};

/**
 * Bundle metrics.
 */
interface IBundleMetrics {
  status?: client.Counter;
  pathDuration?: client.Histogram;
  pathCount?: client.Counter;
}

/**
 * Cache for shouldMeasure exclusion test.
 */
/* tslint:disable: no-any */
let shouldMeasureExcludedCache: any;
/* tslint:enable: no-any */

/**
 * Tells if a path should be measured (not excluded).
 */
const shouldMeasure: Function = (path: string, config: IPreMiddlewareConfig): boolean => {
  let isExcluded: boolean = false;

  if (config.exclude !== undefined) {
    debug('-> Should we measure %s (%o)?', path, config.exclude);
    debug('%o', shouldMeasureExcludedCache);
    if (shouldMeasureExcludedCache.hasOwnProperty(path)) {
      isExcluded = shouldMeasureExcludedCache[path];
      debug(`${isExcluded ? 'no' : 'yes'} (cached)`);
    } else {
      if (Array.isArray(config.exclude) && ((<string[]>config.exclude).indexOf(path) !== -1)) {
        isExcluded = true;
        debug('No (in exclude list)');
      } else if ((config.exclude instanceof RegExp) && (<RegExp>config.exclude).test(path)) {
        isExcluded = true;
        debug('No (matches exclude regex)');
      } else if ((typeof(config.exclude) === 'function') && !!(<Function>config.exclude)(path)) {
        isExcluded = true;
        debug('No (function returned true)');
      }
      shouldMeasureExcludedCache[path] = isExcluded;
    }
    if (!isExcluded) {
      debug('Yes');
    }
  }
  return !isExcluded;
};

/**
 * Checks if config object is valid and add default values.
 */
const checkConfig: Function = (userConfig?: IPreMiddlewareConfig): IPreMiddlewareConfig => {
  let config: IPreMiddlewareConfig;

  if ((typeof userConfig !== 'object') && (userConfig !== undefined)) {
    throw new TypeError('Invalid second argument for restify-prom-bundle.middleware()');
  }
  config = assign(
    {},
    defaultConfig,
    userConfig || {},
  );
  if (
    (config.route !== false) &&
    (
      (typeof config.route !== 'string') ||
      config.route.length === 0
    )
  ) {
    throw new TypeError('`route` option for restify-prom-bundle.middleware() must be a non empty string or false');
  }
  if (!Array.isArray(config.defaults)) {
    throw new TypeError('`defaults` option for restify-prom-bundle.middleware() must be an array');
  }
  if (typeof config.exclude === 'string') {
    config.exclude = [<string>config.exclude];
  }
  if (
    config.exclude && (
      !Array.isArray(config.exclude) &&
      !(config.exclude instanceof RegExp) &&
      !(typeof(config.exclude) === 'function')
    )
  ) {
    throw new TypeError(
      '`exclude` option for restify-prom-bundle.middleware() must be string | string[] | RegExp | Function',
    );
  }
  if ((typeof config.promDefaultDelay !== 'number') || config.promDefaultDelay < 1000) {
    throw new TypeError('`promDefaultDelay` option for restify-prom-bundle.middleware() must be number >= 1000');
  }

  debug('Final config : %o', config);
  return config;
};

/**
 * Initialize metrics.
 */
const initMetrics: Function = (config: IPreMiddlewareConfig): IBundleMetrics => {
  const metrics: IBundleMetrics = {};

  if (config.defaults.indexOf('status') !== -1) {
    debug('Init restify_status_codes status metrics');
    metrics.status = new client.Counter({
      name      : 'restify_status_codes',
      help      : 'Number of response for each HTTP status code.',
      labelNames: ['status_code'],
    });
  }
  if (config.defaults.indexOf('pathDuration') !== -1) {
    debug('Init restify_path_duration status metrics');
    metrics.pathDuration = new client.Histogram({
      name      : 'restify_path_duration',
      help      : 'Histogram of response time in seconds for each request path / status code',
      labelNames: ['path', 'status_code', 'method'],
    });
  }
  if (config.defaults.indexOf('pathCount') !== -1) {
    debug('Init restify_path_count status metrics');
    metrics.pathCount = new client.Counter({
      name: 'restify_path_count',
      help: 'Number of calls to each path',
      labelNames: ['path', 'status_code', 'method'],
    });
  }
  return metrics;
};

/**
 * Create restify's pre-middleware.
 */
/* tslint:disable: max-func-body-length */
export const preMiddleware: Function =
  (server: restify.Server, userConfig?: IPreMiddlewareConfig): restify.RequestHandlerType => {
    let pathLimiter: PathLimit;
    let config: IPreMiddlewareConfig;
    let metrics: IBundleMetrics;

    debug('Initializing pre-middleware');
    shouldMeasureExcludedCache = {};
    if (
      (typeof(server) !== 'object') ||
      !(<any>server).router || //tslint:disable-line: no-any
      !server.pre
    ) {
      throw new TypeError(
        'restify-prom-bundle.middleware() must take a restify server instance as first argument',
      );
    }
    config = checkConfig(userConfig);
    debug(
      'Setting default metrics with %sms delay : %o',
      config.promDefaultDelay,
    );
    client.collectDefaultMetrics({timeout: config.promDefaultDelay});
    pathLimiter = new PathLimit(config.maxPathsToCount);
    // We register the route on pre now to bypass router and avoid middlewares.
    if ((typeof config.route === 'string') && (config.route.length > 0)) {
      server.pre(exposeRoute(config.route));
    }
    metrics = initMetrics(config);
    /* tslint:disable: no-function-expression */
    return function (req: restify.Request, res: restify.Response, next: Function): void {
      /* tslint:enable: no-function-expression */
      let debugStartTime: [number, number];

      if (debug.enabled) {
        debugStartTime = process.hrtime();
        debug('Starting pre-middleware run, searching route for request');
      }
      (<any>server).router.find(  //tslint:disable-line: no-any
        req,
        res,
        (routeFindError: Error, route: restify.Route): void => {
          debug(
            'Searching route result: %o',
            {error: routeFindError && routeFindError.message}, //tslint:disable-line: strict-boolean-expressions
          );
          let path: string = req.path();

          if (!routeFindError) {
            /* tslint:disable: no-any */
            const routePath: any = route.spec.path || (<any>route).spec.url;  //tslint:disable-line: no-any strict-boolean-expressions
            /* tslint:enable: no-any */

            path = (routePath instanceof RegExp) ?
              `RegExp(${routePath})` :
              routePath.toString();
          }
          debug('Using path: %s', path);
          // If path is not excluded
          if (shouldMeasure(path, config)) {
            // restify_status_codes if enabled
            if (metrics.status) {
              onFinished(res, (err2: Error, res2: restify.Response) => {
                debug('Incrementing restify_status_codes %d', (res2.statusCode || 0)); //tslint:disable-line: strict-boolean-expressions
                metrics.status.inc({status_code: res2.statusCode});
              });
            }
            // restify_path_duration if enabled and restify-defined route
            if (metrics.pathDuration && !routeFindError) {
              debug('Starting timer for %s %s', req.method, path);
              const timerEnd: Function = metrics.pathDuration.startTimer({
                path,
                method: req.method,
              });
              onFinished(res, (err2: Error, res2: restify.Response) => {
                const labels: client.labelValues = {
                  status_code: (res2 && res2.statusCode) ? res2.statusCode : 0,
                };
                debug('End timer for %s %s', req.method, path);
                timerEnd(labels);
              });
            }
            // restify_path_count if enabled and url limit not reached
            if (metrics.pathCount && pathLimiter.registerPath(path)) {
              onFinished(res, (err2: Error, res2: restify.Response) => {
                const labels: client.labelValues = {
                  path,
                  method     : req.method,
                  status_code: (res2 && res2.statusCode) ? res2.statusCode : 0,
                };
                debug('Incrementing restify_path_duration code %o', labels);
                metrics.pathCount.inc(labels);
              });
            }
          }
          if (debug.enabled) {
            const result: [number, number] = process.hrtime(debugStartTime);
            debug(
              'Finished pre-middleware run, took %dms',
              (result[0] * 1000) + Math.round(result[1] / 1000000),
            );
          }
          next();
        });
    };
  };
/* tslint:enable: max-func-body-length */
