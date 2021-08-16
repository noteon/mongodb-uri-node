/*
 * Copyright (c) 2013 ObjectLabs Corporation
 * Distributed under the MIT license - http://opensource.org/licenses/MIT
 */

/**
 * Creates a parser.
 *
 * @param {Object=} options
 * @constructor
 */
function MongodbUriParser(options) {
    if (options && options.scheme) {
        this.scheme = options.scheme;
    }
}

// Known string options, only used to bypass Number coercion in `parseQueryStringItemValue`
const STRING_OPTIONS = new Set(['authsource', 'replicaset']);

/**
 * Parses a query string item according to the connection string spec
 *
 * @param {string} key The key for the parsed value
 * @param {Array|String} value The value to parse
 * @return {Array|Object|String} The parsed value
 */
 function parseQueryStringItemValue(key, value) {
    if (Array.isArray(value)) {
      // deduplicate and simplify arrays
      value = value.filter((v, idx) => value.indexOf(v) === idx);
      if (value.length === 1) value = value[0];
    } else if (value.indexOf(':') > 0) {
      value = value.split(',').reduce((result, pair) => {
        const parts = pair.split(':');
        result[parts[0]] = parseQueryStringItemValue(key, parts[1]);
        return result;
      }, {});
    } else if (value.indexOf(',') > 0) {
      value = value.split(',').map(v => {
        return parseQueryStringItemValue(key, v);
      });
    } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
      value = value.toLowerCase() === 'true';
    } else if (!Number.isNaN(value) && !STRING_OPTIONS.has(key)) {
      const numericValue = parseFloat(value);
      if (!Number.isNaN(numericValue)) {
        value = parseFloat(value);
      }
    }
  
    return value;
  }
  

// Lookup table used to translate normalized (lower-cased) forms of connection string
// options to their expected camelCase version
const CASE_TRANSLATION = {
    replicaset: 'replicaSet',
    connecttimeoutms: 'connectTimeoutMS',
    sockettimeoutms: 'socketTimeoutMS',
    maxpoolsize: 'maxPoolSize',
    minpoolsize: 'minPoolSize',
    maxidletimems: 'maxIdleTimeMS',
    waitqueuemultiple: 'waitQueueMultiple',
    waitqueuetimeoutms: 'waitQueueTimeoutMS',
    wtimeoutms: 'wtimeoutMS',
    readconcern: 'readConcern',
    readconcernlevel: 'readConcernLevel',
    readpreference: 'readPreference',
    maxstalenessseconds: 'maxStalenessSeconds',
    readpreferencetags: 'readPreferenceTags',
    authsource: 'authSource',
    authmechanism: 'authMechanism',
    authmechanismproperties: 'authMechanismProperties',
    gssapiservicename: 'gssapiServiceName',
    localthresholdms: 'localThresholdMS',
    serverselectiontimeoutms: 'serverSelectionTimeoutMS',
    serverselectiontryonce: 'serverSelectionTryOnce',
    heartbeatfrequencyms: 'heartbeatFrequencyMS',
    retrywrites: 'retryWrites',
    uuidrepresentation: 'uuidRepresentation',
    zlibcompressionlevel: 'zlibCompressionLevel',
    tlsallowinvalidcertificates: 'tlsAllowInvalidCertificates',
    tlsallowinvalidhostnames: 'tlsAllowInvalidHostnames',
    tlsinsecure: 'tlsInsecure',
    tlscafile: 'tlsCAFile',
    tlscertificatekeyfile: 'tlsCertificateKeyFile',
    tlscertificatekeyfilepassword: 'tlsCertificateKeyFilePassword',
    wtimeout: 'wTimeoutMS',
    j: 'journal',
    directconnection: 'directConnection'
  };
  

