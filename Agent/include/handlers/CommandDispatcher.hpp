#pragma once

#include "FeatureLibrary.h"
#include "PlatformModules.h"
#include "Message.hpp"
#include "WSConnection.hpp"
#include "Protocol.hpp"

class WSConnection;

using ResponseCallBack = std::function<void(Message)>;
using std::cout;

class CommandDispatcher {
public: 
    CommandDispatcher();
    void dispatch(const Message& msg, ResponseCallBack cb);
    void setConnection(std::shared_ptr<WSConnection> conn) {
        conn_ = conn;
    }
private:
    void registerHandlers();

    using HandlerFunc = std::function<void(const Message&, ResponseCallBack)>;
    std::unordered_map<std::string, HandlerFunc> routes_;
    std::shared_ptr<WSConnection> conn_;
};