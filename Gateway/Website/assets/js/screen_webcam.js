import * as Logic from './logic.js';

let searchString = window.location.search;
if (searchString.split('?').length > 2) {
    const urlParts = window.location.href.split('?');
    if (urlParts.length > 1) {
        searchString = '?' + urlParts[1];
    }
}

const urlParams = new URLSearchParams(searchString);
let mode = urlParams.get('mode'); 

if (!mode || (mode !== 'screen' && mode !== 'webcam')) {
    const modeMatch = window.location.href.match(/[?&]mode=([^&?]+)/);
    if (modeMatch && modeMatch[1]) {
        mode = modeMatch[1].split('?')[0].split('&')[0]; 
    }
}

console.log('[Screen_Webcam] Mode:', mode);
console.log('[Screen_Webcam] URL:', window.location.href);
console.log('[Screen_Webcam] Search:', searchString);

let selectedDirectoryHandle = null;
let selectedDirectoryName = null; 
let lastBlobUrl = null;

async function triggerSelectFolder() {
    if ('showDirectoryPicker' in window) {
        try {
            selectedDirectoryHandle = await window.showDirectoryPicker();
            selectedDirectoryName = selectedDirectoryHandle.name;
            
            const folderLabel = document.getElementById('display-folder-path');
            folderLabel.innerText = selectedDirectoryName + '/';
            folderLabel.style.color = 'var(--text-orange)';
            
            console.log('Directory selected:', selectedDirectoryName);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error selecting directory:', error);
                alert('Lỗi khi chọn thư md: ' + error.message);
            }
        }
    } else {
        alert('Trình duyệt không hỗ trợ chọn thư mục. Vui lòng sử dụng Chrome, Edge hoặc trình duyệt Chromium khác.');
    }
}

async function handleSaveAction() {
    const cameraFeed = document.getElementById('camera-feed');
    const img = cameraFeed.querySelector('img');
    const video = cameraFeed.querySelector('video');
    
    if (!img && !video) {
        alert('No preview available to save');
        return;
    }

    let fileName = document.getElementById('input-file-name').value;
    
    if (!fileName || fileName.trim() === "") {
        fileName = img ? "capture_default.png" : "capture_default.mp4";
        document.getElementById('input-file-name').value = fileName;
    }

    if ('showDirectoryPicker' in window) {
        if (!selectedDirectoryHandle) {
            alert('Vui lòng chọn thư mục lưu file trước (nhấn vào đường dẫn ở góc dưới)');
            return;
        }

        try {
            let blob;
            if (img) {
                const response = await fetch(img.src);
                blob = await response.blob();
            } else if (video) {
                const response = await fetch(video.src);
                blob = await response.blob();
            }

            const fileHandle = await selectedDirectoryHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();

            const folderLabel = document.getElementById('display-folder-path');
            if (selectedDirectoryName) {
                folderLabel.innerText = selectedDirectoryName + '/';
                folderLabel.style.color = 'var(--text-blue)';
            }

            console.log("File saved successfully to:", fileName);
            alert('Đã lưu file: ' + fileName);
        } catch (error) {
            console.error('Error saving file:', error);
            alert('Lỗi khi lưu file: ' + error.message);
        }
    } else {
        if (img) {
            const link = document.createElement('a');
            link.href = img.src;
            link.download = fileName;
            link.click();
        } else if (video) {
            const link = document.createElement('a');
            link.href = video.src;
            link.download = fileName;
            link.click();
        }

        console.log("File downloaded (fallback method)");
        alert('Trình duyệt không hỗ trợ chọn thư mục. File sẽ được lưu vào thư mục Downloads mặc định.');
    }
}

let lastCaptureTime = 0;
const CAPTURE_DEBOUNCE_MS = 2000;
let captureTimeoutId = null;
let isWaitingForCapture = false;

