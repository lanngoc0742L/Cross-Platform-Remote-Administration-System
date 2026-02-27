#include "CameraCapture.h"

std::string CameraCapture::detectDefaultCamera() {
    std::string detectedName = "";
    #ifdef _WIN32
        const char* cmd = "ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1";
        FILE* pipe = POPEN(cmd, "r"); 
        if (!pipe) return "";
        char buffer[512];
        while (fgets(buffer, sizeof(buffer), pipe) != NULL) {
            std::string line = buffer;
            if (line.find("(video)") != std::string::npos && line.find("Alternative name") == std::string::npos) {
                size_t firstQuote = line.find("\"");
                size_t secondQuote = line.find("\"", firstQuote + 1);
                if (firstQuote != std::string::npos && secondQuote != std::string::npos) {
                    std::string name = line.substr(firstQuote + 1, secondQuote - firstQuote - 1);
                    if (name.find("OBS") != std::string::npos) continue;
                    detectedName = name;
                    break;
                }
            }
        }
        PCLOSE(pipe);
    #elif __APPLE__
        detectedName = "0";
    #elif __linux__
        const char* cmd = "ffmpeg -hide_banner -list_devices true -f v4l2 -i dummy 2>&1";
        FILE* pipe = POPEN(cmd, "r");
        if (!pipe) return "";
        char buffer[512];
        while (fgets(buffer, sizeof(buffer), pipe) != NULL) {
            std::string line = buffer;
            if (line.find("(video)") != std::string::npos && line.find("Alternative name") == std::string::npos) {
                size_t firstQuote = line.find("\"");
                size_t secondQuote = line.find("\"", firstQuote + 1);
                if (firstQuote != std::string::npos && secondQuote != std::string::npos) {
                    std::string name = line.substr(firstQuote + 1, secondQuote - firstQuote - 1);
                    if (name.find("OBS") != std::string::npos) continue;
                    detectedName = name;
                    break;
                }
            }
        }
        PCLOSE(pipe);
    #endif
    return detectedName;
}

CameraCapture::CameraCapture() {
    cameraName = detectDefaultCamera();
}

std::string CameraCapture::captureRawData() {
    if (cameraName.empty()) {
        cerr << "[ERROR] Khong tim thay Camera nao!" << endl;
        return "";
    }

    std::string cmd;
    #ifdef _WIN32
        cmd = "ffmpeg -loglevel quiet -f dshow -i video=\"" + cameraName + "\" -frames:v 1 -q:v 2 -f mjpeg -";
    #elif __APPLE__
        cmd = "ffmpeg -loglevel quiet -f avfoundation -framerate 30 -pixel_format uyvy422 -i \"" + cameraName + "\" -frames:v 1 -pix_fmt yuvj420p -q:v 2 -f mjpeg -";
    #elif __linux__
        cmd = "ffmpeg -loglevel quiet -f v4l2 -i \"" + cameraName + "\" -frames:v 1 -q:v 2 -f mjpeg -";
    #endif

    FILE* pipe = POPEN(cmd.c_str(), POPEN_MODE);
    if (!pipe) {
        return "";
    }

    cout << "[INFO] Dang chup anh tu Webcam (" << cameraName << ")..." << endl;

    array<char, 4096> buffer;
    std::string rawData;
    size_t bytesRead;

    while ((bytesRead = fread(buffer.data(), 1, buffer.size(), pipe)) > 0) {
        rawData.append(buffer.data(), bytesRead);
    }

    PCLOSE(pipe);
    
    if (rawData.empty()) {
        cerr << "[WARNING] Khong thu duoc du lieu anh." << endl;
    } else {
        cout << "[SUCCESS] Da chup anh thanh cong (" << rawData.size() << " bytes)." << endl;
    }

    return rawData;
}

std::string CameraCapture::convertToBase64(const std::string &rawData) {
    if (rawData.empty()) return "";

    std::string out;
    int val = 0, valb = -6;
    for (unsigned char c : rawData) {
        val = (val << 8) + c;
        valb += 8;
        while (valb >= 0) {
            out.push_back(base64_chars[(val >> valb) & 0x3F]);
            valb -= 6;
        }
    }
    if (valb > -6) out.push_back(base64_chars[((val << 8) >> (valb + 8)) & 0x3F]);
    while (out.size() % 4) out.push_back('=');
    
    return out;
}

std::string CameraCapture::captureBase64() {
    std::string res = captureRawData();
    return convertToBase64(res);
}