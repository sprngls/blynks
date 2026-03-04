const http = require('http');
const fs = require('fs');
const path = require('path');

const getHtmlFileForPort = (port) => {

    if (port === 1045) {
        return 'index.html';
    }

    else {
        return 'no.html';
    }
};

const requestHandler = (req, res) => {
    const port = req.socket.localPort;
    
    if (req.url === '/' || req.url === '/index.html' || req.url === '/no.html') {
        const htmlFile = getHtmlFileForPort(port);
        const filePath = path.join(__dirname, htmlFile);
        
        fs.readFile(filePath, (err, content) => {
            if (err) {
                console.error(`Fehler beim Laden von ${htmlFile}:`, err);
                res.writeHead(500);
                res.end('Server Fehler');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            }
        });
    }
		else if (req.url === '/login') {
    const filePath = path.join(__dirname, 'login.html');
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            console.error(`Fehler beim Laden der Login-Seite:`, err);
            res.writeHead(500);
            res.end('Login-Seite nicht gefunden');
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        }
    });
}

		else if (req.url === '/impressum') {
    const filePath = path.join(__dirname, 'impressum.html');
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            console.error(`Fehler beim Laden der Impress:`, err);
            res.writeHead(500);
            res.end('Impress-Seite nicht gefunden');
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        }
    });
}
else if (req.url === '/app') {
    const filePath = path.join(__dirname, 'app.html');
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            console.error(`Fehler beim Laden der Demo App seite:`, err);
            res.writeHead(500);
            res.end('Demo-App-Seite nicht gefunden');
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        }
    });
}
    else if (req.url.endsWith('.png')) {
        const filename = path.basename(req.url);
        const filepath = path.join(__dirname, 'image', filename);

        fs.readFile(filepath, (err, content) => {
            if (err) {
                console.error(`Bild nicht gefunden: ${filename}`);
                res.writeHead(404);
                res.end('Bild nicht gefunden');
            } else {
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end(content);
            }
        });
    }
    else {
        res.writeHead(404);
        res.end('Nicht gefunden');
    }
};

console.log("Server werden gestartet...");


const server1 = http.createServer((req, res) => {
    req.socket.localPort = 1045;
    requestHandler(req, res);
});
server1.listen(1045, () => {
    console.log("Service gestartet für blynks.de");
});


const server2 = http.createServer((req, res) => {
    req.socket.localPort = 1046;
    requestHandler(req, res);
});
server2.listen(1046, () => {
    console.log("Service gestartet für blynks.online");
});


const server3 = http.createServer((req, res) => {
    req.socket.localPort = 1047;
    requestHandler(req, res);
});
server3.listen(1047, () => {
    console.log("Service gestartet für blynks.info");
});


const server4 = http.createServer((req, res) => {
    req.socket.localPort = 1048;
    requestHandler(req, res);
});
server4.listen(1048, () => {
    console.log("Service gestartet für blynks.store");
});


const servers = [server1, server2, server3, server4];
servers.forEach(server => {
    server.on('error', (err) => {
        console.error('Server Fehler:', err);
    });
});