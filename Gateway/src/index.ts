console.log("=== STARTING GATEWAY ===")
import { GatewayServer } from "./core/Server";
import { Config } from "./config";
import { Logger } from "./utils/Logger";
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as os from 'os';
import { getDirname } from './utils/getDirname';

const baseDir = getDirname();

try {
    const certPath = path.join(baseDir, 'server.cert');
    const keyPath = path.join(baseDir, 'server.key');

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        Logger.error("Khong tim thay file 'server.cert' hoac 'server.key'!");
        Logger.error(`Vui long copy 2 file nay vao cung thu muc voi file exe: ${__dirname}`);
        Logger.error("Hoac su dung script generate-cert de tao certificates tu dong.");
        process.exit(1);
    }

    const sslOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };

    const httpsServer = https.createServer(sslOptions);
    
    const networkInterfaces = os.networkInterfaces();
    let gatewayIP = 'localhost';
    const privateIPs: string[] = [];
    const publicIPs: string[] = [];
    
    for (const name of Object.keys(networkInterfaces || {})) {
        const nets = networkInterfaces![name];
        if (!nets) continue;
    
        for (const net of nets) {
            if (net.family === 'IPv4' && !net.internal && net.address) {
                const addr = net.address;
                if (addr.startsWith('10.') || 
                    addr.startsWith('192.168.') || 
                    (addr.startsWith('172.') && 
                     parseInt(addr.split('.')[1]) >= 16 && 
                     parseInt(addr.split('.')[1]) <= 31)) {
                    privateIPs.push(addr);
                    Logger.info(`[Gateway] Found private IP: ${addr} on interface ${name}`);
                } else {
                    publicIPs.push(addr);
                    Logger.info(`[Gateway] Found public/external IP: ${addr} on interface ${name}`);
                }
            }
        }
    }
    
    if (privateIPs.length > 0) {
        gatewayIP = privateIPs[0];
        Logger.info(`[Gateway] Selected LAN IP: ${gatewayIP} (from ${privateIPs.length} private IPs)`);
    } else if (publicIPs.length > 0) {
        gatewayIP = publicIPs[0];
        Logger.warn(`[Gateway] No private IP found, using public IP: ${gatewayIP}`);
    }

    const gateway = new GatewayServer(httpsServer);
    
    httpsServer.listen(Config.PORT, '0.0.0.0', () => {
        Logger.info(`Gateway WSS Server listening on port ${Config.PORT}`);
        Logger.info(`Local:   https://localhost:${Config.PORT}`);
        Logger.info(`Network: https://${gatewayIP}:${Config.PORT}`);
        Logger.info(`Website: https://${gatewayIP}:${Config.PORT}`);
    });
    
    gateway.start();
} catch (error) {
    Logger.error(`Failed to start Gateway: ${error}`);
    process.exit(1);
}
