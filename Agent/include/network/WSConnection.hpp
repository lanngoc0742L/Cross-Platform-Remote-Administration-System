#pragma once

#include "FeatureLibrary.h"

namespace beast = boost::beast;
namespace websocket = beast::websocket;
namespace asio = boost::asio;
using tcp = asio::ip::tcp;
namespace ssl = boost::asio::ssl;

struct WSPayload {
    std::string textData;
    std::vector<unsigned char> binaryData;
    bool isBinary;
    WSPayload(std::string text) : textData(std::move(text)), isBinary(false) {}
    WSPayload(std::vector<unsigned char> bin) : binaryData(std::move(bin)), isBinary(true) {}
};

class WSConnection : public std::enable_shared_from_this<WSConnection> {
public:
  explicit WSConnection (asio::io_context& ioc,
                        ssl::context& ctx,
                        const std::string& url,
                        const std::string& port = "80",
                        const std::string& target = "/")
          try : resolver_(asio::make_strand(ioc)), 
                ws_(asio::make_strand(ioc), ctx),
                host_(url),
                port_(port),
                target_(target),
                timeout_timer_(asio::make_strand(ioc))
  {
  } catch (...) {
      std::cerr << "[CRITICAL] Crash inside WSConnection Init List!" << std::endl;
  }

    std::function<void()> onConnected;
    std::function<void(std::string)> onMessage;
    std::function<void()> onClosed;
    std::function<void(beast::error_code)> onError;

    void connect();
    void send(const std::string& msg);
    void sendBinary(const std::vector<unsigned char>& data);
    void close();

private:
    tcp::resolver resolver_;
    websocket::stream<beast::ssl_stream<beast::tcp_stream>> ws_;
    beast::flat_buffer buffer_;
    asio::steady_timer timeout_timer_;

    std::string host_;
    std::string port_;
    std::string target_;

    std::queue<WSPayload> writeQueue_;
    bool writing_ = false;
    
    static constexpr int CONNECT_TIMEOUT_SECONDS = 10;
    
    void startTimeout();
    void cancelTimeout();
private:
    void doResolve();
    void onResolve(beast::error_code, tcp::resolver::results_type);
    
    void onConnect(beast::error_code, tcp::resolver::results_type::endpoint_type);
    void onHandshake(beast::error_code);

    void doRead();
    void onRead(beast::error_code, std::size_t);
    
    void doWrite();
    void onWrite(beast::error_code, std::size_t);
    void onSslHandshake(beast::error_code ec);
};
