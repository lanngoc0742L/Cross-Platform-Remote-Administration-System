import * as Logic from './logic.js';

const hoverTexts = {
    'btn-restart':  'Restarting...',
    'btn-shutdown': 'Shutting Down...',
    'btn-sleep':    'Sleeping...'
};

const screenText = document.querySelector('.screen-text');
const featureItems = document.querySelectorAll('.feature-content');
const defaultText = "What to do?";
let typingInterval;

function initAgentTarget() {
    Logic.initAgentTargetFromURL();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAgentTarget);
} else {
    initAgentTarget();
}

typeEffect(defaultText);

function typeEffect(text) {
    screenText.classList.add('typing-effect');
    screenText.style.width = 'auto';

    clearInterval(typingInterval);
    screenText.textContent = "";

    let i = 0;
    const speed = 50;

    typingInterval = setInterval(() => {
        if (i < text.length) {
            screenText.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(typingInterval);
        }
    }, speed);
}

// ================== CONFIRM PANEL ==================

let pendingAction = null;

const confirmPanel = document.getElementById("confirmPanel");
const confirmOverlay = document.getElementById("confirmOverlay");
const yesBtn = document.querySelector(".confirm-btn.yes");
const noBtn  = document.querySelector(".confirm-btn.no");

function openConfirm() {
    confirmOverlay.classList.remove("hidden");
    confirmPanel.classList.remove("hidden");
}

function closeConfirm() {
    confirmOverlay.classList.add("hidden");
    confirmPanel.classList.add("hidden");
}

yesBtn.addEventListener("click", () => {
    if (pendingAction) {
        pendingAction();
        pendingAction = null;
    }
    closeConfirm();
});

noBtn.addEventListener("click", () => {
    pendingAction = null;
    closeConfirm();
});

// ================== MAIN LOGIC ==================

document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll(".img-btn");

    typeEffect(defaultText);

    buttons.forEach(btn => {

        btn.addEventListener("mouseenter", () => {
            const text = hoverTexts[btn.id] || defaultText;
            typeEffect(text);
        });

        btn.addEventListener("mouseleave", () => {
            typeEffect(defaultText);
        });

        btn.addEventListener("click", () => {

            if (btn.id === "btn-back") {
                backToMenu();
                return;
            }

            pendingAction = () => {
                if (btn.id === "btn-restart") {
                    Logic.restartAgent();
                    return; 
                } else if (btn.id === "btn-shutdown") {
                    Logic.shutdownAgent();
                    return; 
                } else if (btn.id === "btn-sleep") {
                    Logic.sleepAgent();
                    return; 
                }
            };

            openConfirm();
        });
    });
});

// ================== BACK TO MENU ==================

function backToMenu() {
    const agentId = sessionStorage.getItem('current_agent_id') || 
                    new URLSearchParams(window.location.search).get('id');
    let menuUrl = 'Feature_menu.html';
    if (agentId) {
        menuUrl += `?id=${agentId}`;
    }
    window.location.href = menuUrl;
}