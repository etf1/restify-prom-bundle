"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const exposeRoute_1 = require("./exposeRoute");
const PathLimit_1 = require("./PathLimit");
const Debug = require("debug");
const onFinished = require("on-finished");
const client = require("prom-client");
const debug = Debug('restify-prom-bundle');
let assign;
if (!Object.assign) {
    assign = require('object-assign');
}
else {
    assign = Object.assign;
}
const defaultConfig = {
    route: '/metrics',
    defaults: [
        'status',
        'pathDuration',
        'pathCount',
    ],
    maxPathsToCount: 100,
    promDefaultDelay: 1000,
};
let shouldMeasureExcludedCache;
const shouldMeasure = (path, config) => {
    let isExcluded = false;
    if (config.exclude !== undefined) {
        debug('-> Should we measure %s (%o)?', path, config.exclude);
        debug('%o', shouldMeasureExcludedCache);
        if (shouldMeasureExcludedCache.hasOwnProperty(path)) {
            isExcluded = shouldMeasureExcludedCache[path];
            debug(`${isExcluded ? 'no' : 'yes'} (cached)`);
        }
        else {
            if (Array.isArray(config.exclude) && (config.exclude.indexOf(path) !== -1)) {
                isExcluded = true;
                debug('No (in exclude list)');
            }
            else if ((config.exclude instanceof RegExp) && config.exclude.test(path)) {
                isExcluded = true;
                debug('No (matches exclude regex)');
            }
            else if ((typeof (config.exclude) === 'function') && !!config.exclude(path)) {
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
const checkConfig = (userConfig) => {
    let config;
    if ((typeof userConfig !== 'object') && (userConfig !== undefined)) {
        throw new TypeError('Invalid second argument for restify-prom-bundle.middleware()');
    }
    config = assign({}, defaultConfig, userConfig || {});
    if ((config.route !== false) &&
        ((typeof config.route !== 'string') ||
            config.route.length === 0)) {
        throw new TypeError('`route` option for restify-prom-bundle.middleware() must be a non empty string or false');
    }
    if (!Array.isArray(config.defaults)) {
        throw new TypeError('`defaults` option for restify-prom-bundle.middleware() must be an array');
    }
    if (typeof config.exclude === 'string') {
        config.exclude = [config.exclude];
    }
    if (config.exclude && (!Array.isArray(config.exclude) &&
        !(config.exclude instanceof RegExp) &&
        !(typeof (config.exclude) === 'function'))) {
        throw new TypeError('`exclude` option for restify-prom-bundle.middleware() must be string | string[] | RegExp | Function');
    }
    if ((typeof config.promDefaultDelay !== 'number') || config.promDefaultDelay < 1000) {
        throw new TypeError('`promDefaultDelay` option for restify-prom-bundle.middleware() must be number >= 1000');
    }
    debug('Final config : %o', config);
    return config;
};
const initMetrics = (config) => {
    const metrics = {};
    if (config.defaults.indexOf('status') !== -1) {
        debug('Init restify_status_codes status metrics');
        metrics.status = new client.Counter({
            name: 'restify_status_codes',
            help: 'Number of response for each HTTP status code.',
            labelNames: ['status_code'],
        });
    }
    if (config.defaults.indexOf('pathDuration') !== -1) {
        debug('Init restify_path_duration status metrics');
        metrics.pathDuration = new client.Histogram({
            name: 'restify_path_duration',
            help: 'Histogram of response time in seconds for each request path / status code',
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
exports.preMiddleware = (server, userConfig) => {
    let pathLimiter;
    let config;
    let metrics;
    debug('Initializing pre-middleware');
    shouldMeasureExcludedCache = {};
    if ((typeof (server) !== 'object') ||
        !server.router ||
        !server.pre) {
        throw new TypeError('restify-prom-bundle.middleware() must take a restify server instance as first argument');
    }
    config = checkConfig(userConfig);
    debug('Setting default metrics with %sms delay : %o', config.promDefaultDelay);
    client.collectDefaultMetrics({ interval: config.promDefaultDelay });
    pathLimiter = new PathLimit_1.PathLimit(config.maxPathsToCount);
    if ((typeof config.route === 'string') && (config.route.length > 0)) {
        server.pre(exposeRoute_1.exposeRoute(config.route));
    }
    metrics = initMetrics(config);
    return function (req, res, next) {
        let debugStartTime;
        if (debug.enabled) {
            debugStartTime = process.hrtime();
            debug('Starting pre-middleware run, searching route for request');
        }
        server.router.find(req, res, (routeFindError, route) => {
            debug('Searching route result: %o', { error: routeFindError && routeFindError.message });
            let path = req.path();
            if (!routeFindError) {
                const routePath = route.spec.path || route.spec.url;
                path = (routePath instanceof RegExp) ?
                    `RegExp(${routePath})` :
                    routePath.toString();
            }
            debug('Using path: %s', path);
            if (shouldMeasure(path, config)) {
                if (metrics.status) {
                    onFinished(res, (err2, res2) => {
                        debug('Incrementing restify_status_codes %d', (res2.statusCode || 0));
                        metrics.status.inc({ status_code: res2.statusCode });
                    });
                }
                if (metrics.pathDuration && !routeFindError) {
                    debug('Starting timer for %s %s', req.method, path);
                    const timerEnd = metrics.pathDuration.startTimer({
                        path,
                        method: req.method,
                    });
                    onFinished(res, (err2, res2) => {
                        const labels = {
                            status_code: (res2 && res2.statusCode) ? res2.statusCode : 0,
                        };
                        debug('End timer for %s %s', req.method, path);
                        timerEnd(labels);
                    });
                }
                if (metrics.pathCount && pathLimiter.registerPath(path)) {
                    onFinished(res, (err2, res2) => {
                        const labels = {
                            path,
                            method: req.method,
                            status_code: (res2 && res2.statusCode) ? res2.statusCode : 0,
                        };
                        debug('Incrementing restify_path_duration code %o', labels);
                        metrics.pathCount.inc(labels);
                    });
                }
            }
            if (debug.enabled) {
                const result = process.hrtime(debugStartTime);
                debug('Finished pre-middleware run, took %dms', (result[0] * 1000) + Math.round(result[1] / 1000000));
            }
            next();
        });
    };
};
