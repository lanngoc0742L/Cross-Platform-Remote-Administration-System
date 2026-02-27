import * as Logic from './logic.js';

// ================== BACK TO MENU ==================

document.addEventListener('DOMContentLoaded', () => {
    const returnBtn = document.getElementById('return-btn');
    const clearBtn = document.getElementById('clear-btn');

    if (!returnBtn) {
        console.warn('[Proc_Menu] return-btn not found');
        return;
    }
    if (!clearBtn) {
        console.warn('[Proc_Menu] clear-btn not found');
        return;
    }

    returnBtn.addEventListener('click', () => {
        window.location.href = './Feature_menu.html';
    });

    clearBtn.addEventListener('click', () => {
        resetSearch();
    });
});

function resetSearch() {
    searchInput.value = '';
    currentData = [...originalData];
    currentPage = 1;
    renderData();
}

// --- 1. Dữ liệu (Mock Data) ---
const mockProcessData = [
    { id: 1, name: "YouTube", pid: 1234, status: 'running' },
    { id: 2, name: "Chrome", pid: 4521, status: 'running' },
    { id: 3, name: "VS Code", pid: 8892, status: 'paused' },
    { id: 4, name: "Spotify", pid: 3321, status: 'running' },
    { id: 5, name: "Discord", pid: 1102, status: 'paused' },
    { id: 6, name: "Task Mgr", pid: 2121, status: 'running' },
    { id: 7, name: "Node.js", pid: 9928, status: 'paused' },
    { id: 8, name: "Python", pid: 2211, status: 'running' },
    { id: 9, name: "Docker", pid: 5543, status: 'running' },
    { id: 10, name: "Figma", pid: 7765, status: 'paused' },
    { id: 11, name: "Word", pid: 1212, status: 'running' },
    { id: 12, name: "Excel", pid: 3434, status: 'paused' }
];

// --- 2. Cấu hình ---
const ITEMS_PER_PAGE = 6;
let currentPage = 1;
let currentData = [];
let originalData = []; 
let isRendering = false;

// --- 3. DOM Elements ---
const listContainer = document.getElementById('process-list');
const searchInput = document.getElementById('search-input');
const pageIndicator = document.getElementById('page-indicator');
const prevBtn = document.querySelector('.prev-btn');
const nextBtn = document.querySelector('.next-btn');