function capture() {
    try {
        const now = Date.now();
        if (now - lastCaptureTime < CAPTURE_DEBOUNCE_MS) {
            const remaining = Math.ceil((CAPTURE_DEBOUNCE_MS - (now - lastCaptureTime)) / 1000);
            alert(`Vui lòng đợi ${remaining} giây trước khi capture lại.`);
            return;
        }

        if (!window.gateway || !window.gateway.ws || window.gateway.ws.readyState !== WebSocket.OPEN) {
            alert('Chưa kết nối đến Gateway. Vui lòng kiểm tra kết nối.');
            return;
        }

        if (!window.gateway.isAuthenticated) {
            alert('Chưa đăng nhập. Vui lòng đợi kết nối hoàn tất.');
            return;
        }

        if (!mode) {
            console.error('[Capture] Mode không được xác định');
            alert('Mode không hợp lệ. Vui lòng kiểm tra URL (cần có ?mode=screen hoặc ?mode=webcam)');
            return;
        }

        if (captureTimeoutId) {
            clearTimeout(captureTimeoutId);
        }

        isWaitingForCapture = true;
        lastCaptureTime = now;

        let success = false;
        if (mode === 'screen') {
            console.log('[Capture] Sending SCREENSHOT command');
            success = Logic.captureScreen();
            document.getElementById('input-file-name').value = 'screenshot_' + Date.now() + '.png';
        } else if (mode === 'webcam') {
            console.log('[Capture] Sending CAMSHOT command');
            success = Logic.captureWebcam();
            document.getElementById('input-file-name').value = 'webcam_' + Date.now() + '.png';
        } else {
            console.error('[Capture] Mode không hợp lệ:', mode);
            alert('Mode không hợp lệ: ' + mode);
            isWaitingForCapture = false;
            return;
        }

        if (!success) {
            isWaitingForCapture = false;
            alert('Không thể thực hiện capture. Vui lòng kiểm tra kết nối.');
            return;
        }

        captureTimeoutId = setTimeout(() => {
            if (isWaitingForCapture) {
                isWaitingForCapture = false;
                console.warn('[Capture] Timeout: Không nhận được response sau 10 giây');
                
                if (!window.gateway || !window.gateway.ws || window.gateway.ws.readyState !== WebSocket.OPEN) {
                    handleCaptureError('Kết nối bị đứt. Vui lòng thử lại sau khi kết nối lại.');
                } else {
                    handleCaptureError('Không nhận được dữ liệu từ agent. Có thể agent đã crash hoặc không thể capture màn hình.');
                }
            }
        }, 10000); 

    } catch (error) {
        isWaitingForCapture = false;
        if (captureTimeoutId) {
            clearTimeout(captureTimeoutId);
        }
        console.error('[Capture] Error:', error);
        alert('Lỗi khi capture: ' + error.message);
    }
}

function record() {
    try {
        if (!mode) {
            console.error('[Record] Mode không được xác định');
            alert('Mode không hợp lệ. Vui lòng kiểm tra URL (cần có ?mode=screen hoặc ?mode=webcam)');
            return;
        }

        const durationInput = document.querySelector('.duration-input');
        if (!durationInput) {
            console.error('[Record] Không tìm thấy duration-input');
            alert('Không tìm thấy input thời gian');
            return;
        }

        const value = durationInput.value;

        const duration = parseInt(value, 10);
        if (isNaN(duration) || duration < 1) {
            alert('Vui lòng nhập thời gian hợp lệ (>= 1 giây)');
            return;
        }

        const finalDuration = Math.min(duration, 15);

        let success = false;
        if (mode === 'screen') {
            console.log('[Record] Sending SCR_RECORD command with duration:', finalDuration);
            success = Logic.recordScreen(finalDuration);
            document.getElementById('input-file-name').value = 'screen_record_' + Date.now() + '.mp4';
        } else if (mode === 'webcam') {
            console.log('[Record] Sending CAM_RECORD command with duration:', finalDuration);
            success = Logic.recordWebcam(finalDuration);
            document.getElementById('input-file-name').value = 'webcam_record_' + Date.now() + '.mp4';
        } else {
            console.error('[Record] Mode không hợp lệ:', mode);
            alert('Mode không hợp lệ: ' + mode);
            return;
        }

        if (!success) {
            alert('Không thể thực hiện record. Vui lòng kiểm tra kết nối.');
        }
    } catch (error) {
        console.error('[Record] Error:', error);
        alert('Lỗi khi record: ' + error.message);
    }
}

