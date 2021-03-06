const async = require('async');
const assert = require('chai').assert;
const request = require('supertest');
const express = require('express');
const ExpressCache = require('../index.js');
const Cacher = new ExpressCache({ ttl: 50 });

const app = express();
const agent = request.agent(app);

function runsequence(routePattern, expectSkip, route, options, test, done) {

    // wrap the route to count the number of times it's executed
    let executions = 0;
    app.get(routePattern, Cacher.middleware(options), function(
        req,
        res,
        next
    ) {
        executions++;
        route(req, res, next);
    });

    // execute tests against the route
    function executeTest(delay, expectedExecutions, callback) {
        setTimeout(function() {
            let _agent = agent.get(routePattern);
            test(_agent);
            _agent.end(function(err) {
                if (err) return callback(err);
                if (!expectSkip) assert.equal(executions, expectedExecutions);
                callback();
            });
        }, delay);
    }
    async.parallel(
        [
            function(callback) {
                executeTest(0, 1, callback);
            },
            function(callback) {
                executeTest(0, 1, callback);
            },
            function(callback) {
                executeTest(0, 1, callback);
            },
            function(callback) {
                executeTest(100, 2, callback);
            }
        ],
        function(err) {
            if (err) throw err;
            if (expectSkip) assert.equal(executions, 4);
            done();
        }
    );
}

describe('express-lru middleware', function() {
    describe('res.json()', function() {
        it('should work normally', function(done) {
            const route = function(req, res, next) {
                res.json({ hello: 'world' });
            };
            runsequence(
                '/route1',
                false,
                route,
                {},
                function(agent) {
                    agent
                        .expect('Content-Type', /application\/json/)
                        .expect('{"hello":"world"}')
                        .expect(200);
                },
                done
            );
        });
    });
    describe('res.send()', function() {
        it('should work normally', function(done) {
            const route = function(req, res, next) {
                res.set({ 'Content-Type': 'text/test' }).send('the content');
            };
            runsequence(
                '/route2',
                false,
                route,
                {},
                function(agent) {
                    agent
                        .expect('Content-Type', /text\/test/)
                        .expect('the content')
                        .expect(200);
                },
                done
            );
        });
        it('should work normally with Buffer', function(done) {
            const route = function(req, res, next) {
                res.set({ 'Content-Type': 'text/test' }).send(
                    new Buffer('hello')
                );
            };
            runsequence(
                '/route3',
                false,
                route,
                {},
                function(agent) {
                    agent
                        .expect('Content-Type', /text\/test/)
                        .expect('hello')
                        .expect(200);
                },
                done
            );
        });
        it('should work normally with json', function(done) {
            const route = function(req, res, next) {
                res.set({ 'Content-Type': 'text/test' }).send({ a: 'b' });
            };
            runsequence(
                '/route4',
                false,
                route,
                {},
                function(agent) {
                    agent
                        .expect('Content-Type', /text\/test/)
                        .expect('{"a":"b"}')
                        .expect(200);
                },
                done
            );
        });
    });

    it('should not cache non-200 responses', function(done) {
        const route = function(req, res, next) {
            res.set({ 'Content-Type': 'text/plain' })
                .status(500)
                .send('the content');
        };
        runsequence(
            '/route5',
            true,
            route,
            {},
            function(agent) {
                agent
                    .expect('Content-Type', /text\/plain/)
                    .expect('the content')
                    .expect(500);
            },
            done
        );
    });

    it('should acknowledge "skip" option', function(done) {
        const route = function(req, res, next) {
            res.set({ 'Content-Type': 'text/test' }).send('the content');
        };
        const skip = function(req) {
            return true;
        };
        runsequence(
            '/route6',
            true,
            route,
            { skip: skip },
            function(agent) {
                agent
                    .expect('Content-Type', /text\/test/)
                    .expect('the content')
                    .expect(200);
            },
            done
        );
    });
});
