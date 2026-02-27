#pragma once
#include "FeatureLibrary.h"

class CameraCapture {
private:
    std::string cameraName;
    std::string detectDefaultCamera();

public:
    CameraCapture();
    std::string captureRawData();
    std::string convertToBase64(const std::string& rawData);
    std::string captureBase64();
};