window.renderStreamFrame = function(arrayBuffer) {
    // Reset trạng thái capture (để tránh xung đột UI)
    if (captureTimeoutId) {
        clearTimeout(captureTimeoutId);
        captureTimeoutId = null;
    }
    isWaitingForCapture = false;

    const cameraFeed = document.getElementById('camera-feed');
    if (!cameraFeed) return;

    // 1. Xóa video, lỗi cũ nếu có
    const elementsToRemove = cameraFeed.querySelectorAll('video, .error-message, .placeholder-text');
    elementsToRemove.forEach(el => el.remove());

    // 2. Tìm hoặc tạo thẻ IMG
    let img = cameraFeed.querySelector('img');
    if (!img) {
        img = document.createElement('img');
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        img.draggable = false; // Tắt kéo ảnh để không ảnh hưởng thao tác chuột
        img.alt = "Stream Feed";
        cameraFeed.appendChild(img);
    }

    try {
        // 3. Tạo Blob từ ArrayBuffer
        const blob = new Blob([arrayBuffer], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);

        img.src = url;

        // 4. Cơ chế dọn dẹp bộ nhớ: Giải phóng URL cũ sau khi ảnh mới load xong
        img.onload = () => {
            if (lastBlobUrl && lastBlobUrl !== url) {
                URL.revokeObjectURL(lastBlobUrl);
            }
            lastBlobUrl = url;
        };

        // Fallback: nếu lỗi load cũng giải phóng
        img.onerror = () => {
             if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
             lastBlobUrl = null;
        };

    } catch (error) {
        console.error('[Render] Error rendering stream frame:', error);
    }
};

window.displayImagePreview = function(base64Data) {
    if (captureTimeoutId) {
        clearTimeout(captureTimeoutId);
        captureTimeoutId = null;
    }
    isWaitingForCapture = false;

    const cameraFeed = document.getElementById('camera-feed');
    
    if (!cameraFeed) {
        console.error('Không tìm thấy camera-feed element');
        return;
    }

    if (!base64Data || base64Data.trim() === '') {
        console.error('[Display] Base64 data rỗng');
        handleCaptureError('Không nhận được dữ liệu ảnh từ server');
        return;
    }

    const placeholder = cameraFeed.querySelector('.placeholder-text');
    if (placeholder) {
        placeholder.remove();
    }

    const existingVideo = cameraFeed.querySelector('video');
    if (existingVideo) {
        existingVideo.remove();
    }

    const errorDiv = cameraFeed.querySelector('.error-message');
    if (errorDiv) {
        errorDiv.remove();
    }

    let img = cameraFeed.querySelector('img');
    if (!img) {
        img = document.createElement('img');
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        cameraFeed.appendChild(img);
    }

    try {
        img.src = "data:image/jpeg;base64," + base64Data;
        img.alt = mode === 'screen' ? 'Screen Capture' : 'Webcam Capture';
        
        img.onerror = () => {
            console.error('[Display] Lỗi load image từ base64');
            handleCaptureError('Không thể hiển thị ảnh. Dữ liệu có thể bị hỏng.');
        };
        
        img.onload = () => {
            console.log('[Display] Image loaded successfully');
        };
    } catch (error) {
        console.error('[Display] Error setting image src:', error);
        handleCaptureError('Lỗi khi hiển thị ảnh: ' + error.message);
    }
};

