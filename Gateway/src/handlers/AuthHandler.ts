import { WebSocket } from "ws";
import { AgentManager } from "../managers/AgentManager";
import { ClientManager } from "../managers/ClientManager";
import { ConnectionRegistry } from "../managers/ConnectionRegistry";
import { DatabaseManager } from "../managers/DatabaseManager";
import { Message, createMessage } from "../types/Message";
import { CommandType } from "../types/Protocols";
import { Connection } from "../core/Connection";
import { Logger } from "../utils/Logger";
import { Config } from "../config";
import { TokenManager } from "../utils/TokenManager";

export class AuthHandler {
    private tokenManager: TokenManager;

    constructor(
        private agentManager: AgentManager,
        private clientManager: ClientManager,
        private connectionRegistry: ConnectionRegistry,
        private dbManager: DatabaseManager
    ) {
        this.tokenManager = new TokenManager();
    }

    public handle(ws: WebSocket, msg: Message) {
        const { user, pass, role, machineId, token, refreshToken } = msg.data || {};
        const sessionId = ws.id;
        const ip = (ws as any)._socket?.remoteAddress || "unknown";
        const port = (ws as any)._socket?.remotePort || 0;

        Logger.info(`[Auth] Handling authentication request from ${sessionId} (IP: ${ip}), role: ${role || 'unknown'}`);

        if (!sessionId) {
            Logger.error(`[Auth] Missing session ID for connection from ${ip}`);
            this.sendError(ws, "Internal Error: Missing server-assigned session ID"); 
            ws.close();
            return;
        }

        if (refreshToken) {
            this.handleTokenRefresh(ws, refreshToken, ip);
            return;
        }

        if (token) {
            this.handleTokenAuth(ws, token, ip);
            return;
        }

        const userRole = role === 'CLIENT' ? 'CLIENT' : 'AGENT';

        if (userRole === 'AGENT') {
            const agentMachineId = machineId || this.generateAgentId(ip);
            this.authenticateAgent(ws, sessionId, ip, agentMachineId, user);
            return;
        }

        if (!machineId) {
            this.sendError(ws, "Authentication failed: Missing 'machineId'");
            this.dbManager.logAuthAttempt(ip, null, null, false, "Missing machineId");
            ws.close();
            return;
        }

        const VALID_PASS = Config.AUTH_SECRET;

        if (!pass || pass.trim() !== VALID_PASS.trim()) {
            Logger.warn(`[Auth] Failed CLIENT authentication from IP ${ip}`);
            Logger.warn(`[Auth] Expected: ${VALID_PASS.substring(0, 20)}...`);
            Logger.warn(`[Auth] Received: ${pass ? pass.substring(0, 20) + '...' : 'null/undefined'}`);
            this.sendError(ws, "Authentication failed: Wrong password.");
            this.dbManager.logAuthAttempt(ip, machineId, 'CLIENT', false, "Wrong password");
            ws.close();
            return;
        }

        this.authenticateClient(ws, sessionId, ip, user, machineId);
    }

    private authenticateAgent(
        ws: WebSocket,
        sessionId: string,
        ip: string,
        machineId: string,
        user?: string
    ): void {
        let name = user || machineId;
        const cachedName = this.dbManager.getConnectionName(machineId, 'AGENT');
        if (cachedName) {
            name = cachedName;
        }

        const port = (ws as any)._socket?.remotePort || 0;

        const existingConnection = this.connectionRegistry.findConnectionByIPPort(ip, port);
        let finalSessionId = sessionId;
        
        if (existingConnection && existingConnection.role === 'AGENT' && existingConnection.id !== sessionId) {
            finalSessionId = existingConnection.id;
            Logger.info(`[Auth] Reusing existing connection ID ${finalSessionId} for AGENT from ${ip}:${port}`);
            existingConnection.close();
            this.connectionRegistry.unregisterConnection(existingConnection.id);
        }

        const newConnection = new Connection(ws, finalSessionId, 'AGENT', ip, machineId, name, port);

        const registrationResult = this.connectionRegistry.registerConnection(newConnection);
        
        if (!registrationResult.success) {
                this.sendError(ws, `Connection failed: ${registrationResult.reason}`);
                ws.close();
                return;
        }

        const now = Date.now();
        this.dbManager.addConnection({
            id: finalSessionId,
            name: name,
            role: 'AGENT',
            machineId: machineId,
            ip: ip,
            connectedAt: now,
            lastSeen: now
        });

        this.dbManager.logAuthAttempt(ip, machineId, 'AGENT', true, "Auto-authenticated");
        this.agentManager.addAgent(newConnection);

        ws.id = finalSessionId;
        ws.role = 'AGENT';

        const successMsg = createMessage(
            CommandType.AUTH,
            {
                status: "ok",
                msg: "Agent registered successfully",
                sessionId: finalSessionId,
                machineId: machineId,
                name: name,
                agentId: finalSessionId
            }
        );

        ws.send(JSON.stringify(successMsg));
        Logger.info(`[Auth] AGENT auto-authenticated: ${name} (${finalSessionId}) - Machine: ${machineId} - IP: ${ip}`);
    }

