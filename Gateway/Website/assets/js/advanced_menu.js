import * as Logic from './logic.js';

document.addEventListener("DOMContentLoaded", () => {

    const currentParams = new URLSearchParams(window.location.search);
    const agentId = currentParams.get('id');

    console.log("Current Agent ID:", agentId);
    if (Logic && typeof Logic.initAgentTargetFromURL === 'function') {
        Logic.initAgentTargetFromURL();
    }
    const menuCards = document.querySelectorAll('.menu-card');
    
    menuCards.forEach(card => {
        const originalHref = card.getAttribute('href');

        if (agentId && originalHref && originalHref !== '#') {
            const separator = originalHref.includes('?') ? '&' : '?';
            const newHref = `${originalHref}${separator}id=${agentId}`;
        
            card.setAttribute('href', newHref);
        }
        
        const featureName = card.querySelector('.title')?.textContent.trim() || "";
        card.addEventListener('mouseenter', () => typeEffect(featureName));
        card.addEventListener('mouseleave', () => typeEffect("What to do?"));
    });

    const screenText = document.querySelector('.laptop-screen-text');
    const defaultText = "What to do?";
    let typingInterval;

    typeEffect(defaultText);

    if (Logic && typeof Logic.initAgentTargetFromURL === 'function') {
        Logic.initAgentTargetFromURL();
    }

    const currentAgentId = new URLSearchParams(window.location.search).get('id');

    menuCards.forEach(card => {
        if (currentAgentId) {
            const currentHref = card.getAttribute('href');
            if (currentHref && currentHref !== '#') {
                const separator = currentHref.includes('?') ? '&' : '?';
                card.setAttribute('href', `${currentHref}${separator}id=${currentAgentId}`);
            }
        }

        const featureName = card.querySelector('.title').textContent.trim();

        card.addEventListener('mouseenter', () => {
            typeEffect(featureName);
        });

        card.addEventListener('mouseleave', () => {
            typeEffect(defaultText);
        });
    });

    function typeEffect(text) {
        if (!screenText) return;

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
});