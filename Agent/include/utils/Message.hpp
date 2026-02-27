#pragma once

#include "Protocol.hpp"
#include <nlohmann/json.hpp>
#include <string>
#include <iostream>

using json = nlohmann::json;

class Message {
public:
    std::string type;
    json data;
    std::string to;
    std::string from;

    Message() = default;
    Message(const std::string& c, const json& d,
            const std::string& f = "", const std::string& t = "")
            : type(c), data(d), from(f), to(t) {}
    
    std::string serialize() const {
        json j;
        j["type"] = type;
        j["data"] = data;
        if (!from.empty()) j["from"] = from;
        if (!to.empty()) j["to"] = to;
        return j.dump(-1, ' ', false, json::error_handler_t::replace);
    }

    static Message deserialize(const std::string& str) {
        Message msg;
        try {
            auto j = json::parse(str);
            msg.type = j.value("type", "unknown");
            if (j.contains("data")) msg.data = j["data"];
            else msg.data = json({});
            msg.from = j.value("from", "");
            msg.to = j.value("to", "");
        } catch (const std::exception& e) {
            std::cerr << "[Message] JSON parse error: " << e.what() << "\n";
            msg.type = Protocol::TYPE::ERROR;
        }
        
        return msg;
    }

    std::string getDataString() const {
        if (data.is_string()) return data.get<std::string>();
        return data.dump();
    }
};