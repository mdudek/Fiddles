var https = require('https'),
    http = require('http'),
    util = require('util'),
    querystring = require('querystring'),
    fs = require('fs'),
    path = require('path'),
    colors = require('colors'),
    UAParser = require('ua-parser-js'),
    httpProxy = require('http-proxy'),
    httpsOpts = {
        key: fs.readFileSync(path.join(__dirname, 'certs', 'wgssl_dev.key')),
        cert: fs.readFileSync(path.join(__dirname, 'certs', 'wgssl_dev.crt'))
    },
    serverIP = {
        FH: '192.168.137.201',
        OC: '192.168.137.202',
        MD: '192.168.137.205',
        YH: '192.168.137.206'
    },
    clientIP = {
        '192.168.137.210': 'OC_PHONE_SGS2',
        '192.168.137.211': 'FH_PHONE_SGNote3',
        '192.168.137.212': 'MD_PHONE_SGS3',
        '192.168.137.213': 'OC_TABLET_APPLE_IPAD',
        '192.168.137.204': 'MD_TABLET_ACER_ANDROID'
    },
    proxyMappings = JSON.parse(fs.readFileSync(path.join(__dirname, 'proxymappings.json'))),
    uaparser = new UAParser(),
    proxyPort = 443,
    adminPagePort = 80,
    _proxyTmpPort = 3000;

//require('longjohn');


var getDeviceInfo = function (req) {
    uaparser.setUA(req.headers['user-agent']);
    var device = uaparser.getDevice();
    var deviceInfo = 'Unknown device';
    if (device.vendor || device.model) {
        deviceInfo = device.vendor ? device.vendor + ':' : '';
        deviceInfo += device.model;
    }
    return deviceInfo;
};

var getDefaultTargetName = function () {
    return Object.keys(serverIP)[0];
};


var getDefaultTargetHost = function () {
    return serverIP[getDefaultTargetName()];
};

var saveMappings = function () {
    fs.writeFileSync(path.join(__dirname, 'proxymappings.json'), JSON.stringify(proxyMappings));
};

var getDynamicClientId = function (req) {
    var remoteIP = req.connection.remoteAddress;
    return '#' + remoteIP + ' (' + getDeviceInfo(req) + ')';
};

var isDynamicClientId = function (clientId) {
    return clientId[0] == '#';
}

var getTargetHost = function (req) {
    var requestedHost = req.headers.host;
    var portIndex = requestedHost.indexOf(':');
    if (portIndex != -1) {
        requestedHost = requestedHost.substring(0, portIndex);
    }
    requestedHost = requestedHost.toLowerCase();
    var rootDomainIndex = requestedHost.lastIndexOf('.');
    var targetUrl;
    var remoteIP = req.connection.remoteAddress;
    var clientId = clientIP[remoteIP];
    if (clientId) {
        if (isDynamicClientId(clientId)) {
            // its device with dynamic IP addres -> update device info
            var currentClientId = getDynamicClientId(req);
            if (clientId != currentClientId) {
                console.log('Updated clientId (' + currentClientId + ') for IP address ' + remoteIP);
                delete proxyMappings[clientId];
                clientIP[remoteIP] = currentClientId;
                clientId = currentClientId;
            }
        }
        var serverId = proxyMappings[clientId];
        if (serverId) {
            var targetIP = serverIP[serverId];
            if (targetIP) {
                targetUrl = targetIP;
            }
            else {
                targetUrl = getDefaultTargetHost();
                console.log('Unknown server: ' + serverId + '. Using default target server:' + targetUrl);
            }
        }
        else {
            targetUrl = getDefaultTargetHost();
            console.log('Undefined route mapping for client: ' + clientId + '. Using default target server:' + targetUrl);
            var targetServerName = getDefaultTargetName();
            proxyMappings[clientId] = targetServerName;
            console.log('Set proxy mapping for ' + clientId + ' -> ' + targetServerName + '(' + serverIP[targetServerName] + ')');
            //saveMappings();
        }
    }
    else {
        targetUrl = getDefaultTargetHost();
        console.log('Unknown client IP: ' + remoteIP + '. Using default target server:' + targetUrl);
        clientIP[remoteIP] = getDynamicClientId(req);
    }
    var result = {
        host: requestedHost.substring(0, rootDomainIndex) + '.dev',
        url: targetUrl
    };
    return result;
}


