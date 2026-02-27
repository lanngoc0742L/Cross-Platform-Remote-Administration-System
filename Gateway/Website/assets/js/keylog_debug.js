const MOCK_DATA_STRING = `Hello world!\nToi la sinh vien.\nDang nhap tai khoan:\nUser: admin@gmail.com\nPass: matkhau123456\n`;

class KeyloggerSimulation {
    constructor() {
        this.isLogging = false;
        this.logBuffer = ""; 
        
        this.mockIndex = 0; 
        this.typingTimer = null; 

        this.displayInput = document.querySelector('.key-display');
        this.btnStart = document.querySelector('.action-buttons button:nth-child(1)');
        this.btnStop = document.querySelector('.action-buttons button:nth-child(2)');
        this.btnSave = document.querySelector('.action-buttons button:nth-child(3)');
        this.keys = document.querySelectorAll('.key');

        this.init();
    }

    init() {
        this.btnStart.onclick = () => this.startSimulation();
        this.btnStop.onclick = () => this.stopSimulation();
        this.btnSave.onclick = () => this.saveToDevice();

        this.injectActiveStyle();
        
        this.logSystem("Simulation Mode Ready. Server connection disabled.");
    }


    startSimulation() {
        if (this.isLogging) return;

        this.isLogging = true;
        this.btnStart.style.backgroundColor = "#22c55e"; 
        this.btnStart.innerText = "Simulating...";
        
        this.logSystem(">>> Started Replaying Mock Data...");

        if (this.mockIndex >= MOCK_DATA_STRING.length) {
            this.mockIndex = 0;
            this.displayInput.value = "";
            this.logBuffer = "";
        }

        this.processNextChar();
    }

    stopSimulation() {
        this.isLogging = false;
        clearTimeout(this.typingTimer);
        
        this.btnStart.style.backgroundColor = ""; 
        this.btnStart.innerText = "Start keylog";
        this.logSystem(">>> Simulation Paused.");
    }
    processNextChar() {
        if (!this.isLogging) return;

        if (this.mockIndex >= MOCK_DATA_STRING.length) {
            this.logSystem("End of simulation string.");
            this.stopSimulation();
            return;
        }

        const char = MOCK_DATA_STRING[this.mockIndex];
        this.mockIndex++;

        this.handleIncomingKey(char);

        const randomDelay = Math.floor(Math.random() * 150) + 50;
        
        this.typingTimer = setTimeout(() => {
            this.processNextChar();
        }, randomDelay);
    }

    handleIncomingKey(char) {
        this.logBuffer += char;

        this.updateDisplay(char);

        this.visualizeKey(char);
    }

    updateDisplay(char) {
        if (char === '\n' || char === '\r') {
            this.displayInput.value += "[ENTER] "; 
        } else if (char === '\t') {
            this.displayInput.value += " [TAB] ";
        } else {
            this.displayInput.value += char;
        }
        this.displayInput.scrollLeft = this.displayInput.scrollWidth;
    }

    visualizeKey(char) {
        let targetKey = null;
        const lowerChar = char.toLowerCase();

        const specialMap = {
            '\n': 'enter',
            '\r': 'enter',
            ' ': 'space', 
            '\t': 'tab',
            '\b': 'backspace',
        };

        for (let key of this.keys) {
            let keyText = key.innerText.toLowerCase().trim();
            if (char === ' ' && keyText === '' && key.classList.contains('k-6-25')) {
                targetKey = key;
                break;
            }

            if (keyText === lowerChar || keyText === specialMap[lowerChar]) {
                targetKey = key;
                break;
            }
        }

        if (targetKey) {
            targetKey.classList.add('active-simulation');
            setTimeout(() => {
                targetKey.classList.remove('active-simulation');
            }, 150); 
        }
    }

    // --- File Operations ---

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
        a.download = `simulation_log_${timestamp}.txt`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- Helpers ---

    logSystem(msg) {
        console.log(`[Sim] ${msg}`);
    }

    injectActiveStyle() {
        const style = document.createElement('style');
        style.innerHTML = `
            .key.active-simulation {
                background-color: #E57D36 !important;
                color: #fff !important;
                transform: translateY(3px);
                box-shadow: none !important;
                transition: all 0.05s ease;
            }
        `;
        document.head.appendChild(style);
    }
}

// Start App
document.addEventListener('DOMContentLoaded', () => {
    window.keylogSim = new KeyloggerSimulation();
});