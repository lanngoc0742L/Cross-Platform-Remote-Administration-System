#pragma once
#include "FeatureLibrary.h" 
#include "base64.h"         

class ScreenRecorder {
public:
    ScreenRecorder();
    std::string recordRawData(int durationSeconds);
    std::string recordBase64(int durationSeconds);
};