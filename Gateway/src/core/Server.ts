import { WebSocket, WebSocketServer } from "ws";
import { AgentManager } from "../managers/AgentManager";
import { ClientManager } from "../managers/ClientManager";
import { DatabaseManager } from "../managers/DatabaseManager";
import { ConnectionRegistry } from "../managers/ConnectionRegistry";
import { RouteHandler } from "../handlers/RouteHandlers";
import { Connection } from "./Connection";
import { Message, createMessage } from "../types/Message";
import { CommandType } from "../types/Protocols";
import { Logger } from "../utils/Logger";
import { DiscoveryListener } from "../utils/DiscoveryListener";
import { Config } from "../config";
import * as https from 'https'
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { getDirname } from '../utils/getDirname'

export class GatewayServer {
    private wss: WebSocketServer;
    private wssInsecure: WebSocketServer | null = null;
    private httpServer: http.Server | null = null;
    private agentManager: AgentManager;
    private clientManager: ClientManager;
    private dbManager: DatabaseManager;
    private connectionRegistry: ConnectionRegistry;
    private router: RouteHandler;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private connectionCounter: number = 1;
    private dashboardServer: http.Server | null = null;
    private ingestServer: http.Server | null = null;
    private discoveryListener: DiscoveryListener;

    constructor(server: https.Server) {
        this.dbManager = new DatabaseManager();
        this.connectionRegistry = new ConnectionRegistry(this.dbManager);
        
        this.agentManager = new AgentManager(this.dbManager, this.connectionRegistry);
        this.clientManager = new ClientManager(this.dbManager, this.connectionRegistry);
        this.router = new RouteHandler(
            this.agentManager, 
            this.clientManager,
            this.connectionRegistry,
            this.dbManager
        );
        this.wss = new WebSocketServer({ server });
        this.setUpHTTPSStaticServing(server);
        this.discoveryListener = new DiscoveryListener();

        Logger.info(`GatewayServer initialized WSS mode with database and connection registry`);
    }