window.displayVideoPreview = function(base64Data) {
    if (captureTimeoutId) {
        clearTimeout(captureTimeoutId);
        captureTimeoutId = null;
    }
    isWaitingForCapture = false;

    const cameraFeed = document.getElementById('camera-feed');
    
    if (!cameraFeed) {
        console.error('Không tìm thấy camera-feed element');
        return;
    }

    if (!base64Data || base64Data.trim() === '') {
        console.error('[Display] Base64 video data rỗng');
        handleCaptureError('Không nhận được dữ liệu video từ server');
        return;
    }

    const placeholder = cameraFeed.querySelector('.placeholder-text');
    if (placeholder) {
        placeholder.remove();
    }

    const existingImg = cameraFeed.querySelector('img');
    if (existingImg) {
        existingImg.remove();
    }

    const errorDiv = cameraFeed.querySelector('.error-message');
    if (errorDiv) {
        errorDiv.remove();
    }

    let video = cameraFeed.querySelector('video');
    if (!video) {
        video = document.createElement('video');
        video.controls = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '100%';
        video.style.objectFit = 'contain';
        cameraFeed.appendChild(video);
    }

    try {
        video.src = "data:video/mp4;base64," + base64Data;

        video.onerror = () => {
            console.error('[Display] Lỗi load video từ base64');
            handleCaptureError('Không thể hiển thị video. Dữ liệu có thể bị hỏng.');
        };
        
        video.onloadeddata = () => {
            console.log('[Display] Video loaded successfully');
        };
        
        video.load();
    } catch (error) {
        console.error('[Display] Error setting video src:', error);
        handleCaptureError('Lỗi khi hiển thị video: ' + error.message);
    }
};

