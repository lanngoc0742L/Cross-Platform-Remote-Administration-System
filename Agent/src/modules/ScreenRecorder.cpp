#include "ScreenRecorder.h"

ScreenRecorder::ScreenRecorder() {
}

std::string ScreenRecorder::recordRawData(int durationSeconds) {
    std::string cmd;
    
    #ifdef _WIN32
        cmd = "ffmpeg -loglevel quiet -f gdigrab -framerate 30 -i desktop -t " + to_string(durationSeconds) + 
              " -c:v libx264 -pix_fmt yuv420p -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof -";
    #elif __APPLE__
        cmd = "ffmpeg -loglevel quiet -f avfoundation -framerate 30 -pixel_format uyvy422 -i \"1\" -t " + to_string(durationSeconds) + 
              " -pix_fmt yuv420p -f mp4 -movflags frag_keyframe+empty_moov -";
    #elif __linux__
        cmd = "ffmpeg -loglevel quiet -f x11grab -framerate 30 -i :0.0 -t " + to_string(durationSeconds) + 
              " -pix_fmt yuv420p -f mp4 -movflags frag_keyframe+empty_moov -";
    #endif

    FILE* pipe = POPEN(cmd.c_str(), POPEN_MODE);
    if (!pipe) {
        // cerr << "[ERROR] Khong the mo Pipe FFmpeg Screen Recorder!" << endl;
        return "";
    }

    cout << "[INFO] Dang quay man hinh Desktop trong " << durationSeconds << "s..." << endl;

    array<char, 4096> buffer;
    std::string rawData;
    size_t bytesRead;

    while ((bytesRead = fread(buffer.data(), 1, buffer.size(), pipe)) > 0) {
        rawData.append(buffer.data(), bytesRead);
    }

    PCLOSE(pipe);
    
    if (rawData.empty()) {
        cerr << "[WARNING] Khong thu duoc du lieu man hinh." << endl;
    } else {
        cout << "[SUCCESS] Da thu duoc " << rawData.size() << " bytes du lieu man hinh." << endl;
    }

    return rawData;
}

std::string ScreenRecorder::recordBase64(int durationSeconds) {
    std::string rawData = recordRawData(durationSeconds);
    
    if (rawData.empty()) {
        return "";
    }

    return base64_encode(reinterpret_cast<const unsigned char*>(rawData.c_str()), rawData.length());
}