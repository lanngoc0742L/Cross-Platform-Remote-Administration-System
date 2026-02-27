#pragma once
#include "FeatureLibrary.h"

class CameraRecorder {
private:
    const std::string base64_chars = 
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            "abcdefghijklmnopqrstuvwxyz"
            "0123456789+/";
    std::string cameraName;
    std::string detectDefaultCamera();
public:
    CameraRecorder();
    std::string recordRawData(int durationSeconds);
    std::string convertToBase64(const std::string& rawData);
    std::string recordBase64(int durationSeconds);
};