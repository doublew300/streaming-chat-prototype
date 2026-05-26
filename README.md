# Streaming Chat Prototype

A robust, real-time streaming chat prototype consisting of:
1. **Backend Server**: Built with NestJS + TypeScript and `socket.io` to stream responses chunk-by-chunk at approximately 5 words per second.
2. **Companion iOS App**: A native SwiftUI chat screen implementing dynamic visual feedback, cancellation, and a robust stateful reconnect protocol.

---

## 🛠️ System Design & Reconnect Protocol

To satisfy the **Airplane Mode Reconnect Scenario** (where network connection is lost mid-stream for around 5 seconds and then restored), we designed a session-based state synchronization protocol:

1. **Persistent Session Identity**: The iOS App generates a UUID `sessionId` once and persists it in `UserDefaults`. It passes this `sessionId` during the Socket.io connection handshake.
2. **Sequential Chunk Tracking**: The backend splits a selected long text into individual words, index-tracked from `0` to `N-1`.
3. **Background Buffering**: While the client is offline, the backend stream timer keeps running and logs generated words in a session buffer (`sentChunks`).
4. **Fast Catch-up**: Upon reconnect, the iOS client automatically emits `resume_stream` passing its `sessionId` and the `lastReceivedIndex` (index of the last word successfully displayed on screen). The backend immediately flushes all missing chunks (indices from `lastReceivedIndex + 1` to current) to the new socket, making them appear instantly on the screen before continuing the stream at the normal 5 words/sec rate.

---

## 🚀 Running the Backend

### Prerequisites
- Node.js (v18 or higher recommended)
- npm

### Setup & Run
1. Open a terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the NestJS server in development mode:
   ```bash
   npm run start:dev
   ```
   The backend will bootstrap and start a Socket.io WebSocket server on **port 3000** (`http://localhost:3000`).

---

## 📱 Running the iOS App

### Prerequisites
- macOS machine
- Xcode (v14 or higher)
- CocoaPods or Swift Package Manager (SPM)

### Setup Instructions
1. Open Xcode and create a new project: **File > New > Project...** and select **iOS App**.
2. Name the project **StreamingChat** and select **SwiftUI** for Interface and **Swift** for Language.
3. Drag the following files from the `ios` directory into your Xcode project navigator:
   - [WebSocketManager.swift](file:///g:/shwitzerland/ios/WebSocketManager.swift)
   - [ChatViewModel.swift](file:///g:/shwitzerland/ios/ChatViewModel.swift)
   - [ChatView.swift](file:///g:/shwitzerland/ios/ChatView.swift)
   - [StreamingChatApp.swift](file:///g:/shwitzerland/ios/StreamingChatApp.swift) (Overwrite the default App entrypoint)
4. **Add Socket.io Dependency**:
   - In Xcode, go to **File > Add Package Dependencies...**
   - Enter the package URL: `https://github.com/socketio/socket.io-client-swift.git`
   - Set the Dependency Rule to `Up to Next Major Version` starting with `16.0.0`.
   - Add the `SocketIO` product to your app target.
5. In Xcode, run the project on an iOS Simulator or a physical iPhone.
   > [!NOTE]
   > By default, the app is configured to connect to `http://localhost:3000`. If you are running on a physical iPhone, replace `localhost` in `WebSocketManager.swift` with your host computer's local IP address (e.g., `http://192.168.1.15:3000`).

---

## 🧪 Testing the Reconnect Scenario

Follow these steps to verify that the app successfully satisfies the most critical acceptance criteria (graceful recovery and fast catch-up):

1. **Start Stream**: Type a message in the SwiftUI input box and click **Send**. The response will begin appearing smoothly word-by-word (5 words/sec).
2. **Trigger Disconnection**:
   - **On Simulator**: Turn off Wi-Fi on the host Mac machine, or use the **Network Link Conditioner** utility in macOS Xcode developer tools, setting it to *100% Loss*.
   - **On Physical Device**: Simply swipe down the Control Center and enable **Airplane Mode**.
3. **Observe Client State**: The top right connection indicator will transition instantly to **Offline** or **Reconnecting...** in Amber/Red.
4. **Wait 5 Seconds**: While offline, wait around 5 seconds. The backend log will show:
   `[Offline Stream] Session ... generated chunk X ("..."), but socket is disconnected. Buffered.`
5. **Restore Connection**: Turn off Airplane Mode (or turn Wi-Fi back on).
6. **Observe Catch-up**:
   - The app automatically reconnects.
   - The connection status goes back to **Connected** (Green).
   - **Instantly**, all the words that were generated during the 5-second downtime flush onto the screen.
   - The stream smoothly continues from the correct position at the standard pace (5 words/sec) until finished!
