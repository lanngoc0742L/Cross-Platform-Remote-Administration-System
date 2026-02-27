#pragma once

#include "WSConnection.hpp"
#include "CommandDispatcher.hpp"
#include <memory>
#include <boost/asio.hpp>

class Agent : public std::enable_shared_from_this<Agent> {
public: 
    explicit Agent(boost::asio::io_context& ioc);
    void run();
private:
    void discoverGateway();
    void connectToGateway();
    void onConnected();
    void onDisconnected();
    void onMessage(const std::string& payload);
    void sendAuth();

    boost::asio::io_context& ioc_;
    boost::asio::ssl::context ctx_;
    std::shared_ptr<WSConnection> client_;
    std::shared_ptr<CommandDispatcher> dispatcher_;
    std::unique_ptr<boost::asio::steady_timer> retryTimer_;
    std::string agentID_;
    std::string discoveredHost_;
    std::string discoveredPort_;
};