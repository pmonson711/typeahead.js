/*
 * typeahead.js
 * https://github.com/twitter/typeahead
 * Copyright 2013 Twitter, Inc. and other contributors; Licensed MIT
 */

var Transport = (function() {
  var pendingRequestsCount = 0,
      pendingRequests = {},
      maxPendingRequests,
      requestCache;

  function Transport(o) {
    utils.bindAll(this);

    o = utils.isString(o) ? { url: o } : o;

    requestCache = requestCache || new RequestCache();

    // shared between all instances, last instance to set it wins
    maxPendingRequests = utils.isNumber(o.maxParallelRequests) ?
      o.maxParallelRequests : maxPendingRequests || 6;

    this.url = o.url;
    this.wildcard = o.wildcard || '%QUERY';
    this.filter = o.filter;
    this.replace = o.replace;
    this.requesting = false;

    this.ajaxSettings = $.extend({
      type: o.method || 'get',
      cache: o.cache,
      timeout: o.timeout,
      dataType: o.dataType || 'json',
      beforeSend: o.beforeSend
    }, o.ajaxSettings || {});

    this._get = (/^throttle$/i.test(o.rateLimitFn) ?
      utils.throttle : utils.debounce)(this._get, o.rateLimitWait || 300);
  }

  utils.mixin(Transport.prototype, {

    // private methods
    // ---------------

    _get: function(url, cb, query) {
      var that = this;

      // under the pending request threshold, so fire off a request
      if (belowPendingRequestsThreshold()) {
        this._sendRequest(url, query).done(done).always(that.ajaxSettings.then || $.noop);
      }

      // at the pending request threshold, so hang out in the on deck circle
      else {
        this.onDeckRequestArgs = [].slice.call(arguments, 0);
      }

      // success callback
      function done(resp) {
        var data = that.filter ? that.filter(resp, query) : resp;

        cb && cb(data);

        // cache the resp and not the results of applying filter
        // in case multiple datasets use the same url and
        // have different filters
        requestCache.set(that._cacheName(url, query), resp);
      }
    },

    _sendRequest: function(url, query) {
        var that = this, key = that._cacheName(url, query), jqXhr = pendingRequests[key], fetchData = {};
        if (!jqXhr) {
            incrementPendingRequests();
            if (this.ajaxSettings.type && this.ajaxSettings.type.toLowerCase() !== 'get') {
                fetchData[this.ajaxSettings.fetchAs || 'q'] = query;
                jqXhr = pendingRequests[key] = $.ajax(url, $.extend({}, this.ajaxSettings, {
                    data: fetchData
                })).always(always);
            } else {
                jqXhr = pendingRequests[key] = $.ajax(url, this.ajaxSettings).always(always);
            }
        }
        return jqXhr;
        function always() {
            that.requesting = false;
            decrementPendingRequests();
            pendingRequests[key] = null;
            if (that.onDeckRequestArgs) {
                that._get.apply(that, that.onDeckRequestArgs);
                that.onDeckRequestArgs = null;
            }
        }
    },

    _cacheName: function(url, query) {
        return [url,'~~',query].join('');
    },

    // public methods
    // --------------

    get: function(query, cb) {
      var that = this,
          encodedQuery = encodeURIComponent($.trim(query) || ''),
          url,
          resp;

      cb = cb || utils.noop;

      url = this.replace ?
        this.replace(this.url, encodedQuery) :
        this.url.replace(this.wildcard, encodedQuery);

      // in-memory cache hit
      if (resp = requestCache.get(that._cacheName(url, query))) {
        // defer to stay consistent with behavior of ajax call
        utils.defer(function() { cb(that.filter ? that.filter(resp) : resp); });
      }

      else {
        this.requesting = true;
        this._get(url, cb, query);
      }

      // return bool indicating whether or not a cache hit occurred
      return !!resp;
    },

    idle: function() {
        return !this.requesting && pendingRequestsCount === 0;
    }
  });

  return Transport;

  // static methods
  // --------------

  function incrementPendingRequests() {
    pendingRequestsCount++;
  }

  function decrementPendingRequests() {
    pendingRequestsCount--;
  }

  function belowPendingRequestsThreshold() {
    return pendingRequestsCount < maxPendingRequests;
  }
})();
