import { Connection, ConnectionHistory, MachineInfo } from '../core/Connection';
import { DatabaseManager } from './DatabaseManager';
import { Logger } from '../utils/Logger';
import * as crypto from 'crypto';

export class ConnectionRegistry {
    private connections: Map<string, Connection> = new Map();
    private persistentIdToConnection: Map<string, Connection> = new Map();
    private ipPortToConnection: Map<string, Connection> = new Map();
    private ipToClientConnection: Map<string, Connection> = new Map(); 
    private machineIdToConnection: Map<string, Set<string>> = new Map(); 
    private roleConnections: Map<'AGENT' | 'CLIENT', Set<string>> = new Map([
        ['AGENT', new Set()],
        ['CLIENT', new Set()]
    ]);

    constructor(private dbManager: DatabaseManager) {}

    public getPersistentId(machineId: string, role: 'AGENT' | 'CLIENT', ip: string): string {
        const hash = crypto.createHash('md5').update(ip).digest('hex').substring(0, 8);
        return `${role}-${machineId}-${hash}`;
    }

    public findConnectionByPersistentId(machineId: string, role: 'AGENT' | 'CLIENT', ip: string): Connection | null {
        const persistentId = this.getPersistentId(machineId, role, ip);
        return this.persistentIdToConnection.get(persistentId) || null;
    }

    public findConnectionByIPPort(ip: string, port: number): Connection | null {
        const key = `${ip}:${port}`;
        return this.ipPortToConnection.get(key) || null;
    }

    public findClientConnectionByIP(ip: string): Connection | null {
        return this.ipToClientConnection.get(ip) || null;
    }

    public registerConnection(conn: Connection): { success: boolean; reason?: string; existingConnection?: Connection } {
        const { id, machineId, role, ip, persistentId } = conn;

        if (this.connections.has(id)) {
            Logger.warn(`[ConnectionRegistry] Connection ID ${id} already exists`);
            return { 
                success: false, 
                reason: `Connection ID ${id} already exists`,
                existingConnection: this.connections.get(id)!
            };
        }

       const existingByIPPort = this.findConnectionByIPPort(ip, conn.machineInfo?.port || 0);
        if (existingByIPPort && existingByIPPort.role === role && existingByIPPort.id !== id) {
            Logger.warn(`[ConnectionRegistry] Duplicate ${role} connection detected from ${ip}:${conn.machineInfo?.port || 0} (existing: ${existingByIPPort.id}, new: ${id})`);
            Logger.warn(`[ConnectionRegistry] Closing old ${role} connection: ${existingByIPPort.id} (IP: ${existingByIPPort.ip}:${existingByIPPort.machineInfo?.port || 0})`);
            existingByIPPort.addConnectionEvent({
                timestamp: Date.now(),
                event: 'reconnect',
                ip: ip,
                port: conn.machineInfo?.port || 0
            });
            existingByIPPort.close();
            this.unregisterConnection(existingByIPPort.id);
        }

        const existingByPersistentId = this.persistentIdToConnection.get(persistentId);
        if (existingByPersistentId && existingByPersistentId.id !== id) {
            Logger.info(`[ConnectionRegistry] Reconnect detected: ${persistentId} (old: ${existingByPersistentId.id}, new: ${id})`);
            existingByPersistentId.addConnectionEvent({
                timestamp: Date.now(),
                event: 'reconnect',
                ip: ip,
                port: conn.machineInfo?.port || 0
            });
            existingByPersistentId.close();
            this.unregisterConnection(existingByPersistentId.id);
        }

        this.connections.set(id, conn);
        this.persistentIdToConnection.set(persistentId, conn);
        
        if (conn.machineInfo?.port) {
            const ipPortKey = `${ip}:${conn.machineInfo.port}`;
            this.ipPortToConnection.set(ipPortKey, conn);
        }
        
        if (role === 'CLIENT') {
            this.ipToClientConnection.set(ip, conn);
        }
        
        if (!this.machineIdToConnection.has(machineId)) {
            this.machineIdToConnection.set(machineId, new Set());
        }
        this.machineIdToConnection.get(machineId)!.add(id);
        
        this.roleConnections.get(role)!.add(id);

        this.registerConnectionWithHistory(conn);
        
        if (conn.machineInfo) {
            this.dbManager.updateMachineInfo(conn.machineInfo.ip, conn.machineInfo.port, conn.machineInfo.role);
        }

        Logger.info(`[ConnectionRegistry] Registered ${role} connection: ${id} (persistentId: ${persistentId}, machineId: ${machineId})`);
        return { success: true };
    }

    private registerConnectionWithHistory(conn: Connection): void {
        const history: ConnectionHistory = {
            timestamp: Date.now(),
            event: 'connect',
            ip: conn.ip,
            port: conn.machineInfo?.port || 0
        };
        conn.addConnectionEvent(history);
        
        this.dbManager.saveConnectionHistory(
            conn.id,
            'connect',
            conn.ip,
            conn.machineInfo?.port || 0
        );
    }