//
// Create the proxy server listening on port _proxyTmpPort
//
var proxy = httpProxy.createServer({
    ssl: httpsOpts,
    secure: false
}).listen(_proxyTmpPort);

//
// Create the public server listening on port 'proxyPort'
//
https.createServer(
    httpsOpts,
    function (req, res) {
        var target = getTargetHost(req);
        if (checkControlDomain(req, res, 'http://' + target.host)) {
            console.log('Request from (' + getDeviceInfo(req) + ') IP: ' + req.connection.remoteAddress + ' for:' + target.host + req.url + ' redirected to target host:' + target.url);

            req.headers.host = target.host;
            var targetUrl = 'https://' + target.url;

            proxy.web(req, res, {
                target: targetUrl
            });
        }
    }
).listen(proxyPort);


var writePageContent = function (req, res) {
    res.write('<!DOCTYPE HTML><html>\n');
    res.write('<head><style>body{ font-family:Segoe UI, Arial } .headerRow > div{ background-color: #404040;color: #ffffff } .clientID {display: inline-block;width: 300px;background-color:#d0e0d0;margin: 2px;padding: 5px 10px} .clientID.temp {background-color:#e0e0e0;} .serverID {display: inline-block;width: 200px;background-color:#d0d0d0;margin: 2px;padding: 5px 10px}; </style>'
        + '<script type="text/javascript">' +
        'function postBack(){' +
        'document.adminForm.submit();}' +
        '</script>'
        + '</head>\n');
    res.write('<body>\n');
    res.write('<h1>WujiGrid Proxy Server Settings</h1>\n');
    res.write('<form id="adminForm" name="adminForm" method="post" action="">\n');
    res.write('<div class="headerRow"><div class="clientID">Client device</div><div class="serverID">Server</div></div>');

    for (var client in proxyMappings) {
        res.write('<div>');
        res.write('<div class="clientID' + (isDynamicClientId(client) ? ' temp' : '') + '">' + client + '</div>');
        //res.write('<div class="serverID">' + proxyMappings[client] + '</div>');
        var options = '';
        for (var serverName in serverIP) {
            options += '<option ' + (proxyMappings[client] == serverName ? 'selected' : '') + ' value="' + serverName + '">' + serverName + '</option>'
        }
        res.write('<div class="serverID"><Select id="' + client + '" name="' + client + '" onchange="postBack()">' + options + '</Select></div>');
        res.write('</div>\n');
    }
    ;
    res.write('</form>\n');
    res.write('</body>\n');

};

var checkControlDomain = function (req, res, redirectUrl) {
    // check if first part of domain name is the name of target server. In this case set mapping and redirect to the https://www.wujigrid.dev
    var reqDomain = req.headers.host.toUpperCase();
    var firstDomainPart = reqDomain.substring(0, reqDomain.indexOf('.'));
    if (serverIP[firstDomainPart]) {
        var remoteIP = req.connection.remoteAddress;
        var clientId = clientIP[remoteIP];
        if (!clientId) {
            clientId = 'Unknown host ' + remoteIP;
            clientIP[remoteIP] = clientId;
        }
        proxyMappings[clientId] = firstDomainPart;
        console.log('Set proxy mapping for ' + clientId + ' -> ' + firstDomainPart + '(' + serverIP[firstDomainPart] + ')');
        //saveMappings();
        res.writeHead(302, {
            'Location': redirectUrl
        });
        res.end();
        return false;
    }
    else {
        return true;
    }
};

//
// Create the proxy management server listening on port adminPagePort
//
http.createServer(function (req, res) {
    res.writeHead(200,
        {
            'Content-Type': 'text/html'
        });
    if (req.method == 'POST') {
        var chunk = '';
        req.on('data', function (data) {
            chunk += data;
        });
        req.on('end', function () {
            proxyMappings = querystring.parse(chunk);
            //saveMappings();
            writePageContent(req, res);
            res.end();
        });
    }
    else {
        if (checkControlDomain(req, res, 'https://www.wujigrid.dev')) {
            writePageContent(req, res);
            res.end();
        }
    }

}).listen(adminPagePort);

// handle ECONNRESET errors - TODO fix it correctly
process.on('uncaughtException', function (err) {
    console.error(err.stack);
    console.log("Node NOT Exiting...");
});


util.puts('https proxy server'.blue + ' started '.green.bold + 'on port '.blue + proxyPort.toString().yellow);
util.puts('https proxy management server '.blue + 'started '.green.bold + 'on port '.blue + adminPagePort.toString().yellow);
