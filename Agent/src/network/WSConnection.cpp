#include "WSConnection.hpp"

#include <iostream>

void WSConnection::startTimeout() {
    timeout_timer_.expires_after(std::chrono::seconds(CONNECT_TIMEOUT_SECONDS));
    timeout_timer_.async_wait([this](beast::error_code ec) {
        if (!ec) {
            std::cerr << "[WSConnection] Connection timeout after " << CONNECT_TIMEOUT_SECONDS << " seconds\n" << std::flush;
            beast::get_lowest_layer(ws_).cancel();
            if (onError) {
                beast::error_code timeout_ec = beast::net::error::make_error_code(beast::net::error::timed_out);
                onError(timeout_ec);
            }
        }
    });
}

void WSConnection::cancelTimeout() {
    timeout_timer_.cancel();
}

void WSConnection::connect() {
    startTimeout();
    auto self = shared_from_this();
    resolver_.async_resolve(
        host_,
        port_,
        [this, self](beast::error_code ec, tcp::resolver::results_type results) {
            onResolve(ec, results);
        }
    );
}

void WSConnection::doResolve() {
    resolver_.async_resolve(
        host_,
        port_,
        beast::bind_front_handler(
            &WSConnection::onResolve,
            shared_from_this()
        )
    );
}

void WSConnection::onResolve(beast::error_code ec,
                             tcp::resolver::results_type results) {
    if (ec) {
        cancelTimeout();
        std::cerr << "[WSConnection] DNS resolve error: " << ec.message() << "\n" << std::flush;
        if (onError) onError(ec);
        return;
    }

    std::cout << "[WSConnection] DNS resolved, connecting to endpoint...\n" << std::flush;
    auto self = shared_from_this();

    beast::get_lowest_layer(ws_).async_connect(
        results,
        [this, self](beast::error_code ec,
                     tcp::resolver::results_type::endpoint_type ep) {
            onConnect(ec, ep);
        }
    );
}

void WSConnection::onConnect(beast::error_code ec, tcp::resolver::results_type::endpoint_type ep) {
    if (ec) {
        cancelTimeout();
        std::cerr << "[WSConnection] TCP connect error: " << ec.message() << " (code: " << ec.value() << ")\n" << std::flush;
        std::cerr << "[WSConnection] Failed to connect to " << host_ << ":" << port_ << "\n" << std::flush;
        if (onError) onError(ec);
        return;
    }

    std::cout << "[WSConnection] TCP connected, starting SSL handshake...\n" << std::flush;
    if(!SSL_set_tlsext_host_name(ws_.next_layer().native_handle(), host_.c_str())) {
        beast::error_code ec{static_cast<int>(::ERR_get_error()), beast::net::error::get_ssl_category()};
        std::cerr << "[WSConnection] SSL SNI error\n" << std::flush;
        if (onError) onError(ec);
        return;
    }

    auto self = shared_from_this();
    ws_.next_layer().async_handshake(
        ssl::stream_base::client,
        [this, self](beast::error_code ec) {
            onSslHandshake(ec);
        }
    );
}

void WSConnection::onSslHandshake(beast::error_code ec) {
    if (ec) {
        cancelTimeout();
        std::cerr << "[WSConnection] SSL handshake error: " << ec.message() << "\n" << std::flush;
        if (onError) onError(ec);
        return;
    }

    std::cout << "[WSConnection] SSL handshake completed, starting WebSocket handshake...\n" << std::flush;
    auto self = shared_from_this();
    ws_.async_handshake(host_, target_, 
        [this, self](beast::error_code ec) {
            onHandshake(ec);
        }
    );
}

void WSConnection::onHandshake(beast::error_code ec) {
    cancelTimeout();
    if (ec) {
        std::cerr << "[WSConnection] WebSocket handshake error: " << ec.message() << "\n" << std::flush;
        if (onError) onError(ec);
        return;
    }

    std::cout << "[WSConnection] WebSocket handshake completed successfully!\n" << std::flush;
    if (onConnected) onConnected();

    doRead();
}

void WSConnection::doRead() {
    auto self = shared_from_this();

    ws_.async_read(
        buffer_,
        [this, self](beast::error_code ec, std::size_t bytes) {
            onRead(ec, bytes);
        }
    );
}

void WSConnection::onRead(beast::error_code ec, std::size_t) {
    if (ec) {
        if (onClosed) onClosed();
        return;
    }

    std::string msg = beast::buffers_to_string(buffer_.data());
    buffer_.clear();

    if (onMessage) onMessage(msg);

    doRead();
}

void WSConnection::send(const std::string& msg) {
    asio::post(ws_.get_executor(), [this, msg]() {
        writeQueue_.emplace(msg);
        if (writeQueue_.size() == 1) {
            doWrite();
        }
    });
}

void WSConnection::sendBinary(const std::vector<unsigned char>& data) {
    asio::post(ws_.get_executor(), [this, data]() {
        writeQueue_.emplace(data); 
        if (writeQueue_.size() == 1) {
            doWrite();
        }
    });
}

void WSConnection::doWrite() {
    auto self = shared_from_this();
    
    const auto& payload = writeQueue_.front();

    ws_.binary(payload.isBinary);

    auto buffer = payload.isBinary 
        ? asio::buffer(payload.binaryData) 
        : asio::buffer(payload.textData);

    ws_.async_write(
        buffer,
        [this, self](beast::error_code ec, std::size_t bytes) {
            onWrite(ec, bytes);
        }
    );
}

void WSConnection::onWrite(beast::error_code ec, std::size_t) {
    if (ec) {
        if (onError) onError(ec);
        return;
    }
    writeQueue_.pop();
    if (!writeQueue_.empty()) {
        doWrite();
    }
}

void WSConnection::close() {
    auto self = shared_from_this();
    ws_.async_close(
        websocket::close_code::normal,
        [this, self](beast::error_code ec) {
            if (ec) {
                if (onError) onError(ec);
                return;
            }

            if (onClosed) onClosed();
        }
    );
}