/**
 * Takes a URI of the form:
 *
 *   mongodb://[username[:password]@]host1[:port1][,host2[:port2],...[,hostN[:portN]]][/[database]][?options]
 *
 * and returns an object of the form:
 *
 *   {
 *     scheme: !String,
 *     username: String=,
 *     password: String=,
 *     hosts: [ { host: !String, port: Number= }, ... ],
 *     database: String=,
 *     options: Object=
 *   }
 *
 * scheme and hosts will always be present. Other fields will only be present in the result if they were
 * present in the input.
 *
 * @param {!String} uri
 * @return {Object}
 */
 MongodbUriParser.prototype.parse = function parse(uri) {

    var uriObject = {};

    var i = uri.indexOf('://');
    if (i < 0) {
        throw new Error('No scheme found in URI ' + uri);
    }
    uriObject.scheme = uri.substring(0, i);
    if (this.scheme && this.scheme !== uriObject.scheme) {
        throw new Error('URI must begin with ' + this.scheme + '://');
    }
    var rest = uri.substring(i + 3);

    i = rest.indexOf('@');
    if (i >= 0) {
        var credentials = rest.substring(0, i);
        rest = rest.substring(i + 1);
        i = credentials.indexOf(':');
        if (i >= 0) {
            uriObject.username = decodeURIComponent(credentials.substring(0, i));
            uriObject.password = decodeURIComponent(credentials.substring(i + 1));
        } else {
            uriObject.username = decodeURIComponent(credentials);
        }
    }

    i = rest.indexOf('?');
    if (i >= 0) {
        var options = rest.substring(i + 1);
        rest = rest.substring(0, i);
        uriObject.options = {};
        options.split('&').forEach(function (o) {
            var iEquals = o.indexOf('=');
            var key=decodeURIComponent(o.substring(0, iEquals));
            var lowerK=key.toLowerCase();
            var value=decodeURIComponent(o.substring(iEquals + 1));

            //var parsedValue=parseQueryStringItemValue(lowerK,value);
            var parsedValue=value;

            if (lowerK==="readpreferencetags"){
                var tags=uriObject.options[CASE_TRANSLATION[lowerK]] || [];
                uriObject.options[CASE_TRANSLATION[lowerK]]= tags;


                uriObject.options[CASE_TRANSLATION[lowerK]].push( parsedValue || "");
            }else{
                uriObject.options[CASE_TRANSLATION[lowerK] || key] = parsedValue;
            }

        });
    }

    i = rest.indexOf('/');
    if (i >= 0) {
        // Make sure the database name isn't the empty string
        if (i < rest.length - 1) {
            uriObject.database = decodeURIComponent(rest.substring(i + 1));
        }
        rest = rest.substring(0, i);
    }

    this._parseAddress(rest, uriObject);

    return uriObject;

};
/**
 * Parses the address into the uriObject, mutating it.
 *
 * @param {!String} address
 * @param {!Object} uriObject
 * @private
 */
MongodbUriParser.prototype._parseAddress = function _parseAddress(address, uriObject) {
    uriObject.hosts = [];
    address.split(',').forEach(function (h) {
        //by qinghai, support ipv6 address
        //console.log("parseAddress",h);
        // var url=require("url");
        // var parseRst=url.parse('http://'+h);
        // console.log(parseRst);
        // var rst={host: parseRst.host};
        // if (parseRst.port){
        //     rst.port=parseRst.port;
        // }

        //uriObject.hosts.push(rst);
        var i=(()=>{
            if (h[h.length-1] ==="]"){//empty ipv6
                return;
            }
    
            return h.lastIndexOf(':');
        })();

        if (i >= 0) {
            uriObject.hosts.push(
                    {
                        host: decodeURIComponent(h.substring(0, i)),
                        port: parseInt(h.substring(i + 1))
                    }
            );
        } else {
            uriObject.hosts.push({ host: decodeURIComponent(h) });
        }
    });
};

function formatValue(value){
    if (Array.isArray(value)){
        return value.map(function(e){return formatValue(e)}).join(",")
    }else   if (typeof value==="object"){
        return Object.keys(value).reduce(function (memo, e,idx){
            memo+=((idx===0)?"":",")+ `${e}:${formatValue(value[e])}`

            return memo;
        },"")

    }else{
        return  value;
    }
}


