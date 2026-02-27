#pragma once
#include "FeatureLibrary.h"

#ifdef _WIN32
    #define POPEN _popen
    #define PCLOSE _pclose
    const std::string OS_CMD = "ffmpeg -f gdigrab -i desktop -vframes 1 -f image2pipe -c:v mjpeg -q:v 2 -hide_banner -loglevel error -";
#elif __APPLE__
    #define POPEN popen
    #define PCLOSE pclose
    const std::string OS_CMD = "ffmpeg -f avfoundation -pixel_format uyvy422 -i \"1:none\" -vframes 1 -f image2pipe -c:v mjpeg -q:v 2 -hide_banner -loglevel error -";
#elif __linux__
    #define POPEN popen
    #define PCLOSE pclose
    const std::string OS_CMD = "ffmpeg -f x11grab -i :0.0 -vframes 1 -f image2pipe -c:v mjpeg -q:v 2 -hide_banner -loglevel error -";
#else
    #error "OS not supported yet"
#endif

class CaptureScreen {
public:
    CaptureScreen() = default;
    std::string captureAndEncode();
    std::string captureRaw();

private:
    std::string buildCommand();
    std::vector<unsigned char> captureRawBytes();
};