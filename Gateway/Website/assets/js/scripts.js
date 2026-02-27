// Wire animation effect
const connectBtn = document.querySelector('.btn-connect');
const wire = document.querySelector('.wire');

connectBtn.addEventListener('click', () => {
    if (wire) {
        wire.classList.remove('off');
        void wire.offsetWidth;
        wire.classList.add('active');
    }
    setTimeout(openAgentList, 500);
});

// Agent list popup
const serverOverlay = document.getElementById('server-list-overlay');
const serverListContent = document.getElementById('server-list-content');

// Hàm mở popup
function openAgentList() {
    serverOverlay.classList.remove('hidden');
    serverOverlay.classList.add('visible');
    
    // Fetch agents từ gateway nếu đã kết nối
    if (window.gateway && window.gateway.ws && window.gateway.ws.readyState === WebSocket.OPEN && window.gateway.isAuthenticated) {
        window.gateway.refreshAgents();
    } else {
        // Nếu chưa kết nối, hiển thị message
        serverListContent.innerHTML = 
        '<li class="server-item empty">Please connect to gateway first.</li>';
    }
    
    // Render agents nếu có
    fetchAndRenderAgents();
}

// Hàm đóng popup
function closeAgentList() {
    serverOverlay.classList.remove('visible');
    setTimeout(() => {
        serverOverlay.classList.add('hidden');
        if (wire) {
            wire.classList.remove('active');
            void wire.offsetWidth;
            wire.classList.add('off');
        }  
    }, 300); // Ẩn hẳn sau khi hết animation
}

// --- Logic Render dữ liệu & Phân trang ---

// Cấu hình phân trang
const ITEMS_PER_PAGE = 5; // Số agent hiển thị trên 1 trang
let currentPage = 1;

// Function để reset page về 1
function resetToFirstPage() {
    currentPage = 1;
}

// Các phần tử DOM cần thiết cho phân trang
const prevBtn = document.querySelector('.prev-btn');
const nextBtn = document.querySelector('.next-btn');
const pageIndicator = document.getElementById('page-indicator');

// Lấy agent data từ appState (từ main.js)
function getAgentData() {
    // Kiểm tra xem window.appState có tồn tại không
    if (window.appState && window.appState.agents) {
        return window.appState.agents;
    }
    return [];
}

function fetchAndRenderAgents() {
    const agents = getAgentData();
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentAgents = agents.slice(startIndex, endIndex);
    renderList(currentAgents);
    updateFooterUI(agents.length);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
} // thêm hiệu ứng hiện lên lần lượt cho đẹp

async function renderList(agents) {
    serverListContent.innerHTML = '';

    if (agents.length === 0) {
        serverListContent.innerHTML =
            '<li class="server-item empty">No agents found.</li>';
        return;
    }

    for (const [index, agent] of agents.entries()) {
        const li = document.createElement('li');
        li.className = 'server-item';

        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.padding = '12px 5px';

        li.innerHTML = `
            <span class="server-machineid"
                style="flex: 0 0 40%; font-weight: 500; font-size: 16px; text-align: center;">
                ${agent.machineId || 'N/A'}
            </span>

            <span class="server-ip"
                style="flex: 0 0 40%; color: #555; font-size: 16px; text-align: center;">
                IP: ${agent.ip}
            </span>

            <button class="link-icon"
                data-agent-id="${agent.id}"
                style="margin-left: auto; border: none; cursor: pointer;">
                <img src="./assets/images/link.png"
                     width="32" height="32" style="display: block;">
            </button>
        `;

        li.querySelector('.link-icon').addEventListener('click', () => {
            if (agent.id) {
                window.location.href =
                    './Feature_menu.html?id=' + agent.id;
            }
        });

        serverListContent.appendChild(li);
        await delay(50);
    }
}


function updateFooterUI(totalAgents) {
    const totalPages = Math.ceil(totalAgents / ITEMS_PER_PAGE) || 1;
    pageIndicator.textContent = `Page ${currentPage}/${totalPages}`;

    if (currentPage === 1) {
        prevBtn.disabled = true;
        prevBtn.style.opacity = '0.5';
    } else {
        prevBtn.disabled = false;
        prevBtn.style.opacity = '1';
    }

    if (currentPage === totalPages || totalPages === 0) {
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.5';
    } else {
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    }
}

prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        fetchAndRenderAgents();
    }
});

nextBtn.addEventListener('click', () => {
    const agents = getAgentData();
    const totalPages = Math.ceil(agents.length / ITEMS_PER_PAGE) || 1;
    if (currentPage < totalPages) {
        currentPage++;
        fetchAndRenderAgents();
    }
});

// Refresh button handler
const refreshBtn = document.querySelector('.refresh-btn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        // Reset về page 1 khi refresh
        resetToFirstPage();
        
        if (window.gateway && window.gateway.ws && window.gateway.ws.readyState === WebSocket.OPEN && window.gateway.isAuthenticated) {
            // Gọi refreshAgents từ gateway để fetch dữ liệu mới nhất
            window.gateway.refreshAgents();
        } else {
            // Nếu chưa kết nối, vẫn render lại với data hiện tại
            fetchAndRenderAgents();
        }
    });
}

// Hàm reloadServers để refresh agents (được gọi từ nút refresh trong dashboard)
function reloadServers() {
    // Reset về page 1 khi refresh
    resetToFirstPage();
    
    if (window.gateway && window.gateway.ws && window.gateway.ws.readyState === WebSocket.OPEN && window.gateway.isAuthenticated) {
        // Gọi refreshAgents từ gateway để fetch dữ liệu mới nhất
        window.gateway.refreshAgents();
    } else {
        // Nếu chưa kết nối, vẫn render lại với data hiện tại
        fetchAndRenderAgents();
    }
}

// Export hàm vào window ngay lập tức để có thể gọi từ bất kỳ đâu
window.reloadServers = reloadServers;

// Event listener cho nút reload - sử dụng event delegation để đảm bảo luôn hoạt động
document.addEventListener('click', (e) => {
    // Kiểm tra nếu click vào nút reload-btn hoặc phần tử con của nó
    if (e.target.closest('#reload-btn')) {
        e.preventDefault();
        reloadServers();
    }
});

// Export functions for main.js to use
window.openAgentList = openAgentList;
window.closeAgentList = closeAgentList;
window.fetchAndRenderAgents = fetchAndRenderAgents;
window.resetAgentListPage = resetToFirstPage;
// reloadServers đã được export ở trên

// --- 5. Sự kiện mở menu ---

document.addEventListener('DOMContentLoaded', () => {
    const goMenuBtn = document.getElementById('link-icon');
    if (goMenuBtn) {
        goMenuBtn.addEventListener('click', () => {
            const agentId = sessionStorage.getItem('current_agent_id') || 
                            new URLSearchParams(window.location.search).get('id');
            let menuUrl = 'Feature_menu.html';
            if (agentId) {
                menuUrl += `?id=${agentId}`;
            }
            window.location.href = menuUrl;
        });
    }
});
