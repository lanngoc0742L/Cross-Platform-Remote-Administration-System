import { DatabaseManager } from './DatabaseManager';
import { Logger } from '../utils/Logger';
import { Message } from '../types/Message';
import { Connection } from '../core/Connection';

export interface ActivityRecord {
    id: string;
    clientId: string;
    clientName: string;
    clientMachineId: string;
    action: string;
    targetAgentId?: string;
    targetAgentName?: string;
    commandType?: string;
    commandData?: string;
    result?: string;
    category?: string;
    success: boolean;
    timestamp: number;
    ip?: string;
}

export interface ActivityQuery {
    clientId?: string;
    action?: string;
    targetAgentId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
}

export class ActivityLogger {
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly RETENTION_DAYS = 7;

    constructor(private dbManager: DatabaseManager) {
        this.startAutoCleanup();
    }

    private startAutoCleanup(): void {
        this.cleanupOldData();

        this.cleanupInterval = setInterval(() => {
            this.cleanupOldData();
        }, 24 * 60 * 60 * 1000);

        Logger.info(`[ActivityLogger] Auto-cleanup started (retention: ${this.RETENTION_DAYS} days, interval: 24h)`);
    }

    public logActivity(
        client: Connection,
        action: string,
        options: {
            targetAgentId?: string;
            targetAgentName?: string;
            commandType?: string;
            commandData?: any;
            result?: any;
            category?: string;
            success?: boolean;
        } = {}
    ): void {
        try {
            const id = `${client.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const timestamp = Date.now();
            
            const record: Omit<ActivityRecord, 'id'> = {
                clientId: client.id,
                clientName: client.name || client.id,
                clientMachineId: client.machineId,
                action: action,
                targetAgentId: options.targetAgentId,
                targetAgentName: options.targetAgentName,
                commandType: options.commandType,
                commandData: options.commandData ? JSON.stringify(options.commandData) : undefined,
                result: options.result ? JSON.stringify(options.result) : undefined,
                success: options.success !== false,
                timestamp: timestamp,
                ip: client.ip
            };

            const db = (this.dbManager as any).db;
            if (!db) {
                Logger.error('[ActivityLogger] Database not accessible');
                return;
            }

            const category = options.category || this._getCategoryFromAction(record.action, record.commandType);
            
            const stmt = db.prepare(`
                INSERT INTO activity_history 
                (id, clientId, clientName, clientMachineId, action, targetAgentId, 
                 targetAgentName, commandType, commandData, result, category, success, timestamp, ip)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                id,
                record.clientId,
                record.clientName,
                record.clientMachineId,
                record.action,
                record.targetAgentId || null,
                record.targetAgentName || null,
                record.commandType || null,
                record.commandData || null,
                record.result || null,
                category || null,
                record.success ? 1 : 0,
                record.timestamp,
                record.ip || null
            );

            Logger.debug(`[ActivityLogger] Logged activity: ${action} by ${client.name} (${client.id})`);
        } catch (error) {
            Logger.error(`[ActivityLogger] Failed to log activity: ${error}`);
        }
    }

    public logCommand(
        client: Connection,
        message: Message,
        targetAgent: Connection | null,
        success: boolean = true,
        result?: any
    ): void {
        this.logActivity(client, 'command_sent', {
            targetAgentId: targetAgent?.id,
            targetAgentName: targetAgent?.name,
            commandType: message.type,
            commandData: message.data,
            result: result,
            success: success
        });
    }

    public logAgentListRequest(client: Connection): void {
        this.logActivity(client, 'get_agent_list', {
            success: true
        });
    }

    public logBroadcast(client: Connection, message: Message, agentCount: number): void {
        this.logActivity(client, 'broadcast_command', {
            commandType: message.type,
            commandData: { ...message.data, agentCount },
            success: true
        });
    }

    public getActivityHistory(query: ActivityQuery): ActivityRecord[] {
        try {
            let sql = 'SELECT * FROM activity_history WHERE 1=1';
            const params: any[] = [];

            if (query.clientId) {
                sql += ' AND clientId = ?';
                params.push(query.clientId);
            }

            if (query.action) {
                sql += ' AND action = ?';
                params.push(query.action);
            }

            if (query.targetAgentId) {
                sql += ' AND targetAgentId = ?';
                params.push(query.targetAgentId);
            }

            if (query.startTime) {
                sql += ' AND timestamp >= ?';
                params.push(query.startTime);
            }

            if (query.endTime) {
                sql += ' AND timestamp <= ?';
                params.push(query.endTime);
            }

            sql += ' ORDER BY timestamp DESC';

            if (query.limit) {
                sql += ' LIMIT ?';
                params.push(query.limit);
            } else {
                sql += ' LIMIT 1000';  
            }

            if (query.offset) {
                sql += ' OFFSET ?';
                params.push(query.offset);
            }

            const db = (this.dbManager as any).db;
            if (!db) {
                Logger.error('[ActivityLogger] Database not accessible');
                return [];
            }

            const stmt = db.prepare(sql);
            const rows = stmt.all(...params) as any[];

            return rows.map(row => ({
                ...row,
                success: row.success === 1,
                commandData: row.commandData ? JSON.parse(row.commandData) : undefined,
                result: row.result ? JSON.parse(row.result) : undefined
            })) as ActivityRecord[];
        } catch (error) {
            Logger.error(`[ActivityLogger] Failed to get activity history: ${error}`);
            return [];
        }
    }

    public getActivityStats(clientId?: string, days: number = 30): {
        total: number;
        byAction: Record<string, number>;
        byDay: Record<string, number>;
    } {
        try {
            const since = Date.now() - (days * 24 * 60 * 60 * 1000);
            let sql = 'SELECT action, timestamp FROM activity_history WHERE timestamp >= ?';
            const params: any[] = [since];

            if (clientId) {
                sql += ' AND clientId = ?';
                params.push(clientId);
            }

            const db = (this.dbManager as any).db;
            if (!db) {
                Logger.error('[ActivityLogger] Database not accessible');
                return { total: 0, byAction: {}, byDay: {} };
            }

            const stmt = db.prepare(sql);
            const rows = stmt.all(...params) as { action: string; timestamp: number }[];

            const stats = {
                total: rows.length,
                byAction: {} as Record<string, number>,
                byDay: {} as Record<string, number>
            };

            rows.forEach(row => {
                stats.byAction[row.action] = (stats.byAction[row.action] || 0) + 1;

                const date = new Date(row.timestamp);
                const dayKey = date.toISOString().split('T')[0];
                stats.byDay[dayKey] = (stats.byDay[dayKey] || 0) + 1;
            });

            return stats;
        } catch (error) {
            Logger.error(`[ActivityLogger] Failed to get activity stats: ${error}`);
            return { total: 0, byAction: {}, byDay: {} };
        }
    }

    public cleanupOldData(): number {
        try {
            const cutoffTime = Date.now() - (this.RETENTION_DAYS * 24 * 60 * 60 * 1000);
            
            const db = (this.dbManager as any).db;
            if (!db) {
                Logger.error('[ActivityLogger] Database not accessible');
                return 0;
            }

            const stmt = db.prepare('DELETE FROM activity_history WHERE timestamp < ?');
            const result = stmt.run(cutoffTime);
            const deletedCount = result.changes || 0;

            if (deletedCount > 0) {
                Logger.info(`[ActivityLogger] Cleaned up ${deletedCount} old activity records (older than ${this.RETENTION_DAYS} days)`);
            }

            return deletedCount;
        } catch (error) {
            Logger.error(`[ActivityLogger] Failed to cleanup old data: ${error}`);
            return 0;
        }
    }

    public stopAutoCleanup(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            Logger.info('[ActivityLogger] Auto-cleanup stopped');
        }
    }

    private _getCategoryFromAction(action: string, commandType?: string): string {
        if (commandType) {
            const cmd = commandType.toUpperCase();
            if (cmd.includes('LIST') || cmd.includes('GET')) return 'query';
            if (cmd.includes('START') || cmd.includes('KILL') || cmd.includes('STOP')) return 'control';
            if (cmd.includes('SCREENSHOT') || cmd.includes('CAM') || cmd.includes('KEYLOG')) return 'monitoring';
            if (cmd.includes('FILE')) return 'filesystem';
            if (cmd.includes('SHUTDOWN') || cmd.includes('RESTART')) return 'system';
        }
        
        if (action.includes('list') || action.includes('get')) return 'query';
        if (action.includes('command') || action.includes('execute')) return 'control';
        return 'other';
    }
}