function isEmpty(obj) {
    return Object.keys(obj).length === 0;
}
/**
 * Takes a URI object and returns a URI string of the form:
 *
 *   mongodb://[username[:password]@]host1[:port1][,host2[:port2],...[,hostN[:portN]]][/[database]][?options]
 *
 * @param {Object=} uriObject
 * @return {String}
 */
MongodbUriParser.prototype.format = function format(uriObject) {

    if (!uriObject) {
        return (this.scheme || 'mongodb') + '://localhost';
    }

    if (this.scheme && uriObject.scheme && this.scheme !== uriObject.scheme) {
        throw new Error('Scheme not supported: ' + uriObject.scheme);
    }
    var uri = (this.scheme || uriObject.scheme || 'mongodb') + '://';

    if (uriObject.username) {
        uri += encodeURIComponent(uriObject.username);
        // While it's not to the official spec, we allow empty passwords
        if (uriObject.password) {
            uri += ':' + encodeURIComponent(uriObject.password);
        }
        uri += '@';
    }

    uri += this._formatAddress(uriObject);

    // While it's not to the official spec, we only put a slash if there's a database, independent of whether there are options
    if (uriObject.database) {
        uri += '/' + encodeURIComponent(uriObject.database);
    }



    if (uriObject.options) {
        Object.keys(uriObject.options).forEach(function (k, i) {
            uri += i === 0 ? '?' : '&';

            if ((k==="readPreferenceTags") && Array.isArray(uriObject.options[k])){
                uri+=(uriObject.options[k].map(function(tags){
                    if (isEmpty(tags)){
                        return k + "="
                    }else{
                        return k + "="+ encodeURIComponent(formatValue(tags));
                    }
                }).join("&"));
            }else{
                uri += encodeURIComponent(k) + '=' + encodeURIComponent(formatValue(uriObject.options[k]));
            }
        });
    }

    return uri;

};

/**
 * Formats the address portion of the uriObject, returning it.
 *
 * @param {!Object} uriObject
 * @return {String}
 * @private
 */
MongodbUriParser.prototype._formatAddress = function _formatAddress(uriObject) {
    var address = '';
    uriObject.hosts.forEach(function (h, i) {
        if (i > 0) {
            address += ',';
        }
        if (['[',':'].indexOf(h.host[0])>-1){ //ipv6
            address += h.host;
        }else{
            address += encodeURIComponent(h.host);
        }

        

        if (h.port) {
            address += ':' + encodeURIComponent(h.port);
        }
    });
    return address;
};

/**
 * Takes either a URI object or string and returns a Mongoose connection string. Specifically, instead of listing all
 * hosts and ports in a single URI, a Mongoose connection string contains a list of URIs each with a single host and
 * port pair.
 *
 * Useful in environments where a MongoDB URI environment variable is provided, but needs to be programmatically
 * transformed into a string digestible by mongoose.connect()--for example, when deploying to a PaaS like Heroku
 * using a MongoDB add-on like MongoLab.
 *
 * @param {!Object|String} uri
 * @return {String}
 */
MongodbUriParser.prototype.formatMongoose = function formatMongoose(uri) {
    var parser = this;
    if (typeof uri === 'string') {
        uri = parser.parse(uri);
    }
    if (!uri) {
        return parser.format(uri);
    }
    var connectionString = '';
    uri.hosts.forEach(function (h, i) {
        if (i > 0) {
            connectionString += ',';
        }
        // This trick is okay because format() never dynamically inspects the keys in its argument
        var singleUriObject = Object.create(uri);
        singleUriObject.hosts = [ h ];
        connectionString += parser.format(singleUriObject);
    });
    return connectionString;
};

exports.MongodbUriParser = MongodbUriParser;

var defaultParser = new MongodbUriParser();
[ 'parse', 'format', 'formatMongoose' ].forEach(function (f) {
    exports[f] = defaultParser[f].bind(defaultParser);
});
