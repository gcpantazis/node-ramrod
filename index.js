'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var parseUrl = require('url').parse;
var parseQuerystring = require('querystring').parse;

var namedParam = /:\w+/g;
var escapeRegExp = /[-[\]{}()+?.,\\^$|#\s]/g;
var namespaced = /^[\w\/:]+\|(\w+)$/;

function Ramrod(routes) {
  this.routes = {};
  this.routeObjects = {};

  if (routes) {
    for (var path in routes) {
      if (routes.hasOwnProperty(path)) {

        if (util.isRegExp(routes[path])) {
          this.routes[path] = routes[path];

        } else if (typeof routes[path] === 'function') {
          this.add(path, routes[path]);

        } else {
          this.add(path);
        }
      }
    }
  }
}

util.inherits(Ramrod, EventEmitter);

Ramrod.prototype.add = function(route, name, callback) {
  if (!callback && typeof name === 'function') {
    callback = name;
  }
  if (!name || typeof name === 'function') {
    name = route;
  }
  if (!util.isRegExp(route)) {
    route = this._routeToRegExp(route);
  }
  if (callback) {
    this.on(name, callback);
  }

  this.routeObjects[name] = [];

  for (var i in name.match(namedParam)) {
    this.routeObjects[name].push(name.match(namedParam)[i].split(':')[1]);
  }

  this.routes[name] = route;
};

['get', 'post', 'put', 'del', 'options'].forEach(function(method) {
  var methodName = method === 'del' ? 'delete' : method;

  Ramrod.prototype[method] = function(route, name, callback) {
    if (!callback && typeof name === 'function') {
      callback = name;
    }
    if (!name || typeof name === 'function') {
      name = route;
    }
    if (!util.isRegExp(route)) {
      route = this._routeToRegExp(route);
    }
    if (callback) {
      this.on(name + '|' + methodName, callback);
    }
    this.routes[name + '|' + methodName] = route;
  };
});

Ramrod.prototype._routeToRegExp = function(route) {

  route = route.replace(escapeRegExp, '\\$&')
    .replace(namedParam, '([^\/]+)');

  return new RegExp('^\/' + route + '$');
};

function next() {}

var middleware = [];

Ramrod.prototype.use = function(cb) {
  middleware.push(cb);
};

Ramrod.prototype.dispatch = function(req, res) {
  var self = this;
  var params, routeMethod;
  var url = parseUrl(req.url);
  var method = req.method && req.method.toLowerCase();

  var runMiddleware = function(which) {
    middleware[which](req, res, function() {
      if (which === middleware.length - 1) {
        done();
      } else {
        runMiddleware(which + 1);
      }
    });
  };

  var done = function() {

    self.emit('before', req, res, next);

    for (var path in self.routes) {
      if ((params = self.routes[path].exec(url.pathname))) {
        var args = [path, req, res];

        routeMethod = namespaced.exec(path);

        params = params.slice(1);

        var output = {};

        output.path = {};

        for (var i in params) {
          output.path[self.routeObjects[path][i]] = params[i];
        }

        if (url.query) {
          output.query = parseQuerystring(url.query);
        }

        args = args.concat(output);

        if (routeMethod && routeMethod[1]) {
          if (routeMethod[1] === method) {
            return self.emit.apply(self, args);
          }
        } else {
          return self.emit.apply(self, args);
        }

      }
    }

    self.emit('*', req, res, next);

  };
  if (middleware.length > 0) {
    runMiddleware(0);
  } else {
    done();
  }

};

module.exports = function(routes) {
  return new Ramrod(routes);
};

module.exports.Ramrod = Ramrod;