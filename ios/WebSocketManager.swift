import Foundation
import Combine
import SocketIO

enum ConnectionState: String {
    case disconnected = "Offline"
    case connecting = "Connecting..."
    case connected = "Connected"
    case reconnecting = "Reconnecting..."
}

class WebSocketManager: ObservableObject {
    static let shared = WebSocketManager()
    
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    
    // Persistent Session ID across app lifecycles
    private(set) var sessionId: String = ""
    
    @Published var connectionState: ConnectionState = .disconnected
    @Published var isStreaming: Bool = false
    @Published var activeMessageId: String? = nil
    
    // Track the last received chunk index for recovery
    private(set) var lastReceivedIndex: Int = -1
    
    // Closures to notify the ViewModel of incoming data
    var onChunkReceived: ((_ messageId: String, _ text: String, _ isFinished: Bool) -> Void)?
    var onStreamCancelled: ((_ messageId: String) -> Void)?
    var onStreamError: ((_ messageId: String?, _ sessionId: String?, _ error: String) -> Void)?
    
    private init() {
        setupSessionId()
        setupSocket()
    }
    
    private func setupSessionId() {
        if let savedId = UserDefaults.standard.string(forKey: "StreamingChatSessionId") {
            self.sessionId = savedId
        } else {
            let newId = UUID().uuidString
            UserDefaults.standard.set(newId, forKey: "StreamingChatSessionId")
            self.sessionId = newId
        }
        print("Initialized Session ID: \(self.sessionId)")
    }
    
    private func setupSocket() {
        guard let url = URL(string: "http://localhost:3000") else {
            print("Invalid server URL")
            return
        }
        
        // Setup SocketManager with auto-reconnection enabled
        manager = SocketManager(socketURL: url, config: [
            .log(false),
            .compress,
            .reconnects(true),
            .reconnectAttempts(-1), // Infinite reconnects
            .reconnectDelay(2.0),   // Attempt reconnect every 2 seconds
            .reconnectDelayMax(5.0),
            .connectParams(["sessionId": sessionId])
        ])
        
        socket = manager?.defaultSocket
        
        setupLifecycleListeners()
        setupCustomEventListeners()
        
        socket?.connect()
    }
    
    private func setupLifecycleListeners() {
        socket?.on(clientEvent: .connect) { [weak self] data, ack in
            guard let self = self else { return }
            print("Socket connected!")
            DispatchQueue.main.async {
                self.connectionState = .connected
                self.handleReconnection()
            }
        }
        
        socket?.on(clientEvent: .disconnect) { [weak self] data, ack in
            guard let self = self else { return }
            print("Socket disconnected!")
            DispatchQueue.main.async {
                self.connectionState = .disconnected
            }
        }
        
        socket?.on(clientEvent: .reconnectAttempt) { [weak self] data, ack in
            guard let self = self else { return }
            print("Socket reconnecting...")
            DispatchQueue.main.async {
                self.connectionState = .reconnecting
            }
        }
        
        socket?.on(clientEvent: .error) { data, ack in
            print("Socket error: \(data)")
        }
    }
    
    private func setupCustomEventListeners() {
        socket?.on("stream_chunk") { [weak self] data, ack in
            guard let self = self,
                  let dict = data.first as? [String: Any],
                  let messageId = dict["messageId"] as? String,
                  let chunkIndex = dict["chunkIndex"] as? Int,
                  let text = dict["text"] as? String,
                  let isFinished = dict["isFinished"] as? Bool else {
                return
            }
            
            DispatchQueue.main.async {
                // If it's a new message, reset indices
                if self.activeMessageId != messageId {
                    self.activeMessageId = messageId
                    self.lastReceivedIndex = -1
                    self.isStreaming = true
                }
                
                // Only process chunk if it's the next expected chunk to handle duplicate packets
                if chunkIndex > self.lastReceivedIndex {
                    self.lastReceivedIndex = chunkIndex
                    
                    self.onChunkReceived?(messageId, text, isFinished)
                    
                    if isFinished {
                        print("Stream finished for message: \(messageId)")
                        self.isStreaming = false
                        self.activeMessageId = nil
                        self.lastReceivedIndex = -1
                    }
                }
            }
        }
        
        socket?.on("stream_cancelled") { [weak self] data, ack in
            guard let self = self,
                  let dict = data.first as? [String: Any],
                  let messageId = dict["messageId"] as? String else {
                return
            }
            
            DispatchQueue.main.async {
                print("Stream cancelled for message: \(messageId)")
                self.isStreaming = false
                self.activeMessageId = nil
                self.lastReceivedIndex = -1
                self.onStreamCancelled?(messageId)
            }
        }
        
        socket?.on("stream_error") { [weak self] data, ack in
            guard let self = self,
                  let dict = data.first as? [String: Any],
                  let error = dict["error"] as? String else {
                return
            }
            let messageId = dict["messageId"] as? String
            let sessionId = dict["sessionId"] as? String
            
            DispatchQueue.main.async {
                print("Stream error received: \(error)")
                self.isStreaming = false
                self.activeMessageId = nil
                self.lastReceivedIndex = -1
                self.onStreamError?(messageId, sessionId, error)
            }
        }
    }
    
    func sendMessage(_ text: String, messageId: String) {
        guard let socket = socket, socket.status == .connected else {
            print("Cannot send message: socket not connected")
            return
        }
        
        DispatchQueue.main.async {
            self.activeMessageId = messageId
            self.lastReceivedIndex = -1
            self.isStreaming = true
        }
        
        let payload: [String: Any] = [
            "sessionId": sessionId,
            "messageId": messageId,
            "text": text
        ]
        
        socket.emit("send_message", payload)
    }
    
    func cancelStream() {
        guard let socket = socket, let activeId = activeMessageId else {
            return
        }
        
        let payload: [String: Any] = [
            "sessionId": sessionId,
            "messageId": activeId
        ]
        
        socket.emit("cancel_stream", payload)
        
        // Optimistic UI cancellation
        DispatchQueue.main.async {
            self.isStreaming = false
            self.activeMessageId = nil
            self.lastReceivedIndex = -1
            self.onStreamCancelled?(activeId)
        }
    }
    
    private func handleReconnection() {
        // If we were streaming a message, trigger resumption
        if let activeId = activeMessageId, isStreaming {
            print("Reconnected! Emitting resume_stream for session: \(sessionId) from index: \(lastReceivedIndex)")
            let payload: [String: Any] = [
                "sessionId": sessionId,
                "lastReceivedIndex": lastReceivedIndex
            ]
            socket?.emit("resume_stream", payload)
        }
    }
}
