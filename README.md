# Restify middleware to export standard http prometheus metrics.

[![dependencies Status](https://david-dm.org/etf1/restify-prom-bundle/status.svg)](https://david-dm.org/etf1/restify-prom-bundle) [![Build Status](https://travis-ci.org/etf1/restify-prom-bundle.svg?branch=master)](https://travis-ci.org/etf1/restify-prom-bundle) [![codecov](https://codecov.io/gh/etf1/restify-prom-bundle/branch/master/graph/badge.svg)](https://codecov.io/gh/etf1/restify-prom-bundle) [![Known Vulnerabilities](https://snyk.io/test/github/etf1/restify-prom-bundle/badge.svg)](https://snyk.io/test/github/etf1/restify-prom-bundle)

## Usage

```js
const promBundle = require('restify-prom-bundle');
const restify = require('restify');

const server = restify.createServer({ /* options */ });

server.pre(promBundle.preMiddleware(server, { /* options */ }));

server.get('/api', (req, res) => {
  // Custom metrics can be added by using the client.
  const counter = new promBundle.client.Gauge(
    'my_custom_counter',
    'My custom counter'
  );

  counter.inc();
  res.end('OK');
});

server.listen(8000);

// The /metrics route is now available with metrics.
```

Since prom-client is a singleton, it can be accessed from everywhere by just require'ing / import the module, aggregated metrics will be exposed on the route.

## API


### preMiddleware(server[, options]) => `Restify.Handler`

Creates the restify pre-middleware to

- Creates the expose route used by prometheus server to index metrics
- Setup default metrics you want to measure

Options :

| Name               | Type        | Default      | Description |
| ---------          | ---------   | ---------    | --------- |
| route              | `string`    | `'/metrics'` | Exposed route (as GET) for metrics. If `false` no route will be exposed. |
| defaults           | `string[] ` | All metrics  | Name of default metrics (see table below) to add for each routes. |
| exclude            | `string` <br/> `string[]`  <br/> `RegExp`  <br/> `Function` | `undefined` | URI(s), uri that match regular expression or uri that passed to function returns true that will be excluded from default metrics. |
| promBlacklist      | `string[] ` | `undefined`  | `process`/`node` [default metrics](https://github.com/siimon/prom-client#default-metrics) to blacklist |
| promDefaultDelay   | `number `   | 10000        | How often (ms) should prom-client fire default probes |
| maxPathsToCount    | `number `   | 100          | How many paths at max should we measure calls on (restify_path_count), use 0 for unlimited (See [below](#paths-limitation). |

Default metrics :

| Name          | Metric Name           | Type        | Description |
| ---------     | ---------             | ---------   | ---------   |
| status        | restify_status_codes  | [Counter](https://github.com/siimon/prom-client#counter)      | Number of response for each HTTP status code with `status_code` as label. |
| pathDuration  | restify_path_duration | [Histogram](https://github.com/siimon/prom-client#histogram)  | Duration (seconds) by percentiles taken by each restify-defined path to generate the response with the `path`, `status_code` and the `method` as labels.  |
| pathCount     | restify_path_count    | [Counter](https://github.com/siimon/prom-client#counter)      | Number of calls to each path with the `path`, `status_code` and the `method` as labels. |

`duration` metrics precision will depends on the pre-middleware registering order, the sooner you register (first `server.pre()` call), the better it will be.

### `prom-client`: client

Singleton instance of [prom-client](https://github.com/siimon/prom-client) to set custom metrics.

## Paths limitation

If a huge number of different non-routed requests (404) are sent to the server, the process will have to keep a `restify_path_count` label for each one and the process memory will increase undefinitively.
In addition, the prometheus (and grafana) service that uses this probes will be flooded.
To prevent this situation, number of measured paths are limited to `maxPathsToCount`.

This does not affect `restify_path_duration` as it only measures the restify-defined paths, nor `restify_status_codes` as it's limited to HTTP status codes.

Once `maxPathsToMeasure` paths are measured, every new paths will be ignored for `restify_path_duration` and `restify_path_count`.

## Grafana dashboard

A sample grafana dashboard can be found [here](https://grafana.net/dashboards/1485) .