    public updateMachineInfo(connId: string, machineInfo: Partial<MachineInfo>): void {
        const conn = this.connections.get(connId);
        if (conn) {
            const info: MachineInfo = {
                ip: machineInfo.ip || conn.ip,
                port: machineInfo.port || conn.machineInfo?.port || 0,
                role: machineInfo.role || conn.role
            };
            
            conn.updateMachineInfo(info);
            
            if (info.port !== undefined) {
                const oldKey = `${conn.ip}:${conn.machineInfo?.port || 0}`;
                const newKey = `${conn.ip}:${info.port}`;
                if (this.ipPortToConnection.get(oldKey) === conn) {
                    this.ipPortToConnection.delete(oldKey);
                }
                this.ipPortToConnection.set(newKey, conn);
            }
            
            this.dbManager.updateMachineInfo(info.ip, info.port, info.role);
        }
    }

    public getConnectionHistory(connId: string): ConnectionHistory[] {
        const conn = this.connections.get(connId);
        return conn ? conn.connectionHistory : [];
    }

    public storeQueryResult(connId: string, result: any): void {
        const conn = this.connections.get(connId);
        if (conn) {
            conn.storeQueryResult(result);
            this.dbManager.saveQueryResult(connId, result);
        }
    }

    public getQueryResults(connId: string): any[] {
        const conn = this.connections.get(connId);
        if (conn) {
            return conn.getQueryResults();
        }
        const dbResults = this.dbManager.getQueryResults(connId);
        return dbResults.map(r => JSON.parse(r.result));
    }

    public getQueryResult(connId: string): any {
        const conn = this.connections.get(connId);
        if (conn) {
            const results = conn.getQueryResults();
            return results.length > 0 ? results[results.length - 1] : null;
        }
        return this.dbManager.getQueryResult(connId);
    }

    public unregisterConnection(id: string): boolean {
        const conn = this.connections.get(id);
        if (!conn) {
            return false;
        }

        const { machineId, role, ip, persistentId } = conn;

        conn.addConnectionEvent({
            timestamp: Date.now(),
            event: 'disconnect',
            ip: ip,
            port: conn.machineInfo?.port || 0
        });

        this.dbManager.saveConnectionHistory(
            id,
            'disconnect',
            ip,
            conn.machineInfo?.port || 0
        );

        this.connections.delete(id);
        this.persistentIdToConnection.delete(persistentId);
        
        if (conn.machineInfo?.port) {
            const ipPortKey = `${ip}:${conn.machineInfo.port}`;
            this.ipPortToConnection.delete(ipPortKey);
        }
        
        if (role === 'CLIENT') {
            const existingClient = this.ipToClientConnection.get(ip);
            if (existingClient && existingClient.id === id) {
                this.ipToClientConnection.delete(ip);
            }
        }
        
        const machineConnections = this.machineIdToConnection.get(machineId);
        if (machineConnections) {
            machineConnections.delete(id);
            if (machineConnections.size === 0) {
                this.machineIdToConnection.delete(machineId);
            }
        }

        this.roleConnections.get(role)!.delete(id);

        Logger.info(`[ConnectionRegistry] Unregistered ${role} connection: ${id} (persistentId: ${persistentId}, machineId: ${machineId})`);
        return true;
    }

    public findConnectionByMachineId(machineId: string, role: 'AGENT' | 'CLIENT'): Connection | null {
        const machineConnections = this.machineIdToConnection.get(machineId);
        if (!machineConnections) {
            return null;
        }

        for (const connId of machineConnections) {
            const conn = this.connections.get(connId);
            if (conn && conn.role === role) {
                return conn;
            }
        }

        return null;
    }

    public getConnection(id: string): Connection | null {
        return this.connections.get(id) || null;
    }

    public getConnectionsByRole(role: 'AGENT' | 'CLIENT'): Connection[] {
        const connectionIds = this.roleConnections.get(role);
        if (!connectionIds) {
            return [];
        }

        const connections: Connection[] = [];
        for (const id of connectionIds) {
            const conn = this.connections.get(id);
            if (conn) {
                connections.push(conn);
            }
        }

        return connections;
    }

    public getAllConnections(): Connection[] {
        return Array.from(this.connections.values());
    }

    public getConnectionCount(role?: 'AGENT' | 'CLIENT'): number {
        if (role) {
            return this.roleConnections.get(role)?.size || 0;
        }
        return this.connections.size;
    }

    public isMachineConnected(machineId: string, role?: 'AGENT' | 'CLIENT'): boolean {
        if (role) {
            return this.findConnectionByMachineId(machineId, role) !== null;
        }
        const machineConnections = this.machineIdToConnection.get(machineId);
        return machineConnections ? machineConnections.size > 0 : false;
    }
}

