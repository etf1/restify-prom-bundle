"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client = require("prom-client");
exports.exposeRoute = (path) => (req, res, next) => {
    if (req.path() === path) {
        res.status(200);
        res.header('Content-Type', 'text/plain');
        res.end(client.register.metrics());
        return;
    }
    next();
};
