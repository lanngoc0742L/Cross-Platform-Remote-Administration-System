#include "Agent.hpp"
#include "../../config/Config.hpp"
#include "Protocol.hpp"
#include "FeatureLibrary.h"
#include "GatewayDiscovery.h"
#include "PrivilegeEscalation.h"
#include <exception>


using json = nlohmann::json;
using std::cout;

Agent::Agent(boost::asio::io_context& ioc) : ioc_(ioc), ctx_(boost::asio::ssl::context::tls_client), dispatcher_(std::make_shared<CommandDispatcher>()) {
    ctx_.set_verify_mode(boost::asio::ssl::verify_none);
    std::string hostname = getHostName();
    std::string username = PrivilegeEscalation::getCurrentUsername();
    
    if (!username.empty()) {
        agentID_ = hostname + "-" + username;
    } else {
        agentID_ = hostname;
    }
    
    discoveredHost_ = "";
    discoveredPort_ = "";
}

void Agent::run() {
    cout << "[Agent] Starting service on: " << agentID_ << "\n" << std::flush;
    discoverGateway();
    cout << "[Network] ========================================\n" << std::flush;
    cout << "[Network] Proceeding to connect...\n" << std::flush;
    connectToGateway();    
}

void Agent::discoverGateway() {
    cout << "[Network] Starting UDP Discovery to find Gateway...\n" << std::flush;
    try {
        auto result = GatewayDiscovery::discoverViaUDP(3000);

        if (!result.first.empty()) {
            discoveredHost_ = result.first;
            discoveredPort_ = result.second.empty() ? "8080" : result.second;
        } else {
            cout << "[Network] Gateway not found via UDP Discovery\n" << std::flush;
            discoveredHost_ = "";
            discoveredPort_ = "";
        }
    } catch (const std::exception& e) {
        std::cerr << "[Network] Discovery error: " << e.what() << "\n" << std::flush;
        discoveredHost_ = "";
        discoveredPort_ = "";
    }
}

void Agent::connectToGateway() {
    try {
        if (discoveredHost_.empty()) {
            std::cerr << "[Network] No Gateway discovered. Cannot connect.\n" << std::flush;
            onDisconnected();
            return;
        }
        
        std::string host = discoveredHost_;
        std::string port = discoveredPort_.empty() ? "8080" : discoveredPort_;
        
        cout << "[Network] Attempting WSS connection to: " << host << ":" << port << "\n" << std::flush;
        
        try {
            std::cout << "[Debug] Creating WSConnection object..." << std::endl;
            client_ = std::make_shared<WSConnection>(ioc_, ctx_, host, port, "/");
            dispatcher_->setConnection(client_);
            std::cout << "[Debug] WSConnection object created successfully." << std::endl;
            client_->onConnected = [this]() {
                this->onConnected();
            };

            client_->onMessage = [this](std::string msg) {
                this->onMessage(msg);
            };

            client_->onClosed = [this]() {
                this->onDisconnected();
            };

            client_->onError = [this, host, port](boost::beast::error_code ec) {
                std::cerr << "[Network] Connection error: " << ec.message() << " (code: " << ec.value() << ")\n" << std::flush;
                if (ec.value() == 60 || ec == boost::beast::net::error::timed_out) {
                    std::cerr << "[Network] Connection timeout to " << host << ":" << port << "\n" << std::flush;
                    std::cerr << "[Network] Possible causes:\n" << std::flush;
                    std::cerr << "  1. Gateway server is not running\n" << std::flush;
                    std::cerr << "  2. Gateway server is not listening on port " << port << "\n" << std::flush;
                    std::cerr << "  3. Firewall is blocking port " << port << "\n" << std::flush;
                    std::cerr << "  4. Network connectivity issue\n" << std::flush;
                    std::cerr << "[Network] Please verify Gateway is running and accessible\n" << std::flush;
                }
                this->onDisconnected();
            };
            cout << "[Network] Initiating WebSocket connection...\n" << std::flush;
            client_->connect();

        } catch (const std::exception& e) {
            std::cerr << "[FATAL] Standard exception: " << e.what() << std::endl;
            onDisconnected();
        } catch (...) {
            std::cerr << "[FATAL] Standard exception";
            onDisconnected();
        } 
    } catch (const std::exception& e) {
        std::cerr << "[CRITICAL] Crash in connectToGateway: " << e.what() << std::endl;
    } catch (...) {
        std::cerr << "[CRITICAL] Unknown crash in connectToGateway" << std::endl;
    }
}

void Agent::onConnected() {
    cout << "[Network] Connected to Gateway!\n";
    cout << "[Network] Sending authentication...\n";
    sendAuth();
}

void Agent::sendAuth() {
    json authPayload = {
        {"role", "AGENT"},
        {"user", agentID_},
        {"machineId", agentID_}
    };

    Message msg(Protocol::TYPE::AUTH, authPayload, agentID_);
    client_->send(msg.serialize());
}

void Agent::onMessage(const std::string& payload) {
    try {
        Message request = Message::deserialize(payload);

        dispatcher_->dispatch(request, [this](Message response) {
            response.from = agentID_;
            client_->send(response.serialize());
        });
    } catch (std::exception& e) {
        std::cerr << "[Agent] Error processing message: " << e.what() << "\n";
    }
}

void Agent::onDisconnected() {
    cout << "[Network] Disconnected. Retrying Discovery in " << Config::RECONNECT_DELAY_MS << "ms...\n" << std::flush;
    if(client_) {
        client_->onClosed = nullptr;
        client_->onError = nullptr;
    }
    client_.reset();

    retryTimer_ = std::make_unique<boost::asio::steady_timer>(ioc_, std::chrono::milliseconds(Config::RECONNECT_DELAY_MS));
    retryTimer_->async_wait([this](const boost::system::error_code& ec) {
        if (!ec) {
            cout << "[Network] Retrying Discovery...\n" << std::flush;
            discoverGateway();
            connectToGateway();
        }
    });
}