// --- 4. Render ---
async function renderData() {
    if (!listContainer) return;
    
    if (isRendering) {
        console.log('[Proc_Menu] Render already in progress, skipping...');
        return;
    }
    
    isRendering = true;
    
    try {
        listContainer.innerHTML = ''; 

        const totalPages = Math.ceil(currentData.length / ITEMS_PER_PAGE) || 1;
        
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const itemsToShow = currentData.slice(startIndex, endIndex);

        if (itemsToShow.length === 0) {
            listContainer.innerHTML = '<li class="process-item empty">No process found.</li>';
            updatePagination(0);
            return;
        }

        for (let idx = 0; idx < itemsToShow.length; idx++) {
        const proc = itemsToShow[idx];

        const li = document.createElement('li');
        li.className = 'process-item';

        const playSrc = './assets/images/play.png';
        const pauseSrc = './assets/images/pause.png';

        // ===================== PROC ID =====================
        let procId = proc.id;
        if (procId === undefined || procId === null) {
            const globalIndex = originalData.indexOf(proc);
            procId = globalIndex >= 0 ? globalIndex : (startIndex + idx);
        }

        procId = typeof procId === 'number' ? procId : parseInt(procId, 10);
        if (isNaN(procId) || procId < 0) {
            console.warn('[Proc_Menu] Invalid proc.id, using fallback index:', proc);
            procId = startIndex + idx;
        }

        // ===================== PROC NAME =====================
        let procName = proc.name || proc.processName || 'Unknown Process';

        procName = procName.replace(/^\d+\.\s*PID:\s*\d+\s*\|\s*Name:\s*/i, '');
        procName = procName.replace(/^PID:\s*\d+\s*\|\s*Name:\s*/i, '');
        procName = procName.trim();

        const escapedProcName = procName
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        // ===================== STATUS CLASS =====================
        const startClass = proc.status === 'running' ? 'active' : 'inactive';
        const pauseClass = proc.status === 'paused' ? 'active' : 'inactive';

        li.innerHTML = `
            <div class="proc-left">
                <span class="proc-name">${escapedProcName}</span>
            </div>

            <span class="proc-pid">
                ${proc.pid ?? proc.PID ?? '-'}
            </span>

            <div class="proc-actions">
                <button class="action-btn ${startClass}"
                    data-proc-id="${procId}"
                    data-action="start"
                    data-proc-name="${escapedProcName}"
                    title="Start ${escapedProcName}">
                    <img src="${playSrc}" alt="Start" width="28" height="28">
                </button>

                <button class="action-btn ${pauseClass}"
                    data-proc-id="${procId}"
                    data-action="stop"
                    data-proc-name="${escapedProcName}"
                    title="Stop ${escapedProcName}">
                    <img src="${pauseSrc}" alt="Stop" width="28" height="28">
                </button>
            </div>
        `;

        // ===================== EVENTS =====================
        const startBtn = li.querySelector('[data-action="start"]');
        const stopBtn = li.querySelector('[data-action="stop"]');

        if (startBtn) {
            startBtn.addEventListener('click', () => {
                const id = parseInt(startBtn.dataset.procId, 10);
                const name = startBtn.dataset.procName;
                if (!isNaN(id) && id >= 0) {
                    controlProcess(id, 'running', name);
                } else {
                    console.error('[Proc_Menu] Invalid process ID:', startBtn.dataset.procId);
                }
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                const id = parseInt(stopBtn.dataset.procId, 10);
                const name = stopBtn.dataset.procName;
                if (!isNaN(id) && id >= 0) {
                    controlProcess(id, 'paused', name);
                } else {
                    console.error('[Proc_Menu] Invalid process ID:', stopBtn.dataset.procId);
                }
            });
        }

            await delay(50);
            listContainer.appendChild(li);
        }

        const renderedItems = listContainer.querySelectorAll('.process-item:not(.empty)').length;
        if (renderedItems > ITEMS_PER_PAGE) {
            console.error(`[Proc_Menu] ERROR: Rendered ${renderedItems} items, expected max ${ITEMS_PER_PAGE}. Forcing correction.`);
            const items = Array.from(listContainer.querySelectorAll('.process-item:not(.empty)'));
            items.slice(ITEMS_PER_PAGE).forEach(item => item.remove());
        }

        updatePagination(totalPages);
    } finally {
        isRendering = false;
    }
}

// --- 5. Pagination Logic ---
function updatePagination(totalPages) {
    pageIndicator.textContent = `Page ${currentPage}/${totalPages}`;
    prevBtn.disabled = (currentPage === 1);
    nextBtn.disabled = (currentPage === totalPages || totalPages === 0);
}

// --- 6. Search Logic ---
searchInput.addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase().trim();
    
    if (!keyword) {
        currentData = [...originalData];
    } else {
        currentData = originalData.filter(item => {
            const name = (item.name || item.processName || '').toLowerCase();
            const pid = item.pid ? item.pid.toString() : '';
            return name.includes(keyword) || pid.includes(keyword);
        });
    }
    currentPage = 1;
    renderData();
});

// --- 7. Toggle Control ---
function controlProcess(id, newStatus, procName) {
    const proc = originalData.find(p => p.id === id);
    const processPid = proc?.pid || 'N/A';

    let success = false;
    if (newStatus === 'running') {
        success = Logic.startProcess(id);
        if (success) {
            console.log(`[Proc_Menu] Starting process: ${procName} (Index: ${id}, PID: ${processPid})`);
            typeEffect('Starting process...')
        }
    } else {
        success = Logic.killProcess(id);
        if (success) {
            console.log(`[Proc_Menu] Stopping process: ${procName} (Index: ${id}, PID: ${processPid})`);
            typeEffect('Stopping process...')
        }
    }

    if (!success) {
        alert('Không thể thực hiện thao tác. Vui lòng kiểm tra kết nối.');
        return;
    }
}

