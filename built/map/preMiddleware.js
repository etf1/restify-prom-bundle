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

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxOaWNhbmRlclxccmVzdGlmeS1wcm9tLWJ1bmRsZVxcc3JjXFxwcmVNaWRkbGV3YXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBSUEsK0NBQTBDO0FBQzFDLDJDQUFzQztBQUV0QywrQkFBK0I7QUFDL0IsMENBQTBDO0FBQzFDLHNDQUFzQztBQUd0QyxNQUFNLEtBQUssR0FBb0IsS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFFNUQsSUFBSSxNQUFnQixDQUFDO0FBRXJCLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFFbkIsTUFBTSxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQztBQUVwQyxDQUFDO0FBQUMsSUFBSSxDQUFDLENBQUM7SUFDTixNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztBQUN6QixDQUFDO0FBNEJELE1BQU0sYUFBYSxHQUF5QjtJQUMxQyxLQUFLLEVBQWEsVUFBVTtJQUM1QixRQUFRLEVBQVU7UUFDaEIsUUFBUTtRQUNSLGNBQWM7UUFDZCxXQUFXO0tBQ1o7SUFDRCxlQUFlLEVBQUcsR0FBRztJQUNyQixnQkFBZ0IsRUFBRSxJQUFJO0NBQ3ZCLENBQUM7QUFlRixJQUFJLDBCQUErQixDQUFDO0FBTXBDLE1BQU0sYUFBYSxHQUFhLENBQUMsSUFBWSxFQUFFLE1BQTRCLEVBQVcsRUFBRTtJQUN0RixJQUFJLFVBQVUsR0FBWSxLQUFLLENBQUM7SUFFaEMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzdELEtBQUssQ0FBQyxJQUFJLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztRQUN4QyxFQUFFLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FB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QUMsTUFBTTtxQkFDbkIsQ0FBQyxDQUFDO29CQUNILFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFXLEVBQUUsSUFBc0IsRUFBRSxFQUFFO3dCQUN0RCxNQUFNLE1BQU0sR0FBdUI7NEJBQ2pDLFdBQVcsRUFBRSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7eUJBQzdELENBQUM7d0JBQ0YsS0FBSyxDQUFDLHFCQUFxQixFQUFFLEdBQUcsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7d0JBQy9DLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDbkIsQ0FBQyxDQUFDLENBQUM7Z0JBQ0wsQ0FBQztnQkFFRCxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxJQUFJLFdBQVcsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN4RCxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBVyxFQUFFLElBQXNCLEVBQUUsRUFBRTt3QkFDdEQsTUFBTSxNQUFNLEdBQXVCOzRCQUNqQyxJQUFJOzRCQUNKLE1BQU0sRUFBTyxHQUFHLENBQUMsTUFBTTs0QkFDdkIsV0FBVyxFQUFFLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQzt5QkFDN0QsQ0FBQzt3QkFDRixLQUFLLENBQUMsNENBQTRDLEVBQUUsTUFBTSxDQUFDLENBQUM7d0JBQzVELE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUNoQyxDQUFDLENBQUMsQ0FBQztnQkFDTCxDQUFDO1lBQ0gsQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUNsQixNQUFNLE1BQU0sR0FBcUIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDaEUsS0FBSyxDQUNILHdDQUF3QyxFQUN4QyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FDckQsQ0FBQztZQUNKLENBQUM7WUFDRCxJQUFJLEVBQUUsQ0FBQztRQUNULENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDIiwiZmlsZSI6InByZU1pZGRsZXdhcmUuanMifQ==
