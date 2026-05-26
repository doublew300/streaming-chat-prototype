import Foundation
import Combine

struct ChatMessage: Identifiable {
    let id: String
    var text: String
    let isUser: Bool
    let timestamp: Date
    var isStreaming: Bool = false
    var isCancelled: Bool = false
}

class ChatViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var inputText: String = ""
    @Published var isStreaming: Bool = false
    @Published var connectionState: ConnectionState = .disconnected
    
    private var webSocketManager = WebSocketManager.shared
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        setupBindings()
    }
    
    private func setupBindings() {
        // Bind connectionState from WebSocketManager
        webSocketManager.$connectionState
            .receive(on: DispatchQueue.main)
            .assign(to: \.connectionState, on: self)
            .store(in: &cancellables)
        
        // Bind isStreaming from WebSocketManager
        webSocketManager.$isStreaming
            .receive(on: DispatchQueue.main)
            .assign(to: \.isStreaming, on: self)
            .store(in: &cancellables)
        
        // Setup chunk receiver
        webSocketManager.onChunkReceived = { [weak self] messageId, text, isFinished in
            guard let self = self else { return }
            self.appendChunk(messageId: messageId, chunk: text, isFinished: isFinished)
        }
        
        // Setup cancellation receiver
        webSocketManager.onStreamCancelled = { [weak self] messageId in
            guard let self = self else { return }
            self.markAsCancelled(messageId: messageId)
        }
    }
    
    func sendMessage() {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        
        let userMessageId = UUID().uuidString
        let botMessageId = UUID().uuidString
        
        // 1. Add User Message
        let userMessage = ChatMessage(
            id: userMessageId,
            text: trimmed,
            isUser: true,
            timestamp: Date()
        )
        
        // 2. Add empty Bot Message placeholder
        let botMessage = ChatMessage(
            id: botMessageId,
            text: "",
            isUser: false,
            timestamp: Date(),
            isStreaming: true
        )
        
        messages.append(userMessage)
        messages.append(botMessage)
        
        inputText = ""
        
        // 3. Trigger socket emit
        webSocketManager.sendMessage(trimmed, messageId: botMessageId)
    }
    
    func cancelStreaming() {
        webSocketManager.cancelStream()
    }
    
    private func appendChunk(messageId: String, chunk: String, isFinished: Bool) {
        guard let index = messages.firstIndex(where: { $0.id == messageId }) else {
            return
        }
        
        var message = messages[index]
        
        // Append word with correct spacing
        if message.text.isEmpty {
            message.text = chunk
        } else {
            // Check if chunk is a punctuation mark to avoid preceding space
            let punctuations = [".", ",", "!", "?", ";", ":"]
            if punctuations.contains(chunk) {
                message.text += chunk
            } else {
                message.text += " " + chunk
            }
        }
        
        message.isStreaming = !isFinished
        
        messages[index] = message
    }
    
    private func markAsCancelled(messageId: String) {
        guard let index = messages.firstIndex(where: { $0.id == messageId }) else {
            return
        }
        
        var message = messages[index]
        message.isStreaming = false
        message.isCancelled = true
        
        // Append visual feedback that stream was stopped by user
        if !message.text.isEmpty {
            message.text += " 🛑 [Stream Stopped]"
        } else {
            message.text = "🛑 [Stream Stopped]"
        }
        
        messages[index] = message
    }
}
