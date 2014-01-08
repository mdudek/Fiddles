var Service = require('node-windows').Service,
    path = require('path');


// Create a new service object
var svc = new Service({
    name:'WujiGrid development proxy',
    script: path.join(__dirname, 'wujigrid-proxy.js')
});

// Listen for the "uninstall" event so we know when it's done.
svc.on('uninstall',function(){
    console.log('Uninstall complete.');
    console.log('The service exists: ',svc.exists);
});

svc.uninstall();