#include "CaptureScreen.h"

std::string CaptureScreen::buildCommand() {
    return OS_CMD;
}

std::vector<unsigned char> CaptureScreen::captureRawBytes() {
    std::string cmd = buildCommand();
    std::vector<unsigned char> imageData;

    FILE* pipe = POPEN(cmd.c_str(),
        #ifdef _WIN32
            "rb"
        #else
            "r"
        #endif
    );

    if (!pipe) {
        throw std::runtime_error("CaptureScreen: Khong the mo pipe ffmpeg.");
    }

    std::array<char, 4096> buffer;
    size_t bytesRead;

    while ((bytesRead = fread(buffer.data(), 1, buffer.size(), pipe)) > 0) {
        imageData.insert(imageData.end(), buffer.begin(), buffer.begin() + bytesRead);
    }

    int result = PCLOSE(pipe);

    if (imageData.empty()) {
        throw std::runtime_error("CaptureScreen: Ffmpeg chay xong nhung khong co du lieu anh.");
    }

    return imageData;
}

std::string CaptureScreen::captureAndEncode() {
    std::vector<unsigned char> rawData = captureRawBytes();

    return base64_encode(rawData.data(), rawData.size());
}


std::string CaptureScreen::captureRaw() {
    std::string cmd = buildCommand();
    std::vector<unsigned char> imageData;

    FILE* pipe = POPEN(cmd.c_str(),
        #ifdef _WIN32
            "rb"
        #else
            "r"
        #endif
    );

    if (!pipe) {
        throw std::runtime_error("CaptureScreen: Khong the mo pipe ffmpeg.");
    }

    std::array<char, 4096> buffer;
    size_t bytesRead;

    while ((bytesRead = fread(buffer.data(), 1, buffer.size(), pipe)) > 0) {
        imageData.insert(imageData.end(), buffer.begin(), buffer.begin() + bytesRead);
    }

    int result = PCLOSE(pipe);

    if (imageData.empty()) {
        throw std::runtime_error("CaptureScreen: Ffmpeg chay xong nhung khong co du lieu anh.");
    }
    
    std::string res(imageData.begin(), imageData.end());
    return res;
}