"use strict";
// import http = require('http')
// import httpProxy = require('http-proxy')
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const http_proxy_1 = require("http-proxy");
// load env vars
const enableHttpsProxy = ((process.env.PROXY_AS_HTTPS || "0") === "1");
const allowedOriginRoot = process.env.ALLOWED_ORIGIN_ROOT || "*";
const enableLogging = ((process.env.ENABLE_LOGGING || "1") === "1");
const disableReproxy = ((process.env.DISABLE_REPROXY || "0") === "1");
const enableRedirect = ((process.env.ENABLE_REDIRECT || "0") === "1");
const proxyPort = process.env.PROXY_PORT || (enableHttpsProxy ? "443" : "80");
const perDomainRaw = process.env.PER_DOMAIN;
const protocol = enableHttpsProxy ? "https" : "http";
const port = process.env.PORT || "80";
const name = `simple-proxy-${port}`;
const requiresOrigin = allowedOriginRoot != "*";
const perDomain = {};
// logger
const log = function (mes, level = "info") {
    if (enableLogging) {
        if (level == "error") {
            console.error(mes);
        }
        {
            console.info(mes);
        }
    }
};
// parse per domain
const parseDomainSingle = function (domainTargetPort) {
    try {
        const [domain, targetPort] = domainTargetPort.split('@');
        let newProtocol, target, port;
        if (targetPort.split(':').length > 2) {
            [newProtocol, target, port] = targetPort.split(':');
        }
        else {
            newProtocol = protocol;
            [target, port] = targetPort.split(':');
        }
        perDomain[domain] = [newProtocol, target, port || proxyPort];
    }
    catch (err) {
        log(String(err), 'error');
    }
};
if (perDomainRaw != undefined) {
    perDomainRaw.split(',').forEach((s) => parseDomainSingle(s));
}
// proxy server
const proxy = (0, http_proxy_1.createProxyServer)({});
const handler = function (req, res) {
    // set host
    const host = req.headers.host;
    const fullTarget = `${protocol}://${host}${req.url}`;
    const targetHostname = (new URL(fullTarget)).hostname;
    // set target
    let target = `${protocol}://${targetHostname}:${proxyPort}`;
    Object.keys(perDomain).forEach((s) => {
        if (targetHostname.includes(s)) {
            const [t, h, p] = perDomain[s];
            target = `${t}://${targetHostname.replace(s, h)}:${p}`;
        }
    });
    // set origin
    const origin = req.headers.origin;
    const originHostname = req.headers.origin ? (new URL(req.headers.origin)).hostname : "";
    // if we previously proxied this result end it now
    if (disableReproxy && ("x-proxy-by" in req.headers)) {
        log(`RE_PROXY:: ${origin} -> ${target}`);
        res.writeHead(400, "ATTEMPT AT RE PROXY");
        res.end();
        return;
    }
    // redirect on same origin or origin required and was not provided
    if (enableRedirect && (originHostname == targetHostname)) {
        log(`REDIRECT:: ${origin} -> ${target}`);
        res.writeHead(302, {
            'Location': `${target}${req.url}`
        });
        res.end();
        return;
    }
    // cors
    if (allowedOriginRoot == "*" || originHostname.includes(allowedOriginRoot)) {
        // cors allowed
        const allowedHeaders = req.headers["access-control-request-headers"] || "";
        const allowedMethods = req.headers["access-control-request-method"] || ["GET", "POST", "PUT", "OPTIONS"].join(', ');
        res.setHeader('access-control-allow-methods', allowedMethods);
        if ('access-control-request-headers' in req.headers) {
            res.setHeader('access-control-allow-headers', allowedHeaders);
        }
        res.setHeader('Access-Control-Allow-Origin', origin || "*");
        res.setHeader('Access-Control-Allow-Credentials', "true");
        log(`CORS:: ${origin} -> ${target}`);
    }
    else {
        log(`NO_CORS:: ${origin} -> ${target}`);
    }
    // mark the request has having been proxied
    res.setHeader("x-proxy-by", name);
    proxy.web(req, res, {
        target: target
    });
};
// register function
const server = (0, http_1.createServer)((req, res) => {
    try {
        handler(req, res);
    }
    catch (error) {
        console.error(error);
    }
});
// health check server
const healthPort = (parseInt(port) + 1).toString();
const healthServer = (0, http_1.createServer)((req, res) => {
    res.writeHead(200);
    res.write("OK");
    res.end();
});
// launch servers
if (port == proxyPort) {
    throw "CANNOT PROXY ONTO LISTENING PORT";
}
server.listen(port);
healthServer.listen(healthPort);
log(`server started on ${port} health check on ${healthPort}`);
log(`proxied request will be made through protocol:${protocol} & port:${proxyPort}`);
log(`allowed origins:${allowedOriginRoot}, requests can ${requiresOrigin ? 'NOT ' : ''}omit origin`);
log('redirect domains:');
console.log(perDomain);
