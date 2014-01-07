/*
 proxy-https-to-https.js: Basic example of proxying over HTTPS to a target HTTPS server

 Copyright (c) Nodejitsu 2013

 Permission is hereby granted, free of charge, to any person obtaining
 a copy of this software and associated documentation files (the
 "Software"), to deal in the Software without restriction, including
 without limitation the rights to use, copy, modify, merge, publish,
 distribute, sublicense, and/or sell copies of the Software, and to
 permit persons to whom the Software is furnished to do so, subject to
 the following conditions:

 The above copyright notice and this permission notice shall be
 included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 */

var https = require('https'),
    http = require('http'),
    util = require('util'),
    querystring = require('querystring'),
    fs = require('fs'),
    path = require('path'),
    colors = require('colors'),
    httpProxy = require('http-proxy'),
    httpsOpts = {
        key: fs.readFileSync(path.join('certs', 'wgssl_dev.key')),
        cert: fs.readFileSync(path.join('certs', 'wgssl_dev.crt'))
    },
    serverIP = {
        FH: '192.168.137.201',
        OC: '192.168.137.202',
        MD: '192.168.137.203',
        YH: '192.168.137.204'
    },
    clientIP = {
        '192.168.137.210': 'OC_PHONE_SGS2',
        '192.168.137.211': 'FH_PHONE_SGNote3',
        '192.168.137.212': 'MD_PHONE_SGS3',
        '192.168.137.213': 'OC_TABLET_APPLE_IPAD',
        '192.168.137.214': 'MD_TABLET_ACER_ANDROID'
    },
    proxyMappings = JSON.parse(fs.readFileSync('proxymappings.json'));


var getTargetHost = function (req) {
    var requestedHost = req.headers.host;
    var portIndex = requestedHost.indexOf(':');
    if (portIndex != -1) {
        requestedHost = requestedHost.substring(0, portIndex);
    }
    requestedHost = requestedHost.toLowerCase();
    var rootDomainIndex = requestedHost.lastIndexOf('.');
    var targetUrl = requestedHost;
    var remoteIP = req.connection.remoteAddress;
    var clientId = clientIP[remoteIP];
    if (clientId) {
        var serverId = proxyMappings[clientId];
        if (serverId) {
            var targetIP = serverIP[serverId];
            if (targetIP) {
                targetUrl = targetIP;
            }
            else {
                console.log('Unknown server: ' + serverId);
            }
        }
        else {
            console.log('Undefined route mapping for client: ' + clientId);
        }
    }
    else {
        console.log('Unknown client ip: ' + remoteIP);
    }
    var result = {
        host: requestedHost.substring(0, rootDomainIndex) + '.dev',
        url: targetUrl
    };
    return result;
}


//
// Create the proxy server listening on port 443
//
var proxy = httpProxy.createServer({
    ssl: httpsOpts,
    secure: false
}).listen(8010);

//
// Create the public server listening on port 8001
//
https.createServer(
    httpsOpts,
    function (req, res) {
        var target = getTargetHost(req);
        console.log('Request from ip: ' + req.connection.remoteAddress + ' for:' + req.url + ' redirected to target url:' + target.url);
        req.headers.host = target.host;
        var targetUrl = 'https://' + target.url;
        proxy.web(req, res, {
            target: targetUrl
        });
    }
).listen(8001);


var writePageContent = function(req, res) {
    res.write('<!DOCTYPE HTML><html>\n');
    res.write('<head><style>body{ font-family:Segoe UI, Arial } .headerRow > div{ background-color: #404040;color: #ffffff } .clientID {display: inline-block;width: 300px;background-color:#e0e0e0;margin: 2px;padding: 5px 10px} .serverID {display: inline-block;width: 200px;background-color:#d0d0d0;margin: 2px;padding: 5px 10px}; </style>'
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
        res.write('<div class="clientID">' + client + '</div>');
        res.write('<div class="serverID">' + proxyMappings[client] + '</div>');
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

//
// Create the proxy management server listening on port 88
//
http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    if (req.method == 'POST') {
        var chunk = '';
        req.on('data', function (data) {
            chunk += data;
        });
        req.on('end', function () {
            proxyMappings = querystring.parse(chunk);
            fs.writeFileSync('proxymappings.json', JSON.stringify(proxyMappings));
            writePageContent(req,  res);
            res.end();
        });
    }
    else {
        writePageContent(req,  res);
        res.end();
    }

}).listen(9010);


util.puts('https proxy server'.blue + ' started '.green.bold + 'on port '.blue + '8001'.yellow);
util.puts('https proxy management server '.blue + 'started '.green.bold + 'on port '.blue + '9010 '.yellow);
