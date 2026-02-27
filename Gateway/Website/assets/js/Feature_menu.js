import * as Logic from './logic.js';

document.addEventListener("DOMContentLoaded", () => {
    const urlMap = {
        "Application Control": "./App_Menu.html",
        "Process Control":     "./Proc_Menu.html",
        "Keylog Control":      "./keylog.html",
        "Screen Control":      "./screen_webcam.html?mode=screen",
        "Webcam Control":      "./screen_webcam.html?mode=webcam",
        "Power Control":       "./power_control.html"
    };

    const screenText = document.querySelector('.code-text');
    const featureItems = document.querySelectorAll('.feature-content');
    const defaultText = "What to do?";
    let typingInterval;

    typeEffect(defaultText);

    Logic.initAgentTargetFromURL();

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


    featureItems.forEach(item => {
        const featureName = item.querySelector('.feature-text').textContent.trim();

        item.addEventListener('mouseenter', () => {
            typeEffect(featureName);
        });

        item.addEventListener('mouseleave', () => {
            typeEffect(defaultText);
        });

        item.addEventListener('click', () => {
            const targetUrl = urlMap[featureName] || '#';
            const currentAgentId = new URLSearchParams(window.location.search).get('id');
            
            if(targetUrl !== '#') {
                let finalUrl = targetUrl;
                if (currentAgentId) {
                    const separator = targetUrl.includes('?') ? '&' : '?';
                    finalUrl = `${targetUrl}${separator}id=${currentAgentId}`;
                }
                window.location.href = finalUrl;
            } else {
                console.log(`Chưa cấu hình link cho: ${featureName}`);
                alert(`Chức năng "${featureName}" đang được phát triển!`);
            }
        });
    });
});

function navigateToAdvanced() {
    const currentParams = new URLSearchParams(window.location.search);
    const agentId = currentParams.get('id');

    let targetUrl = 'advanced_menu.html';

    if (agentId) {
        targetUrl += `?id=${agentId}`;
    }

    window.location.href = targetUrl;
}

function Disconnect() {
    if (window.gateway && window.gateway.disconnect) {
        window.gateway.disconnect();
    }
    window.location.href = 'index.html';
}

window.Disconnect = Disconnect;