    private authenticateClient(
        ws: WebSocket,
        sessionId: string,
        ip: string,
        user: string | undefined,
        machineId: string
    ): void {
        let name = user || machineId;
        const cachedName = this.dbManager.getConnectionName(machineId, 'CLIENT');
        if (cachedName) {
            name = cachedName;
        } else if (user) {
            name = user;
        }

        const port = (ws as any)._socket?.remotePort || 0;
        
        const existingConnection = this.connectionRegistry.findConnectionByIPPort(ip, port);
        let finalSessionId = sessionId;
        
        if (existingConnection && existingConnection.role === 'CLIENT' && existingConnection.id !== sessionId) {
            finalSessionId = existingConnection.id;
            Logger.info(`[Auth] Reusing existing connection ID ${finalSessionId} for CLIENT from ${ip}:${port}`);
            existingConnection.close();
            this.connectionRegistry.unregisterConnection(existingConnection.id);
        }

        const newConnection = new Connection(ws, finalSessionId, 'CLIENT', ip, machineId, name, port);

        const registrationResult = this.connectionRegistry.registerConnection(newConnection);
        
        if (!registrationResult.success) {
            if (registrationResult.existingConnection) {
                Logger.warn(`[Auth] Closing duplicate CLIENT connection: ${registrationResult.reason}`);
                registrationResult.existingConnection.close();
                const retryResult = this.connectionRegistry.registerConnection(newConnection);
                if (!retryResult.success) {
                    this.sendError(ws, `Connection failed: ${retryResult.reason}`);
                    this.dbManager.logAuthAttempt(ip, machineId, 'CLIENT', false, retryResult.reason);
                    ws.close();
                    return;
                }
            } else {
                this.sendError(ws, `Connection failed: ${registrationResult.reason}`);
                this.dbManager.logAuthAttempt(ip, machineId, 'CLIENT', false, registrationResult.reason);
                ws.close();
                return;
            }
        }

        const now = Date.now();
        this.dbManager.addConnection({
            id: finalSessionId,
            name: name,
            role: 'CLIENT',
            machineId: machineId,
            ip: ip,
            connectedAt: now,
            lastSeen: now
        });

        this.dbManager.logAuthAttempt(ip, machineId, 'CLIENT', true, "Password auth");
        this.clientManager.addClients(newConnection);

        ws.id = finalSessionId;
        ws.role = 'CLIENT';

        const accessToken = this.tokenManager.generateAccessToken({
            sessionId: finalSessionId,
            machineId: machineId,
            role: 'CLIENT',
            name: name,
            ip: ip
        });

        const refreshToken = this.tokenManager.generateRefreshToken({
            sessionId: finalSessionId,
            machineId: machineId,
            role: 'CLIENT',
            name: name,
            ip: ip
        });

        const successMsg = createMessage(
            CommandType.AUTH,
            {
                status: "ok",
                msg: "Auth successful",
                sessionId: finalSessionId,
                machineId: machineId,
                name: name,
                token: accessToken,
                refreshToken: refreshToken,
                expiresIn: Config.JWT_EXPIRES_IN
            }
        );

        ws.send(JSON.stringify(successMsg));
        Logger.info(`[Auth] CLIENT authenticated: ${name} (${finalSessionId}) - Machine: ${machineId} - IP: ${ip}`);
    }

