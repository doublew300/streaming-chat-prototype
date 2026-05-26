import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface StreamSession {
  sessionId: string;
  messageId: string;
  socketId: string;
  words: string[];
  sentChunks: string[];
  timer: NodeJS.Timeout | null;
  isFinished: boolean;
  isCancelled: boolean;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  // Shorten pingInterval and pingTimeout to detect disconnects within seconds
  pingInterval: 2000,
  pingTimeout: 2000,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map to track active sessions
  private sessions = new Map<string, StreamSession>();

  // Predefined long texts (~500 words each) for the bot response
  private presetTexts = [
    // Story 1: The Swiss Clockmaker (approx 450 words)
    `Deep in the heart of the Swiss Alps, in a valley where the morning mist clung to the pine trees like soft wool, lived an old clockmaker named Samuel. For fifty years, Samuel had worked in his small wooden workshop, surrounded by the gentle ticking of hundreds of clocks. To him, the sound was not a noise, but a living heartbeat. He crafted pocket watches, grandfather clocks, and intricate cuckoos, each one a masterpiece of gears and springs. The villagers said that Samuel didn't just build clocks; he put a tiny piece of his soul into each one. One chilly autumn afternoon, a young traveler arrived at Samuel’s shop. The traveler carried a broken watch of unusual design, made of dark brass and inlaid with strange blue stones. 'No one in Zurich or Geneva could fix this,' the traveler said, placing it on the velvet counter. Samuel put on his magnifying eyepiece and peered into the watch's delicate innards. Inside, he found a complex array of overlapping gears that moved not in circles, but in gentle waves. It was a water-clock mechanism shrunk to the size of a pocket watch. Smiling, Samuel spent the next three days and nights working under the warm light of his oil lamp. He carefully forged a new microscopic escape wheel, polished the axles, and oiled the gears with finest pine oil. On the fourth morning, as the sun broke over the snow-covered peaks, the brass watch began to tick, making a sound like tiny raindrops falling on a glass pane. The traveler was overjoyed and asked Samuel how he had succeeded where the master watchmakers of the cities had failed. Samuel smiled and replied, 'The others tried to force the watch to keep their time. I simply listened to the rhythm it wanted to keep.' From that day on, the valley seemed even more peaceful, and Samuel continued his work, reminding everyone that time is not something to be conquered, but a beautiful melody to be shared.`,
    
    // Story 2: The Whispering Library (approx 450 words)
    `In the forgotten city of Oakhaven, hidden behind an ivy-covered wall, stood the Whispering Library. Unlike normal libraries, the books here did not wait silently on shelves. Instead, they murmured softly in the dark, their pages rustling like dry leaves. If you walked down the narrow aisles and listened closely, you could hear fragments of ancient poems, recipes for forgotten stews, and the laughter of heroes from long-lost empires. The library's keeper was Elena, a quiet woman who wore spectacles on a silver chain. She knew every book by its voice. She knew that the leather-bound volume on shelf four was a dramatic play that loved to weep, and the small green diary in the corner was a shy romance that only spoke in whispers. One evening, a storm raged outside, throwing sheets of rain against the stained-glass windows. A young boy named Leo slipped into the library to seek shelter. As he stood shivering near the entrance, he was startled by a soft voice calling his name. He followed the sound deep into the oldest section, where the shelves reached high into the shadows. On a dusty reading table sat an open book with blank parchment pages. 'Welcome, Leo,' the book whispered in a warm, welcoming tone. 'I am the Book of Tomorrow, and I have been waiting for someone to write my stories.' Leo, who had always dreamed of being an adventurer but felt too small, took a black ink quill from the table. Encouraged by Elena, who watched from the shadows with a gentle smile, Leo began to write. He wrote about a boy who sailed across a sea of stars on a ship made of cloud. As he wrote, the blank pages began to glow with vibrant colors, and the library around him filled with the scent of stardust and ocean breeze. The other books clapped their pages in joy. Leo realized that he didn't need to wait for adventures to find him; he could create them with his own imagination, and the library would whisper his story forever.`,
    
    // Story 3: The Starfarer (approx 450 words)
    `The starship Odyssey glided silently through the dark ocean of the cosmos, its silver hull reflecting the distant glow of a thousand nebulae. Inside, Commander Clara sat in the observation deck, watching the colorful dust clouds of the Orion arm swirl like paint in water. The ship was on a historic voyage to find a habitable world beyond the known solar systems, a journey that had already lasted seven long years. The crew of fifty scientists and explorers were mostly asleep in cryo-pods, leaving Clara and the ship’s artificial intelligence, Arthur, to steer through the vast emptiness. Clara looked at the holographic console. 'Arthur, how far to the next system?' she asked. The AI responded in a calm, melodic voice, 'We are three light-years away, Clara. All systems are stable, and the crew's bio-signals are perfect.' Clara sighed, feeling the weight of the endless empty space. She missed the green fields of Earth, the smell of damp grass after a summer shower, and the sound of birds singing in the morning. To pass the time, Clara often told Arthur stories of Earth, describing the simple beauty of things the machine could never physically experience. Suddenly, a bright red warning light flashed on the console. 'Alert,' Arthur reported, 'an asteroid swarm is approaching on a collision course. Shield power is at forty percent.' Clara's training immediately took over. She grabbed the manual flight controls, her fingers flying across the touchscreens. With expert precision, she steered the massive starship through the rocky debris, executing tight rolls and sudden thruster burns. Arthur calculated optimal trajectories in real-time, highlighting safe pathways in blue. A large boulder flew past the viewing port, missing the ship by mere meters, but they emerged into the clear space unharmed. As the warning lights turned off, Clara leaned back in her chair, her heart pounding. Arthur spoke softly, 'That was impressive piloting, Clara. It reminded me of your story about white-water rafting on the Colorado River.' Clara laughed, realizing that even in the cold depths of space, human spirit and memory kept them alive, steering them safely toward their new home.`
  ];

  handleConnection(client: Socket) {
    console.log(`Client connected: Socket ID = ${client.id}`);
    // Acknowledge connection
    client.emit('connection_ack', { status: 'connected' });
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: Socket ID = ${client.id}`);
    
    // We do NOT delete the session immediately! We want to support resume.
    // We just find the session and log that the socket is gone.
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.socketId === client.id) {
        console.log(`Session ${sessionId} lost its active socket. Stream is kept in memory.`);
        // We do not stop the timer; the stream continues generating in the background.
        // Once the timer completes or the client cancels, it will clean up.
      }
    }
  }

  @SubscribeMessage('send_message')
  handleSendMessage(
    @MessageBody() data: { sessionId: string; messageId: string; text: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, messageId, text } = data;
    console.log(`Received send_message: sessionId=${sessionId}, messageId=${messageId}, text="${text}"`);

    if (!sessionId || !messageId) {
      client.emit('stream_error', { messageId, error: 'Missing sessionId or messageId' });
      return;
    }

    // Cancel any existing session for this client first to avoid overlapping streams
    this.cleanupSession(sessionId);

    // Select a random long text
    const randomIndex = Math.floor(Math.random() * this.presetTexts.length);
    const selectedText = this.presetTexts[randomIndex];
    
    // Split by space/whitespace into words
    const words = selectedText.split(/\s+/);

    const session: StreamSession = {
      sessionId,
      messageId,
      socketId: client.id,
      words,
      sentChunks: [],
      timer: null,
      isFinished: false,
      isCancelled: false,
    };

    this.sessions.set(sessionId, session);

    // Start streaming: 5 words per second means 1 word every 200ms
    session.timer = setInterval(() => {
      this.streamNextWord(sessionId);
    }, 200);
  }

  @SubscribeMessage('cancel_stream')
  handleCancelStream(
    @MessageBody() data: { sessionId: string; messageId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, messageId } = data;
    console.log(`Received cancel_stream: sessionId=${sessionId}, messageId=${messageId}`);

    const session = this.sessions.get(sessionId);
    if (session && session.messageId === messageId) {
      session.isCancelled = true;
      this.cleanupSession(sessionId);
      client.emit('stream_cancelled', { messageId });
    }
  }

  @SubscribeMessage('resume_stream')
  handleResumeStream(
    @MessageBody() data: { sessionId: string; lastReceivedIndex: number },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, lastReceivedIndex } = data;
    console.log(`Received resume_stream: sessionId=${sessionId}, lastReceivedIndex=${lastReceivedIndex}`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`No active session found for sessionId=${sessionId} to resume.`);
      return;
    }

    // Update the socket ID to the client's new socket
    session.socketId = client.id;
    console.log(`Session ${sessionId} re-associated with new Socket ID = ${client.id}`);

    // Fast catch-up: Send all chunks from lastReceivedIndex + 1 to session.sentChunks.length - 1
    const missingStartIndex = lastReceivedIndex + 1;
    const missingEndIndex = session.sentChunks.length;

    console.log(`Resuming session ${sessionId}. Sending missing chunks from index ${missingStartIndex} to ${missingEndIndex - 1}`);

    for (let i = missingStartIndex; i < missingEndIndex; i++) {
      const isChunkFinished = session.isFinished && (i === session.words.length - 1);
      client.emit('stream_chunk', {
        messageId: session.messageId,
        chunkIndex: i,
        text: session.sentChunks[i],
        isFinished: isChunkFinished,
      });
    }

    // If the stream was already finished, make sure the client knows
    if (session.isFinished && missingStartIndex >= session.words.length) {
      client.emit('stream_chunk', {
        messageId: session.messageId,
        chunkIndex: session.words.length - 1,
        text: session.words[session.words.length - 1],
        isFinished: true,
      });
    }
  }

  private streamNextWord(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.isCancelled || session.isFinished) {
      return;
    }

    const nextIndex = session.sentChunks.length;
    if (nextIndex >= session.words.length) {
      session.isFinished = true;
      this.cleanupSession(sessionId);
      return;
    }

    const word = session.words[nextIndex];
    session.sentChunks.push(word);

    const isLastWord = nextIndex === session.words.length - 1;
    if (isLastWord) {
      session.isFinished = true;
    }

    // Attempt to emit to the client if the socket is connected
    const socket = this.server.sockets.sockets.get(session.socketId);
    if (socket && socket.connected) {
      socket.emit('stream_chunk', {
        messageId: session.messageId,
        chunkIndex: nextIndex,
        text: word,
        isFinished: session.isFinished,
      });
    } else {
      console.log(`[Offline Stream] Session ${sessionId} generated chunk ${nextIndex} ("${word}"), but socket is disconnected. Buffered.`);
    }

    if (session.isFinished) {
      this.cleanupSession(sessionId);
    }
  }

  private cleanupSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.timer) {
        clearInterval(session.timer);
        session.timer = null;
      }
      // Keep completed sessions in memory briefly for reconnect buffers, 
      // but clean up their timers so CPU is not wasted.
      if (session.isFinished || session.isCancelled) {
        // We can keep the session around for a bit (e.g. 5 minutes) to allow reconnects,
        // then delete it to avoid memory leaks.
        setTimeout(() => {
          this.sessions.delete(sessionId);
          console.log(`Session ${sessionId} memory released.`);
        }, 5 * 60 * 1000); 
      }
    }
  }
}
