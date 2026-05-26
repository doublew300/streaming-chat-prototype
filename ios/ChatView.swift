import SwiftUI

struct ChatView: View {
    @StateObject private var viewModel = ChatViewModel()
    @State private var pulseActive = false
    
    var body: some View {
        NavigationView {
            ZStack {
                // Modern Gradient Background (Premium Dark Mode)
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(red: 10/255, green: 15/255, blue: 30/255),
                        Color(red: 20/255, green: 25/255, blue: 50/255)
                    ]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Header Area with Glassmorphism
                    headerView
                    
                    // Chat Messages Scroll
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                ForEach(viewModel.messages) { message in
                                    MessageBubbleView(message: message)
                                        .transition(.asymmetric(
                                            insertion: .opacity.combined(with: .move(edge: .bottom)),
                                            removal: .opacity
                                        ))
                                }
                            }
                            .padding(.horizontal)
                            .padding(.top, 16)
                            .padding(.bottom, 80) // Spacing for floating input
                        }
                        .onChange(of: viewModel.messages.count) { _ in
                            scrollToBottom(proxy: proxy)
                        }
                        .onChange(of: viewModel.messages.last?.text) { _ in
                            // Auto-scroll as text streams in
                            scrollToBottom(proxy: proxy)
                        }
                    }
                    
                    // Floating Input Bar
                    inputSection
                }
            }
            .navigationBarHidden(true)
        }
    }
    
    // MARK: - Header
    private var headerView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Steuerchat")
                    .font(.system(.title2, design: .rounded))
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                
                Text("Streaming Prototype v1.0")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            Spacer()
            
            // Connection Status Indicator
            HStack(spacing: 8) {
                Text(viewModel.connectionState.rawValue)
                    .font(.system(.caption, design: .rounded))
                    .fontWeight(.semibold)
                    .foregroundColor(statusTextColor)
                
                // Pulsating status dot
                Circle()
                    .fill(statusColor)
                    .frame(width: 10, height: 10)
                    .shadow(color: statusColor, radius: 4)
                    .scaleEffect(pulseActive ? 1.2 : 0.8)
                    .animation(
                        viewModel.connectionState == .reconnecting || viewModel.connectionState == .connecting
                            ? Animation.easeInOut(duration: 0.6).repeatForever(autoreverses: true)
                            : Animation.default,
                        value: pulseActive
                    )
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(statusBgColor)
            )
            .overlay(
                Capsule()
                    .stroke(statusBorderColor, lineWidth: 1)
            )
        }
        .padding()
        .background(
            Color.white.opacity(0.03)
                .background(VisualEffectBlur(material: .systemUltraThinMaterialDark))
        )
        .onAppear {
            self.pulseActive = true
        }
    }
    
    // MARK: - Input Section
    private var inputSection: some View {
        VStack(spacing: 8) {
            // Streaming Status Bar
            if viewModel.isStreaming {
                HStack {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .cyan))
                        .scaleEffect(0.8)
                    Text("Streaming answer...")
                        .font(.caption)
                        .italic()
                        .foregroundColor(.cyan)
                    Spacer()
                }
                .padding(.horizontal, 24)
                .transition(.opacity)
            }
            
            HStack(spacing: 12) {
                if viewModel.isStreaming {
                    // Modern Morphing Stop Button while streaming
                    Button(action: {
                        withAnimation {
                            viewModel.cancelStreaming()
                        }
                    }) {
                        HStack {
                            Image(systemName: "stop.fill")
                                .font(.system(size: 14, weight: .bold))
                            Text("Stop")
                                .font(.system(.body, design: .rounded))
                                .fontWeight(.bold)
                        }
                        .foregroundColor(.white)
                        .padding(.vertical, 14)
                        .frame(maxWidth: .infinity)
                        .background(
                            LinearGradient(
                                colors: [Color.red, Color(red: 220/255, green: 20/255, blue: 60/255)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .cornerRadius(16)
                        .shadow(color: Color.red.opacity(0.3), radius: 8, x: 0, y: 4)
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                } else {
                    // Standard text field input
                    HStack {
                        TextField("Type a message...", text: $viewModel.inputText)
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .frame(height: 48)
                            .background(Color.white.opacity(0.05))
                            .cornerRadius(14)
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
                            )
                        
                        Button(action: {
                            withAnimation {
                                viewModel.sendMessage()
                            }
                        }) {
                            Image(systemName: "paperplane.fill")
                                .foregroundColor(.white)
                                .font(.system(size: 18, weight: .bold))
                                .frame(width: 48, height: 48)
                                .background(
                                    LinearGradient(
                                        colors: [Color.cyan, Color.blue],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .cornerRadius(14)
                                .shadow(color: Color.cyan.opacity(0.3), radius: 6, x: 0, y: 3)
                        }
                        .disabled(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .opacity(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.6 : 1.0)
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 12)
        }
        .padding(.top, 8)
        .background(
            Color(red: 10/255, green: 15/255, blue: 30/255).opacity(0.85)
                .background(VisualEffectBlur(material: .systemChromeMaterialDark))
        )
    }
    
    // MARK: - Helpers
    private func scrollToBottom(proxy: ScrollViewProxy) {
        guard let lastMessage = viewModel.messages.last else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                proxy.scrollTo(lastMessage.id, anchor: .bottom)
            }
        }
    }
    
    // Colors depending on connectionState
    private var statusColor: Color {
        switch viewModel.connectionState {
        case .connected: return .green
        case .reconnecting, .connecting: return .orange
        case .disconnected: return .red
        }
    }
    
    private var statusTextColor: Color {
        switch viewModel.connectionState {
        case .connected: return Color.green.opacity(0.9)
        case .reconnecting, .connecting: return Color.orange.opacity(0.9)
        case .disconnected: return Color.red.opacity(0.9)
        }
    }
    
    private var statusBgColor: Color {
        switch viewModel.connectionState {
        case .connected: return Color.green.opacity(0.08)
        case .reconnecting, .connecting: return Color.orange.opacity(0.08)
        case .disconnected: return Color.red.opacity(0.08)
        }
    }
    
    private var statusBorderColor: Color {
        switch viewModel.connectionState {
        case .connected: return Color.green.opacity(0.2)
        case .reconnecting, .connecting: return Color.orange.opacity(0.2)
        case .disconnected: return Color.red.opacity(0.2)
        }
    }
}

// MARK: - Message Bubble Component
struct MessageBubbleView: View {
    let message: ChatMessage
    
    var body: some View {
        HStack(spacing: 12) {
            if message.isUser {
                Spacer()
            }
            
            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 4) {
                // Text bubble
                Text(message.text.isEmpty && message.isStreaming ? "●" : message.text)
                    .font(.system(.body, design: .rounded))
                    .foregroundColor(message.isUser ? .white : Color(white: 0.9))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(
                        bubbleBackground
                    )
                    .cornerRadius(18)
                    .overlay(
                        RoundedRectangle(cornerRadius: 18)
                            .stroke(bubbleBorderColor, lineWidth: 1)
                    )
                    .shadow(color: message.isUser ? Color.cyan.opacity(0.15) : Color.black.opacity(0.1), radius: 4, x: 0, y: 2)
                
                // Timestamp
                Text(formattedTime(message.timestamp))
                    .font(.system(size: 10))
                    .foregroundColor(.gray)
                    .padding(.horizontal, 4)
            }
            
            if !message.isUser {
                Spacer()
            }
        }
    }
    
    private var bubbleBackground: some View {
        Group {
            if message.isUser {
                LinearGradient(
                    colors: [Color.cyan.opacity(0.85), Color.blue.opacity(0.85)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            } else {
                Color.white.opacity(0.06)
            }
        }
    }
    
    private var bubbleBorderColor: Color {
        message.isUser ? Color.cyan.opacity(0.2) : Color.white.opacity(0.08)
    }
    
    private func formattedTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

// MARK: - Visual Effect Blur (Native UIKit Blur integration for SwiftUI)
struct VisualEffectBlur: UIViewRepresentable {
    var material: UIBlurEffect.Material
    
    func makeUIView(context: Context) -> UIVisualEffectView {
        UIVisualEffectView(effect: UIBlurEffect(style: material))
    }
    
    func updateUIView(_ uiView: UIVisualEffectView, context: Context) {
        uiView.effect = UIBlurEffect(style: material)
    }
}

struct ChatView_Previews: PreviewProvider {
    static var previews: some View {
        ChatView()
    }
}