    private generateAgentId(ip: string): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `AGENT-${ip.replace(/\./g, '-')}-${timestamp}-${random}`;
    }

    private handleTokenAuth(ws: WebSocket, token: string, ip: string) {
        const payload = this.tokenManager.verifyToken(token);

        if (!payload) {
            this.sendError(ws, "Authentication failed: Invalid or expired token");
            this.dbManager.logAuthAttempt(ip, null, null, false, "Invalid token");
            ws.close();
            return;
        }

        const sessionId = ws.id || payload.sessionId;
        this.authenticateConnection(
            ws,
            sessionId,
            ip,
            payload.name,
            payload.role,
            payload.machineId,
            true
        );
    }

    private handleTokenRefresh(ws: WebSocket, refreshToken: string, ip: string) {
        const newAccessToken = this.tokenManager.refreshAccessToken(refreshToken);

        if (!newAccessToken) {
            this.sendError(ws, "Token refresh failed: Invalid or expired refresh token");
            this.dbManager.logAuthAttempt(ip, null, null, false, "Invalid refresh token");
            ws.close();
            return;
        }

        const payload = this.tokenManager.verifyToken(newAccessToken);
        if (!payload) {
            this.sendError(ws, "Token refresh failed: Could not generate new token");
            ws.close();
            return;
        }

        const response = createMessage(CommandType.AUTH, {
            status: "ok",
            msg: "Token refreshed",
            token: newAccessToken,
            sessionId: payload.sessionId,
            machineId: payload.machineId,
            name: payload.name
        });

        ws.send(JSON.stringify(response));
        Logger.info(`[Auth] Token refreshed for ${payload.name} (${payload.sessionId})`);
    }

    private authenticateConnection(
        ws: WebSocket,
        sessionId: string,
        ip: string,
        user: string | undefined,
        role: string | undefined,
        machineId: string,
        isTokenAuth: boolean = false
    ) {
        const userRole = role === 'AGENT' ? 'AGENT' : 'CLIENT';
        const port = (ws as any)._socket?.remotePort || 0;
        
        let name = user || machineId;
        const cachedName = this.dbManager.getConnectionName(machineId, userRole);
        if (cachedName) {
            name = cachedName;
        } else if (user) {
            name = user;
        }

        let finalSessionId = sessionId;
        const existingByIPPort = this.connectionRegistry.findConnectionByIPPort(ip, port);
        
        if (existingByIPPort && existingByIPPort.role === userRole && existingByIPPort.id !== sessionId) {
            finalSessionId = existingByIPPort.id;
            Logger.info(`[Auth] Reusing existing connection ID ${finalSessionId} for ${userRole} from ${ip}:${port}`);
            existingByIPPort.close();
            this.connectionRegistry.unregisterConnection(existingByIPPort.id);
        }
        
        const persistentId = this.connectionRegistry.getPersistentId(machineId, userRole, ip);
        const existingByPersistentId = this.connectionRegistry.findConnectionByPersistentId(machineId, userRole, ip);
        if (existingByPersistentId && existingByPersistentId.id !== finalSessionId) {
            finalSessionId = existingByPersistentId.id;
            Logger.info(`[Auth] Reconnect detected: ${persistentId} (reusing ID: ${finalSessionId})`);
            existingByPersistentId.close();
            this.connectionRegistry.unregisterConnection(existingByPersistentId.id);
        }

        const newConnection = new Connection(ws, finalSessionId, userRole, ip, machineId, name, port);

        const registrationResult = this.connectionRegistry.registerConnection(newConnection);
        
        if (!registrationResult.success) {
                this.sendError(ws, `Connection failed: ${registrationResult.reason}`);
                this.dbManager.logAuthAttempt(ip, machineId, userRole, false, registrationResult.reason);
                ws.close();
                return;
        }

        const now = Date.now();
        this.dbManager.addConnection({
            id: finalSessionId,
            name: name,
            role: userRole,
            machineId: machineId,
            ip: ip,
            connectedAt: now,
            lastSeen: now
        });

        this.dbManager.logAuthAttempt(ip, machineId, userRole, true, isTokenAuth ? "Token auth" : "Password auth");

        if (userRole === 'AGENT') {
            this.agentManager.addAgent(newConnection);
        } else {
            this.clientManager.addClients(newConnection);
        }

        ws.id = finalSessionId;
        ws.role = userRole;

        let accessToken: string | undefined;
        let refreshToken: string | undefined;
        
        if (userRole === 'CLIENT') {
            const clientPayload = {
                sessionId: finalSessionId,
                machineId: machineId,
                role: 'CLIENT' as const,
                name: name,
                ip: ip
            };
            
            accessToken = this.tokenManager.generateAccessToken(clientPayload);
            refreshToken = this.tokenManager.generateRefreshToken(clientPayload);
        }

        const successMsg = createMessage(
            CommandType.AUTH,
            {
                status: "ok",
                msg: "Auth successful",
                sessionId: finalSessionId,
                machineId: machineId,
                name: name,
                ...(accessToken && refreshToken ? {
                    token: accessToken,
                    refreshToken: refreshToken,
                    expiresIn: Config.JWT_EXPIRES_IN
                } : {})
            }
        );

        ws.send(JSON.stringify(successMsg));
        Logger.info(`[Auth] ${userRole} authenticated: ${name} (${finalSessionId}) - Machine: ${machineId} - IP: ${ip}`);
    }

    private sendError(ws: WebSocket, msg: string) {
        const err = createMessage(
            CommandType.AUTH,
            {
                status: "failed",
                msg: msg
            }
        );

        if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(err));
        }
    }
}