// --- 10. Refresh Process List from Gateway ---
async function refreshProcessList(isInitialLoad = false) {
    typeEffect('Loading list...');
    const processes = await Logic.fetchProcessList(isInitialLoad);
    
    if (processes !== null && processes !== undefined) {
        originalData = processes;
        currentData = [...processes];
        console.log(`[Proc_Menu] ✓ Loaded ${processes.length} processes from gateway`);
        typeEffect('Done!');
        
        if (isInitialLoad && processes.length === 0) {
            console.log('[Proc_Menu] Initial load returned empty, waiting a bit more...');
            setTimeout(async () => {
                const retryProcs = await Logic.fetchProcessList(false); // Retry with shorter timeout
                if (retryProcs && retryProcs.length > 0) {
                    originalData = retryProcs;
                    currentData = [...retryProcs];
                    console.log(`[Proc_Menu] ✓ Retry loaded ${retryProcs.length} processes`);
                    currentPage = 1;
                    renderData();
                    return;
                }
            }, 1000);
        }
    } else {
        console.warn('[Proc_Menu] Gateway not available, using mock data');
        originalData = [...mockProcessData];
        currentData = [...mockProcessData];
    }
    
    currentPage = 1;
    renderData();
}

// --- 8. Event Listeners ---
prevBtn.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderData(); }
});

nextBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(currentData.length / ITEMS_PER_PAGE);
    if (currentPage < totalPages) { currentPage++; renderData(); }
});

function initAgentTarget(onTargetSet) {
    Logic.initAgentTargetFromURL(onTargetSet);
}

// --- 11. Auto-update when processListCache changes ---
let lastProcessListCacheLength = 0;
function checkProcessListUpdate() {
    const formattedProcs = Logic.checkProcessListUpdate();
    if (formattedProcs && formattedProcs.length > 0) {
        const currentLength = formattedProcs.length;
        if (currentLength !== lastProcessListCacheLength) {
            lastProcessListCacheLength = currentLength;
            originalData = formattedProcs;
            const searchKeyword = searchInput.value.toLowerCase().trim();
            if (searchKeyword) {
                currentData = originalData.filter(item => {
                    const name = (item.name || item.processName || '').toLowerCase();
                    const pid = item.pid ? item.pid.toString() : '';
                    return name.includes(searchKeyword) || pid.includes(searchKeyword);
                });
            } else {
                currentData = [...formattedProcs];
            }
            const totalPages = Math.ceil(currentData.length / ITEMS_PER_PAGE) || 1;
            if (currentPage > totalPages) currentPage = 1;
            renderData();
            console.log(`[Proc_Menu] Auto-updated: ${formattedProcs.length} processes`);
        }
    }
}

setInterval(checkProcessListUpdate, 300);

document.addEventListener('DOMContentLoaded', () => {
    const waitForGatewayAndLoad = () => {
        if (window.gateway && window.gateway.isAuthenticated) {
            initAgentTarget(() => {
                setTimeout(() => {
                    refreshProcessList(true); 
                }, 200);
            });
        } else {
            setTimeout(waitForGatewayAndLoad, 200);
        }
    };
    
    waitForGatewayAndLoad();

    if (screenText) {
        typeEffect('Successful');
    }
});

window.refreshProcessList = refreshProcessList;
window.controlProcess = controlProcess;

const screenText = document.querySelector('.code-text');
let typingInterval;

function typeEffect(text, screenText) {
    if (!screenText) {
        screenText = document.querySelector('.code-text');
        if (!screenText) return;
    }
    
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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}