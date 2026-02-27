import * as dgram from 'dgram';
import { Logger } from './Logger';
import { Config } from '../config';
import * as os from 'os';

const DISCOVERY_PORT = 9999;
const DISCOVERY_REQUEST = "WHO_IS_GATEWAY?";
const DISCOVERY_RESPONSE_PREFIX = "I_AM_GATEWAY:";

export class DiscoveryListener {
    private server: dgram.Socket | null = null;
    private gatewayIP: string = "";
    private gatewayPort: string = "";
    private isRunning: boolean = false;

    constructor() {
        this.gatewayIP = this.getLocalIP();
        this.gatewayPort = Config.PORT.toString();
    }

    private getLocalIP(): string {
        const interfaces = os.networkInterfaces();
        const privateIPs: string[] = [];
        const publicIPs: string[] = [];
        
        for (const name of Object.keys(interfaces)) {
            const nets = interfaces[name];
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
                        Logger.info(`[Discovery] Found private IP: ${addr} on interface ${name}`);
                    } else {
                        publicIPs.push(addr);
                        Logger.info(`[Discovery] Found public/external IP: ${addr} on interface ${name}`);
                    }
                }
            }
        }
        
        if (privateIPs.length > 0) {
            const selectedIP = privateIPs[0];
            Logger.info(`[Discovery] Selected LAN IP: ${selectedIP} (from ${privateIPs.length} private IPs)`);
            return selectedIP;
        }
        
        if (publicIPs.length > 0) {
            const selectedIP = publicIPs[0];
            Logger.warn(`[Discovery] No private IP found, using public IP: ${selectedIP}`);
            return selectedIP;
        }
        
        Logger.warn(`[Discovery] No external IP found, using localhost`);
        return "127.0.0.1";
    }

    public start(): void {
        if (this.isRunning) {
            Logger.warn('[Discovery] UDP listener already running');
            return;
        }

        try {
            this.server = dgram.createSocket('udp4');
            
            this.server.on('message', (msg, rinfo) => {
                this.handleMessage(msg, rinfo);
            });
            
            this.server.on('error', (err) => {
                Logger.error(`[Discovery] UDP socket error: ${err.message}`);
                this.isRunning = false;
            });
            
            this.server.bind(DISCOVERY_PORT, () => {
                this.isRunning = true;
                Logger.info(`[Discovery] UDP listener started on port ${DISCOVERY_PORT}`);
                Logger.info(`[Discovery] Gateway will respond with: ${this.gatewayIP}:${this.gatewayPort}`);
            });
            
        } catch (error) {
            Logger.error(`[Discovery] Failed to start UDP listener: ${error}`);
            this.isRunning = false;
        }
    }

    private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
        const message = msg.toString().trim();
        Logger.info(`[Discovery] Received message from ${rinfo.address}:${rinfo.port} - "${message}"`);
        
        if (message === DISCOVERY_REQUEST) {
            const responseIP = this.getResponseIP(rinfo.address);
            const response = `${DISCOVERY_RESPONSE_PREFIX} ${responseIP}:${this.gatewayPort}`;
            
            Logger.info(`[Discovery] Agent at ${rinfo.address} requested Gateway - responding with ${responseIP}:${this.gatewayPort}`);
            
            this.server?.send(response, rinfo.port, rinfo.address, (err) => {
                if (err) {
                    Logger.error(`[Discovery] Failed to send response: ${err.message}`);
                } else {
                    Logger.info(`[Discovery] Responded to ${rinfo.address}:${rinfo.port} - Gateway at ${responseIP}:${this.gatewayPort}`);
                }
            });
        } else {
            Logger.warn(`[Discovery] Received unknown message: "${message}"`);
        }
    }

    private getResponseIP(requesterIP: string): string {
        const interfaces = os.networkInterfaces();
        const requesterParts = requesterIP.split('.');
        
        if (requesterParts.length === 4) {
            const isPrivate = requesterIP.startsWith('10.') || 
                             requesterIP.startsWith('192.168.') || 
                             requesterIP.startsWith('172.16.') || 
                             requesterIP.startsWith('172.17.') ||
                             requesterIP.startsWith('172.18.') ||
                             requesterIP.startsWith('172.19.') ||
                             requesterIP.startsWith('172.20.') ||
                             requesterIP.startsWith('172.21.') ||
                             requesterIP.startsWith('172.22.') ||
                             requesterIP.startsWith('172.23.') ||
                             requesterIP.startsWith('172.24.') ||
                             requesterIP.startsWith('172.25.') ||
                             requesterIP.startsWith('172.26.') ||
                             requesterIP.startsWith('172.27.') ||
                             requesterIP.startsWith('172.28.') ||
                             requesterIP.startsWith('172.29.') ||
                             requesterIP.startsWith('172.30.') ||
                             requesterIP.startsWith('172.31.');
            
            if (isPrivate) {
                const subnetPrefix = requesterParts.slice(0, 3).join('.');
                
                for (const name of Object.keys(interfaces)) {
                    const nets = interfaces[name];
                    if (!nets) continue;
                    
                    for (const net of nets) {
                        if (net.family === 'IPv4' && !net.internal && net.address) {
                            const gatewayParts = net.address.split('.');
                            if (gatewayParts.length === 4) {
                                const gatewaySubnet = gatewayParts.slice(0, 3).join('.');
                                if (gatewaySubnet === subnetPrefix) {
                                    Logger.info(`[Discovery] Found matching subnet IP: ${net.address} (same subnet as ${requesterIP})`);
                                    return net.address;
                                }
                            }
                        }
                    }
                }
                
                for (const name of Object.keys(interfaces)) {
                    const nets = interfaces[name];
                    if (!nets) continue;
                    
                    for (const net of nets) {
                        if (net.family === 'IPv4' && !net.internal && net.address) {
                            const addr = net.address;
                            if (addr.startsWith('10.') || addr.startsWith('192.168.') || addr.startsWith('172.')) {
                                Logger.info(`[Discovery] Using private IP: ${addr} (requester is in private network)`);
                                return addr;
                            }
                        }
                    }
                }
            }
        }
        
        Logger.info(`[Discovery] Using default gateway IP: ${this.gatewayIP}`);
        return this.gatewayIP;
    }

    public stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.isRunning = false;
            Logger.info(`[Discovery] UDP listener stopped`);
        }
    }

    public isActive(): boolean {
        return this.isRunning && this.server !== null;
    }

    public getGatewayIP(): string {
        return this.gatewayIP;
    }

    public getGatewayPort(): string {
        return this.gatewayPort;
    }
}
