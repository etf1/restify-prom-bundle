"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Debug = require("debug");
const debug = Debug('restify-prom-bundle');
class PathLimit {
    constructor(maxPaths) {
        if ((typeof maxPaths !== 'number') || maxPaths < 0) {
            throw new TypeError('`maxPathsToCount` option for restify-prom-bundle.middleware() must be >=0 number');
        }
        this.pathsLimit = maxPaths;
        this.pathsList = new Set();
    }
    registerPath(path) {
        if (!this.pathsLimit || this.pathsList.has(path)) {
            return true;
        }
        if (this.pathsList.size < this.pathsLimit) {
            debug('Registering %s', path);
            this.pathsList.add(path);
            return true;
        }
        debug('Cannot register %s', path);
        return false;
    }
}
exports.PathLimit = PathLimit;
