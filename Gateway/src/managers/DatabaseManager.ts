import Database from 'better-sqlite3';
import { Logger } from '../utils/Logger';
import { Config } from '../config';
import * as fs from 'fs';
import * as path from 'path';

export interface ConnectionRecord {
    id: string;
    name: string;
    role: 'AGENT' | 'CLIENT';
    machineId: string;
    ip: string;
    connectedAt: number;
    lastSeen: number;
    isActive: number; 
}

export interface ConnectionLog {
    id: string;
    connectionId: string;
    name: string;
    role: 'AGENT' | 'CLIENT';
    machineId: string;
    ip: string;
    event: 'connect' | 'disconnect' | 'reconnect';
    timestamp: number;
    message?: string;
}

export interface MachineInfo {
    ip: string;
    port: number;
    role: 'AGENT' | 'CLIENT';
}

export interface QueryResult {
    id: string;
    connectionId: string;
    timestamp: number;
    result: string;
}

export class DatabaseManager {
    private db: Database.Database;
    private dbPath: string;

    constructor() {
        try {
            const dataDir = path.dirname(Config.DATABASE_PATH);
            const absoluteDataDir = path.isAbsolute(dataDir) ? dataDir : path.resolve(process.cwd(), dataDir);
            
            if (!fs.existsSync(absoluteDataDir)) {
                fs.mkdirSync(absoluteDataDir, { recursive: true });
                Logger.info(`[DatabaseManager] Created data directory: ${absoluteDataDir}`);
            }

            this.dbPath = path.isAbsolute(Config.DATABASE_PATH) 
                ? Config.DATABASE_PATH 
                : path.resolve(process.cwd(), Config.DATABASE_PATH);
            
            Logger.info(`[DatabaseManager] Database path: ${this.dbPath}`);
            this.db = new Database(this.dbPath);
            this.initializeDatabase();
            Logger.info(`[DatabaseManager] Database initialized successfully at ${this.dbPath}`);
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to initialize database: ${error}`);
            throw error;
        }
    }

    private initializeDatabase() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('AGENT', 'CLIENT')),
                machineId TEXT NOT NULL,
                ip TEXT NOT NULL,
                connectedAt INTEGER NOT NULL,
                lastSeen INTEGER NOT NULL,
                isActive INTEGER NOT NULL DEFAULT 1
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS connection_logs (
                id TEXT PRIMARY KEY,
                connectionId TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('AGENT', 'CLIENT')),
                machineId TEXT NOT NULL,
                ip TEXT NOT NULL,
                event TEXT NOT NULL CHECK(event IN ('connect', 'disconnect', 'reconnect')),
                timestamp INTEGER NOT NULL,
                message TEXT
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS auth_attempts (
                id TEXT PRIMARY KEY,
                ip TEXT NOT NULL,
                machineId TEXT,
                role TEXT,
                success INTEGER NOT NULL DEFAULT 0,
                timestamp INTEGER NOT NULL,
                reason TEXT
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS activity_history (
                id TEXT PRIMARY KEY,
                clientId TEXT NOT NULL,
                clientName TEXT NOT NULL,
                clientMachineId TEXT NOT NULL,
                action TEXT NOT NULL,
                targetAgentId TEXT,
                targetAgentName TEXT,
                commandType TEXT,
                commandData TEXT,
                result TEXT,
                category TEXT,
                success INTEGER NOT NULL DEFAULT 1,
                timestamp INTEGER NOT NULL,
                ip TEXT
            )
        `);

        try {
            const tableInfo = this.db.prepare("PRAGMA table_info(machine_info)").all() as Array<{name: string, type: string}>;
            const columnNames = tableInfo.map(col => col.name);
            const hasRole = columnNames.includes('role');
            const hasMachineId = columnNames.includes('machineId');
            
            if (!hasRole || hasMachineId) {
                Logger.info('[DatabaseManager] Migrating machine_info table to new schema (old schema detected)...');
                this.db.exec('DROP TABLE IF EXISTS machine_info');
            } else {
                Logger.info('[DatabaseManager] machine_info table already has correct schema, no migration needed');
            }
        } catch (e) {
            Logger.info(`[DatabaseManager] machine_info table does not exist yet: ${e}`);
        }

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS machine_info (
                ip TEXT NOT NULL,
                port INTEGER NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('AGENT', 'CLIENT')),
                PRIMARY KEY (ip, port, role)
            )
        `);
        
        try {
            const tableInfo = this.db.prepare("PRAGMA table_info(query_results)").all() as Array<{name: string, type: string}>;
            const hasQueryId = tableInfo.some(col => col.name === 'queryId');
            
            if (hasQueryId) {
                Logger.info('[DatabaseManager] Migrating query_results table to new schema...');
                this.db.exec('DROP TABLE IF EXISTS query_results');
            }
        } catch (e) {
        }

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS query_results (
                id TEXT PRIMARY KEY,
                connectionId TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                result TEXT NOT NULL
            )
        `);

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_connections_machineId ON connections(machineId);
            CREATE INDEX IF NOT EXISTS idx_connections_role ON connections(role);
            CREATE INDEX IF NOT EXISTS idx_connections_isActive ON connections(isActive);
            CREATE INDEX IF NOT EXISTS idx_logs_connectionId ON connection_logs(connectionId);
            CREATE INDEX IF NOT EXISTS idx_logs_machineId ON connection_logs(machineId);
            CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON connection_logs(timestamp);
            CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip ON auth_attempts(ip);
            CREATE INDEX IF NOT EXISTS idx_auth_attempts_timestamp ON auth_attempts(timestamp);
            CREATE INDEX IF NOT EXISTS idx_activity_clientId ON activity_history(clientId);
            CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_history(timestamp);
            CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_history(action);
            CREATE INDEX IF NOT EXISTS idx_activity_commandType ON activity_history(commandType);
            CREATE INDEX IF NOT EXISTS idx_activity_category ON activity_history(category);
            CREATE INDEX IF NOT EXISTS idx_query_results_connectionId ON query_results(connectionId);
        `);

        this.db.prepare('UPDATE connections SET isActive = 0').run();
    }

    public addConnection(record: Omit<ConnectionRecord, 'isActive'>): boolean {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO connections 
                (id, name, role, machineId, ip, connectedAt, lastSeen, isActive)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            `);
            
            stmt.run(
                record.id,
                record.name,
                record.role,
                record.machineId,
                record.ip,
                record.connectedAt,
                record.lastSeen
            );

            this.logConnection({
                connectionId: record.id,
                name: record.name,
                role: record.role,
                machineId: record.machineId,
                ip: record.ip,
                event: 'connect',
                timestamp: Date.now()
            });

            return true;
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to add connection: ${error}`);
            return false;
        }
    }

    public updateConnectionLastSeen(id: string): boolean {
        try {
            const stmt = this.db.prepare(`
                UPDATE connections 
                SET lastSeen = ? 
                WHERE id = ?
            `);
            stmt.run(Date.now(), id);
            return true;
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to update last seen: ${error}`);
            return false;
        }
    }

    public removeConnection(id: string, name: string, role: 'AGENT' | 'CLIENT', machineId: string, ip: string): boolean {
        try {
            const stmt = this.db.prepare(`
                UPDATE connections 
                SET isActive = 0, lastSeen = ?
                WHERE id = ?
            `);
            stmt.run(Date.now(), id);

            this.logConnection({
                connectionId: id,
                name: name,
                role: role,
                machineId: machineId,
                ip: ip,
                event: 'disconnect',
                timestamp: Date.now()
            });

            return true;
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to remove connection: ${error}`);
            return false;
        }
    }

    public getConnectionById(id: string): ConnectionRecord | null {
        try {
            const stmt = this.db.prepare('SELECT * FROM connections WHERE id = ?');
            const row = stmt.get(id) as ConnectionRecord | undefined;
            return row || null;
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to get connection: ${error}`);
            return null;
        }
    }

    public getConnectionByMachineId(machineId: string, role?: 'AGENT' | 'CLIENT'): ConnectionRecord | null {
        try {
            if (role) {
                const stmt = this.db.prepare(`
                    SELECT * FROM connections 
                    WHERE machineId = ? AND role = ? AND isActive = 1
                    ORDER BY lastSeen DESC
                    LIMIT 1
                `);
                const row = stmt.get(machineId, role) as ConnectionRecord | undefined;
                return row || null;
            } else {
                const stmt = this.db.prepare(`
                    SELECT * FROM connections 
                    WHERE machineId = ? AND isActive = 1
                    ORDER BY lastSeen DESC
                    LIMIT 1
                `);
                const row = stmt.get(machineId) as ConnectionRecord | undefined;
                return row || null;
            }
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to get connection by machineId: ${error}`);
            return null;
        }
    }

    public getAllActiveConnections(role?: 'AGENT' | 'CLIENT'): ConnectionRecord[] {
        try {
            if (role) {
                const stmt = this.db.prepare(`
                    SELECT * FROM connections 
                    WHERE role = ? AND isActive = 1
                    ORDER BY connectedAt DESC
                `);
                return stmt.all(role) as ConnectionRecord[];
            } else {
                const stmt = this.db.prepare(`
                    SELECT * FROM connections 
                    WHERE isActive = 1
                    ORDER BY connectedAt DESC
                `);
                return stmt.all() as ConnectionRecord[];
            }
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to get active connections: ${error}`);
            return [];
        }
    }

    private logConnection(log: Omit<ConnectionLog, 'id'>): void {
        try {
            const logId = `${log.connectionId}-${log.timestamp}`;
            const stmt = this.db.prepare(`
                INSERT INTO connection_logs 
                (id, connectionId, name, role, machineId, ip, event, timestamp, message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run(
                logId,
                log.connectionId,
                log.name,
                log.role,
                log.machineId,
                log.ip,
                log.event,
                log.timestamp,
                log.message || null
            );
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to log connection event: ${error}`);
        }
    }

    public getConnectionLogs(
        machineId?: string,
        role?: 'AGENT' | 'CLIENT',
        limit: number = 100
    ): ConnectionLog[] {
        try {
            let query = 'SELECT * FROM connection_logs';
            const conditions: string[] = [];
            const params: any[] = [];

            if (machineId) {
                conditions.push('machineId = ?');
                params.push(machineId);
            }

            if (role) {
                conditions.push('role = ?');
                params.push(role);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND');
            }

            query += ' ORDER BY timestamp DESC LIMIT ?';
            params.push(limit);

            const stmt = this.db.prepare(query);
            return stmt.all(...params) as ConnectionLog[];
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to get connection logs: ${error}`);
            return [];
        }
    }

    public getConnectionName(machineId: string, role: 'AGENT' | 'CLIENT'): string | null {
        try {
            const stmt = this.db.prepare(`
                SELECT name FROM connections 
                WHERE machineId = ? AND role = ?
                ORDER BY lastSeen DESC
                LIMIT 1
            `);
            const row = stmt.get(machineId, role) as { name: string } | undefined;
            return row?.name || null;
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to get connection name: ${error}`);
            return null;
        }
    }

    public logAuthAttempt(
        ip: string,
        machineId: string | null,
        role: 'AGENT' | 'CLIENT' | null,
        success: boolean,
        reason?: string
    ): void {
        try {
            const id = `${ip}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const stmt = this.db.prepare(`
                INSERT INTO auth_attempts 
                (id, ip, machineId, role, success, timestamp, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run(
                id,
                ip,
                machineId || null,
                role || null,
                success ? 1 : 0,
                Date.now(),
                reason || null
            );
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to log auth attempt: ${error}`);
        }
    }

    public getRecentAuthAttempts(ip: string, windowMs: number = 15 * 60 * 1000): number {
        try {
            const since = Date.now() - windowMs;
            const stmt = this.db.prepare(`
                SELECT COUNT(*) as count FROM auth_attempts 
                WHERE ip = ? AND timestamp > ? AND success = 0
            `);
            const result = stmt.get(ip, since) as { count: number } | undefined;
            return result?.count || 0;
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to get auth attempts: ${error}`);
            return 0;
        }
    }

    public saveConnectionHistory(connId: string, event: 'connect' | 'disconnect' | 'reconnect', ip: string, port: number): void {
        try {
            const conn = this.getConnectionById(connId);
            if (!conn) {
                Logger.warn(`[DatabaseManager] Cannot save history: connection ${connId} not found`);
                return;
            }

            const logId = `${connId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const stmt = this.db.prepare(`
                INSERT INTO connection_logs 
                (id, connectionId, name, role, machineId, ip, event, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run(
                logId,
                connId,
                conn.name,
                conn.role,
                conn.machineId,
                ip,
                event,
                Date.now()
            );
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to save connection history: ${error}`);
        }
    }

    public updateMachineInfo(ip: string, port: number, role: 'AGENT' | 'CLIENT'): void {
        try {
            
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO machine_info 
                (ip, port, role)
                VALUES (?, ?, ?)
            `);
            stmt.run(ip, port, role);
            
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to update machine info: ${error}`);
        }
    }

    public getMachineInfo(ip: string, port: number, role: 'AGENT' | 'CLIENT'): MachineInfo | null {
        try {
            const stmt = this.db.prepare('SELECT * FROM machine_info WHERE ip = ? AND port = ? AND role = ?');
            const row = stmt.get(ip, port, role) as MachineInfo | undefined;
            return row || null;
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to get machine info: ${error}`);
            return null;
        }
    }

    public saveQueryResult(connId: string, result: any): void {
        try {
            const countStmt = this.db.prepare(`
                SELECT COUNT(*) as count FROM query_results 
                WHERE connectionId = ?
            `);
            const count = (countStmt.get(connId) as { count: number })?.count || 0;
            
            if (count >= 10) {
                const deleteStmt = this.db.prepare(`
                    DELETE FROM query_results 
                    WHERE id = (
                        SELECT id FROM query_results 
                        WHERE connectionId = ? 
                        ORDER BY timestamp ASC 
                        LIMIT 1
                    )
                `);
                deleteStmt.run(connId);
            }
            
            const id = `${connId}-${Date.now()}`;
            const resultJson = JSON.stringify(result);
            const insertStmt = this.db.prepare(`
                INSERT INTO query_results 
                (id, connectionId, timestamp, result)
                VALUES (?, ?, ?, ?)
            `);
            insertStmt.run(id, connId, Date.now(), resultJson);
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to save query result: ${error}`);
        }
    }

    public getQueryResults(connId: string): QueryResult[] {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM query_results 
                WHERE connectionId = ?
                ORDER BY timestamp DESC
                LIMIT 10
            `);
            return stmt.all(connId) as QueryResult[];
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to get query results: ${error}`);
            return [];
        }
    }

    public getQueryResult(connId: string): any {
        try {
            const stmt = this.db.prepare(`
                SELECT result FROM query_results 
                WHERE connectionId = ?
                ORDER BY timestamp DESC
                LIMIT 1
            `);
            const row = stmt.get(connId) as { result: string } | undefined;
            if (row) {
                return JSON.parse(row.result);
            }
            return null;
        } catch (error) {
            Logger.error(`[DatabaseManager] Failed to get query result: ${error}`);
            return null;
        }
    }

    public close(): void {
        try {
            if (this.db) {
                this.db.close();
                Logger.info('[DatabaseManager] Database connection closed');
            }
        } catch (error) {
            Logger.error(`[DatabaseManager] Error closing database: ${error}`);
        }
    }
}

