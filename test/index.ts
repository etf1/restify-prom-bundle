/**
 * Bundle general tests.
 */

const bundle: any = require('../built/map/index');

import {expect} from 'chai';
import * as client from 'prom-client';
import * as promClient from 'prom-client';
import * as restify from 'restify';

describe('API', () => {

  it('should export a preMiddleware() function', () => {
    expect(bundle.preMiddleware).to.be.a('function');
  });

  it('preMiddleware() should require valid arguments', () => {
    const callPreMiddleware = (...args: any[]) => () => { promClient.register.clear(); bundle.preMiddleware.apply(null, args); };
    const server: restify.Server = restify.createServer();
    const error1: string = 'restify-prom-bundle.middleware() must take a restify server instance as first argument';
    const error2: string = 'Invalid second argument for restify-prom-bundle.middleware()';

    expect(callPreMiddleware()).to.throw(error1);
    expect(callPreMiddleware(1)).to.throw(error1);
    expect(callPreMiddleware({})).to.throw(error1);
    expect(callPreMiddleware(server, 1)).to.throw(error2);

    expect(callPreMiddleware(server)).to.not.throw();
  });

  it('should export a prom-client instance as `client`', () => {
    expect(bundle).to.have.property('client');
    expect(bundle.client).to.have.property('register');
    expect(bundle.client).to.have.property('Counter');
    expect(bundle.client).to.have.property('Gauge');
    expect(bundle.client).to.have.property('Histogram');
    expect(bundle.client).to.have.property('Summary');
  });
});