window.handleCaptureError = function(errorMessage) {
    if (captureTimeoutId) {
        clearTimeout(captureTimeoutId);
        captureTimeoutId = null;
    }
    isWaitingForCapture = false;

    console.error('[Capture Error]', errorMessage);
    
    const cameraFeed = document.getElementById('camera-feed');
    if (cameraFeed) {
        const existingImg = cameraFeed.querySelector('img');
        const existingVideo = cameraFeed.querySelector('video');
        if (existingImg) existingImg.remove();
        if (existingVideo) existingVideo.remove();
        
        let errorDiv = cameraFeed.querySelector('.error-message');
        if (!errorDiv) {
            cameraFeed.innerHTML = '';
            errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.style.cssText = `
                padding: 20px;
                text-align: center;
                color: #ef4444;
                background-color: #fee2e2;
                border: 2px solid #ef4444;
                border-radius: 8px;
                margin: 20px;
                font-family: 'Inter', sans-serif;
            `;
            cameraFeed.appendChild(errorDiv);
        }
        
        let friendlyMessage = errorMessage;
        
        if (errorMessage.includes('Broken pipe') || errorMessage.includes('Connection error') || errorMessage.includes('kết nối bị đứt')) {
            friendlyMessage = '❌ Lỗi kết nối\n\n' +
                            'Kết nối đến agent bị đứt trong khi capture.\n\n' +
                            'Nguyên nhân có thể:\n' +
                            '1. Agent bị crash khi chụp màn hình\n' +
                            '2. Mất kết nối mạng\n' +
                            '3. Gateway đã ngắt kết nối\n\n' +
                            'Giải pháp:\n' +
                            '- Đợi vài giây để kết nối tự động khôi phục\n' +
                            '- Thử lại sau khi thấy "Đã kết nối" trong console\n' +
                            '- Kiểm tra agent có đang chạy không';
        } else if (errorMessage.includes('hard exiting') || errorMessage.includes('system signals')) {
            friendlyMessage = '❌ Agent bị crash\n\n' +
                            'Agent đã bị crash khi thực hiện capture.\n\n' +
                            'Nguyên nhân có thể:\n' +
                            '1. Ffmpeg không tương thích kiến trúc CPU\n' +
                            '2. Lỗi quyền truy cập màn hình/webcam\n' +
                            '3. Lỗi bộ nhớ hoặc tài nguyên hệ thống\n\n' +
                            'Giải pháp:\n' +
                            '- Kiểm tra và cài lại ffmpeg đúng kiến trúc:\n' +
                            '  rm ~/.local/bin/ffmpeg\n' +
                            '  brew install ffmpeg\n' +
                            '- Khởi động lại agent\n' +
                            '- Kiểm tra quyền truy cập màn hình/webcam';
        } else if (errorMessage.includes('cannot execute binary file') || errorMessage.includes('cannot execute binary')) {
            friendlyMessage = '❌ Lỗi: Ffmpeg không tương thích với kiến trúc CPU\n\n' +
                            'Nguyên nhân: File ffmpeg được biên dịch cho kiến trúc CPU khác (x86_64 vs ARM64)\n\n' +
                            'Giải pháp:\n' +
                            '1. Xóa ffmpeg cũ:\n' +
                            '   rm ~/.local/bin/ffmpeg\n\n' +
                            '2. Cài đặt lại ffmpeg đúng kiến trúc:\n' +
                            '   - Với Apple Silicon (M1/M2/M3): brew install ffmpeg\n' +
                            '   - Hoặc tải từ: https://evermeet.cx/ffmpeg/\n\n' +
                            '3. Kiểm tra kiến trúc hệ thống:\n' +
                            '   uname -m  (phải là arm64 cho Apple Silicon)';
        } else if (errorMessage.includes('Ffmpeg chay xong nhung khong co du lieu anh')) {
            friendlyMessage = 'Lỗi: Ffmpeg không thể tạo dữ liệu ảnh\n\n' +
                            'Nguyên nhân có thể:\n' +
                            '1. Ffmpeg không tương thích với kiến trúc CPU (x86_64 vs ARM64)\n' +
                            '   → Giải pháp: Xóa ffmpeg cũ và cài lại đúng kiến trúc:\n' +
                            '      rm ~/.local/bin/ffmpeg\n' +
                            '      brew install ffmpeg\n\n' +
                            '2. Màn hình không có nội dung\n' +
                            '3. Lỗi quyền truy cập màn hình\n' +
                            '4. Lỗi cấu hình Ffmpeg';
        } else if (errorMessage.includes('Ffmpeg') || errorMessage.includes('ffmpeg')) {
            friendlyMessage = 'Lỗi: ' + errorMessage + '\n\nVui lòng kiểm tra:\n- Ffmpeg đã được cài đặt đúng chưa\n- Quyền truy cập màn hình/webcam\n- Kiến trúc CPU có tương thích không (x86_64 vs ARM64)';
        }
        
        const escapeHtml = (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        
        errorDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 10px; font-size: 16px;">! Lỗi Capture</div>
            <div style="font-size: 13px; white-space: pre-line; line-height: 1.6; text-align: left; max-height: 400px; overflow-y: auto;">${escapeHtml(friendlyMessage)}</div>
        `;
        
        setTimeout(() => {
            if (errorDiv && errorDiv.parentNode) {
                errorDiv.remove();
                if (!cameraFeed.querySelector('img') && !cameraFeed.querySelector('video')) {
                    const placeholder = document.createElement('span');
                    placeholder.className = 'placeholder-text';
                    placeholder.textContent = 'this is a preview';
                    cameraFeed.innerHTML = '';
                    cameraFeed.appendChild(placeholder);
                }
            }
        }, 10000);
    }
    
    alert('❌ Lỗi Capture\n\n' + errorMessage);
};

document.addEventListener('DOMContentLoaded', () => {
    Logic.initAgentTargetFromURL(() => {
        console.log("Target đã được set xong, sẵn sàng capture/record!");
    });
    const durationInput = document.querySelector('.duration-input');
    if (durationInput) {
        durationInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        durationInput.addEventListener('change', (e) => {
            e.stopPropagation();
        });
        durationInput.addEventListener('input', (e) => {
            e.stopPropagation();
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const agentId = urlParams.get('id');
    if (agentId && window.gateway) {
        console.log('Setting target ID from URL:', agentId);
        window.gateway.setTarget(agentId);
    }
});

// ================== BACK TO MENU ==================
function backToMenu() {
    const agentId = sessionStorage.getItem('current_agent_id') || 
                    new URLSearchParams(window.location.search).get('id');
    let menuUrl = './Feature_menu.html';
    if (agentId) {
        menuUrl += `?id=${agentId}`;
    }
    window.location.href = menuUrl;
}

window.capture = capture;
window.record = record;
window.handleSaveAction = handleSaveAction;
window.triggerSelectFolder = triggerSelectFolder;
window.backToMenu = backToMenu;