    private setUpHTTPSStaticServing(httpServer: https.Server) {
        httpServer.on('request', (req, res) => {
            if (req.headers.upgrade === 'websocket') {
                return;
            }

            const rootPath = getDirname();

            const url = new URL(req.url || '/', `https://${req.headers.host}`);
            let websitePath = (process as any).pkg
                ? path.join(__dirname, '../../Website')
                : path.join(rootPath, 'Website');
            if (!fs.existsSync(websitePath)) {
                websitePath = path.join(__dirname, '../../Website');
                console.log(`[Warning] Website folder not found. Checked:${websitePath}`);
            }
            
            let requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
            
            let filePath = path.join(websitePath, requestedPath);
             
            filePath = path.normalize(filePath);
            if (!filePath.startsWith(path.normalize(websitePath))) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            fs.stat(filePath, (err, stats) => {
                if (err) {
                    if (url.pathname === '/' || url.pathname.endsWith('/')) {
                        filePath = path.join(websitePath, 'index.html');
                    } else {
                        res.writeHead(404);
                        res.end('Not Found');
                        return;
                    }
                } else if (!stats.isFile()) {
                    filePath = path.join(filePath, 'index.html');
                }

                fs.readFile(filePath, (err, data) => {
                    if (err) {
                        res.writeHead(404);
                        res.end('Not Found');
                        return;
                    }

                    const ext = path.extname(filePath).toLowerCase();
                    const contentTypes: { [key: string]: string } = {
                        '.html': 'text/html',
                        '.js': 'application/javascript',
                        '.css': 'text/css',
                        '.json': 'application/json',
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.gif': 'image/gif',
                        '.svg': 'image/svg+xml',
                        '.ico': 'image/x-icon'
                    };
                    const contentType = contentTypes[ext] || 'application/octet-stream';

                    res.writeHead(200, {
                        'Content-Type': contentType,
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(data);
                });
            });
        });
    }

    public start() {
        this.wss.on('connection', (ws: WebSocket, req) => {
            const ip = req.socket.remoteAddress || "unknown";
            const port = req.socket.remotePort || 0;
            const sessionId = `CONN-${this.connectionCounter++}`;
            ws.id = sessionId;
            Logger.info(`New connection from IP: ${ip}:${port} (Session: ${sessionId})`);

            ws.isAlive = true;
            
            const autoAuthTimer = setTimeout(() => {
                if (!ws.role) {
                    //this.autoAuthenticateAgent(ws, sessionId, ip, port);
                    Logger.debug(`[Server] No message received after 1s, waiting for AUTH message from client`);
                }
            }, 1000);

            ws.on('message', (data, isBinary) => {
                this.handleMessage(ws, data, isBinary);
            });

            ws.on('pong', () => { ws.isAlive = true; });
            ws.on('error', (err) => Logger.error(`Socket error: ${err.message}`));
            ws.on('close', (code, reason) => this.handleClose(ws));
        });

        this.startHeartbeat();
        this.startDashboard();
        this.startInsecureServer();
        this.startIngestServer();
        this.discoveryListener.start();

        process.on('SIGINT', this.shutdown.bind(this));
        process.on('SIGTERM', this.shutdown.bind(this));
    }

    private startInsecureServer() {
        try {
            this.httpServer = http.createServer();
            this.wssInsecure = new WebSocketServer({ server: this.httpServer });
            
            this.wssInsecure.on('connection', (ws: WebSocket, req) => {
                const ip = req.socket.remoteAddress || "unknown";
                const port = req.socket.remotePort || 0;
                const sessionId = `CONN-${this.connectionCounter++}`;
                ws.id = sessionId;
                Logger.info(`New INSECURE connection from IP: ${ip}:${port} (Session: ${sessionId})`);

                ws.isAlive = true;
                
                const autoAuthTimer = setTimeout(() => {
                    if (!ws.role) {
                        Logger.info(`[Server] Auto-authenticating INSECURE connection ${sessionId} as AGENT (no message received)`);
                        this.autoAuthenticateAgent(ws, sessionId, ip);
                    }
                }, 1000);

                ws.on('message', (data) => {
                    clearTimeout(autoAuthTimer);
                    const dataLength = Buffer.isBuffer(data) ? data.length : (data as ArrayBuffer).byteLength || 0;
                    Logger.info(`[Server] Received message from INSECURE connection ${sessionId}, length: ${dataLength}`);
                    this.handleMessage(ws, data);
                });

                ws.on('pong', () => {
                    ws.isAlive = true;
                });

                ws.on('error', (err) => Logger.error(`Socket error: ${err.message}`));

                ws.on('close', (code, reason) => {
                    clearTimeout(autoAuthTimer);
                    const wasAuthenticated = ws.role ? 'authenticated' : 'unauthenticated';
                    const connectionInfo = ws.id ? `(ID: ${ws.id}, Machine: ${(ws as any).machineId || 'unknown'})` : '';
                    Logger.info(`[Server] INSECURE connection ${sessionId} closed. Code: ${code}, Reason: ${reason?.toString() || 'none'}, Role: ${ws.role || 'unauthenticated'}, Status: ${wasAuthenticated} ${connectionInfo}`);
                    Logger.debug(`[Server] Connection state before close: readyState=${ws.readyState}, isAlive=${ws.isAlive}`);
                    this.handleClose(ws);
                });
            });

            const insecurePort = Config.PORT + 2;
            this.httpServer.listen(insecurePort, '0.0.0.0', () => {
                Logger.info(`Gateway WS (insecure) Server listening on port ${insecurePort}`);
                Logger.info(`Local:   http://localhost:${insecurePort}`);
            });
        } catch (error) {
            Logger.error(`Failed to start insecure HTTP server: ${error}`);
        }
    }

    private startDashboard() {
        const dashboardPort = parseInt(process.env.DASHBOARD_PORT || '8081');
        this.dashboardServer = http.createServer((req, res) => {
            const url = new URL(req.url || '/', `http://${req.headers.host}`);
            
            if (url.pathname === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'ok',
                    uptime: process.uptime(),
                    connections: {
                        agents: this.connectionRegistry.getConnectionCount('AGENT'),
                        clients: this.connectionRegistry.getConnectionCount('CLIENT')
                    },
                    memory: process.memoryUsage(),
                    timestamp: Date.now()
                }));
                return;
            }

            if (url.pathname === '/stats') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    connections: {
                        total: this.connectionRegistry.getConnectionCount(),
                        agents: this.connectionRegistry.getConnectionCount('AGENT'),
                        clients: this.connectionRegistry.getConnectionCount('CLIENT')
                    }
                }));
                return;
            }

            if (url.pathname === '/api/discover' && req.method === 'GET') {
                const gatewayIP = this.discoveryListener ? this.discoveryListener.getGatewayIP() : '';
                const gatewayPort = Config.PORT;
                
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                });
                res.end(JSON.stringify({
                    success: true,
                    gateway: {
                        ip: gatewayIP,
                        port: gatewayPort
                    }
                }));
                return;
            }

            if (req.method === 'OPTIONS') {
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                });
                res.end();
                return;
            }

            const websitePath = path.join(process.cwd(), 'Website');
            let requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
            let filePath = path.join(websitePath, requestedPath);
            
            filePath = path.normalize(filePath);
            if (!filePath.startsWith(path.normalize(websitePath))) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            fs.stat(filePath, (err, stats) => {
                if (err) {
                    if (url.pathname === '/' || url.pathname.endsWith('/')) {
                        filePath = path.join(websitePath, 'index.html');
                    } else {
                        res.writeHead(404);
                        res.end('Not Found');
                        return;
                    }
                } else if (!stats.isFile()) {
                    filePath = path.join(filePath, 'index.html');
                }

                fs.readFile(filePath, (err, data) => {
                    if (err) {
            res.writeHead(404);
            res.end('Not Found');
                        return;
                    }

                    const ext = path.extname(filePath).toLowerCase();
                    const contentTypes: { [key: string]: string } = {
                        '.html': 'text/html',
                        '.js': 'application/javascript',
                        '.css': 'text/css',
                        '.json': 'application/json',
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.gif': 'image/gif',
                        '.svg': 'image/svg+xml',
                        '.ico': 'image/x-icon'
                    };
                    const contentType = contentTypes[ext] || 'application/octet-stream';

                    res.writeHead(200, {
                        'Content-Type': contentType,
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(data);
                });
            });
        });

        this.dashboardServer.listen(dashboardPort, '0.0.0.0', () => {
            Logger.info(`[Dashboard] HTTP server listening on port ${dashboardPort}`);
            Logger.info(`[Dashboard] Health check: http://localhost:${dashboardPort}/health`);
            Logger.info(`[Dashboard] Stats: http://localhost:${dashboardPort}/stats`);
            Logger.info(`[Dashboard] Website: http://localhost:${dashboardPort}/`);
        });
    }

    private async shutdown() {
        Logger.info("Received shutdown signal. Starting graceful shutdown...");
        this.discoveryListener.stop();
        
        if (this.dashboardServer) {
            this.dashboardServer.close();
        }
        
        if (this.ingestServer) {
            this.ingestServer.close();
        }
        
        if (this.httpServer) {
            this.httpServer.close();
        }
        
        this.wss.close();
        
        try {
            this.dbManager.close();
            Logger.info("Database closed successfully.");
        } catch (error) {
            Logger.error(`Error closing database: ${error}`);
        }
        
        Logger.info("All data saved. Gateway process terminated.");
        process.exit(0);
    }

    private handleMessage(ws: WebSocket, data: any, isBinary: boolean = false) {
        if (isBinary) {
            if (ws.role === 'AGENT') {
                this.relayStream(data);
            }
            return;
        }

        try {
            const rawString = data.toString();
            const message: Message = JSON.parse(rawString);
    
            Logger.debug(`[Server] Received message from ${ws.id}: type=${message.type}, role=${ws.role || 'unauthenticated'}`);
            this.router.handle(ws, message);
        } catch (error) {
            Logger.error(`[Server] Invalid Message format from ${ws.id}: ${(error as Error).message}`);
            Logger.error(`[Server] Raw data: ${data.toString().substring(0, 200)}`);
            
            if (ws.role && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: CommandType.ERROR,
                    data: {msg: "Invalid JSON format"}
                }));
            }
        }
    }

    public relayStream(data: any) {
        this.wss.clients.forEach((client: any) => {
            if (client.readyState === WebSocket.OPEN && client.role === 'CLIENT') {
                client.send(data, { binary: true });
            }
        });

        if (this.wssInsecure) {
            this.wssInsecure.clients.forEach((client: any) => {
                if (client.readyState === WebSocket.OPEN && client.role === 'CLIENT') {
                    client.send(data, { binary: true });
                }
            });
        }
    }

    private handleClose(ws: WebSocket) {
        if (ws.id) {
            const conn = this.connectionRegistry.getConnection(ws.id);
            if (conn) {
                if (ws.role === 'AGENT') {
                    this.agentManager.removeAgent(ws.id);
                } else if (ws.role === 'CLIENT') {
                    this.clientManager.removeClient(ws.id);
                }
                this.connectionRegistry.unregisterConnection(ws.id);
            }
        } else {
            Logger.info("Anonymous connection closed.");
        }
    }

    private autoAuthenticateAgent(ws: WebSocket, sessionId: string, ip: string) {
        if (ws.role === 'AGENT') {
            Logger.debug(`[Server] Connection ${sessionId} already authenticated as AGENT`);
            return;
        }
        if (ws.readyState !== WebSocket.OPEN) {
            Logger.warn(`[Server] Cannot auto-authenticate: Connection ${sessionId} is not OPEN (state: ${ws.readyState})`);
            return;
        }
        
        const machineId = `AGENT-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const name = `Agent-${machineId.substring(machineId.length - 6)}`;
        const port = (ws as any).socket?.remotePort || 0;

        Logger.info(`[Server] Auto-authenticating as AGENT: ${name} (${sessionId}) - Machine: ${machineId}`);

        const newConnection = new Connection(ws, sessionId, 'AGENT', ip, machineId, name, port);

        const registrationResult = this.connectionRegistry.registerConnection(newConnection);
        
        if (!registrationResult.success) {
            if (registrationResult.existingConnection) {
                Logger.warn(`[Server] Closing duplicate connection: ${registrationResult.reason}`);
                registrationResult.existingConnection.close();
                const retryResult = this.connectionRegistry.registerConnection(newConnection);
                if (!retryResult.success) {
                    Logger.error(`[Server] Failed to register agent: ${retryResult.reason}`);
                    ws.close();
                    return;
                }
            } else {
                Logger.error(`[Server] Failed to register agent: ${registrationResult.reason}`);
                ws.close();
                return;
            }
        }

        const now = Date.now();
        this.dbManager.addConnection({
            id: sessionId,
            name: name,
            role: 'AGENT',
            machineId: machineId,
            ip: ip,
            connectedAt: now,
            lastSeen: now
        });

        this.dbManager.logAuthAttempt(ip, machineId, 'AGENT', true, "Auto-authenticated");
        this.agentManager.addAgent(newConnection);

        ws.id = sessionId;
        ws.role = 'AGENT';

        const successMsg = createMessage(
            CommandType.AUTH,
            {
                status: "ok",
                msg: "Auto-authenticated as AGENT",
                sessionId: sessionId,
                machineId: machineId,
                agentId: machineId,
                name: name
            }
        );

        ws.send(JSON.stringify(successMsg));
        Logger.info(`[Server] AGENT authenticated: ${name} (${sessionId}) - Agent ID: ${machineId}`);
    }

    private startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.wss.clients.forEach((ws : WebSocket) => {
                if (ws.isAlive === false) {
                    const conn = ws.id ? this.connectionRegistry.getConnection(ws.id) : null;
                    const name = conn?.name || ws.id || 'Anon';
                    Logger.warn(`[Heartbeat] Terminating inactive SECURE connection: ${name} (${ws.id || 'Anon'})`);
                    return ws.terminate();
                }

                ws.isAlive = false;
                ws.ping();
                
                if (ws.id) {
                    this.dbManager.updateConnectionLastSeen(ws.id);
                }
            });

            if (this.wssInsecure) {
                this.wssInsecure.clients.forEach((ws : WebSocket) => {
                    if (ws.isAlive === false) {
                        const conn = ws.id ? this.connectionRegistry.getConnection(ws.id) : null;
                        const name = conn?.name || ws.id || 'Anon';
                        Logger.warn(`[Heartbeat] Terminating inactive INSECURE connection: ${name} (${ws.id || 'Anon'})`);
                        return ws.terminate();
                    }

                    ws.isAlive = false;
                    ws.ping();
                    
                    if (ws.id) {
                        this.dbManager.updateConnectionLastSeen(ws.id);
                    }
                });
            }
        }, 30000);
    }

    private startIngestServer() {
        const ingestPort = 7242;
        this.ingestServer = http.createServer((req, res) => {
            const url = new URL(req.url || '/', `http://${req.headers.host}`);
            
            if (req.method === 'OPTIONS') {
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Max-Age': '86400'
                });
                res.end();
                return;
            }

            if (url.pathname.startsWith('/ingest/') && req.method === 'POST') {
                let body = '';
                
                req.on('data', (chunk) => {
                    body += chunk.toString();
                });
                
                req.on('end', () => {
                    Logger.debug(`[Ingest] Received data at ${url.pathname}`);
                    
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    });
                    res.end(JSON.stringify({ status: 'ok' }));
                });
                
                req.on('error', (err) => {
                    Logger.error(`[Ingest] Request error: ${err.message}`);
                    res.writeHead(500, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ status: 'error', message: err.message }));
                });
                
                return;
            }

            res.writeHead(404, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ status: 'not found' }));
        });

        this.ingestServer.listen(ingestPort, '0.0.0.0', () => {
            Logger.info(`[Ingest] HTTP server listening on port ${ingestPort}`);
        });
    }
}