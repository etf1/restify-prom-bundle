/**
 * Restify prometheus middleware to expose HTTP metrics.
 */

import * as client from 'prom-client';

import {IPreMiddlewareConfig, preMiddleware} from './preMiddleware';

/**
 * Exports.
 */
export {
  IPreMiddlewareConfig,
  client,
  preMiddleware,
};
