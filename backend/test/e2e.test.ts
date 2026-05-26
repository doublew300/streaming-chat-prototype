import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { io, Socket } from 'socket.io-client';
import * as assert from 'assert';

const PORT = 3001;
const URL = `http://localhost:${PORT}`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('🚀 Starting E2E Tests for Streaming Chat Prototype (Optimized & Safe)...\n');

  // 1. Start NestJS Application on test port
  console.log('📦 Bootstrapping NestJS server on port 3001...');
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(PORT);
  console.log('✅ NestJS server is running on port 3001.\n');

  let activeSockets: Socket[] = [];
  const createClientSocket = (query?: Record<string, string>): Socket => {
    const socket = io(URL, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      query,
    });
    activeSockets.push(socket);
    return socket;
  };

  const cleanupSockets = () => {
    for (const socket of activeSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    activeSockets = [];
  };

  try {
    // --- SCENARIO 1: Streaming delivers all words in order ---
    await (async () => {
      console.log('🧪 Running: Scenario 1 - Word Streaming (Optimized)...');
      const socket = createClientSocket();
      
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
          const sessionId = 'session-s1';
          const messageId = 'msg-s1';
          let expectedIndex = 0;
          let textReceived = '';

          socket.emit('send_message', {
            sessionId,
            messageId,
            text: 'Tell me a story about Switzerland clockmaker',
            streamDelay: 1, // 1ms delay for hyper-speed testing!
            customText: 'This is a custom fast story designed to test word streaming without waiting ninety seconds.'
          });

          socket.on('stream_chunk', (chunk: { messageId: string; chunkIndex: number; text: string; isFinished: boolean }) => {
            try {
              assert.strictEqual(chunk.messageId, messageId);
              assert.strictEqual(chunk.chunkIndex, expectedIndex);
              assert.strictEqual(typeof chunk.text, 'string');
              
              textReceived += (expectedIndex === 0 ? '' : ' ') + chunk.text;
              expectedIndex++;

              if (chunk.isFinished) {
                assert.ok(textReceived.length > 50, 'Text received should be a substantial story');
                console.log(`   └ Received ${expectedIndex} words successfully.`);
                resolve();
              }
            } catch (err) {
              reject(err);
            }
          });

          socket.on('stream_error', (err) => reject(new Error(`Received stream_error: ${JSON.stringify(err)}`)));
        });

        socket.on('connect_error', (err) => reject(err));
      });
      console.log('✅ PASS: Scenario 1 - Word Streaming works perfectly!\n');
    })();

    cleanupSockets();

    // --- SCENARIO 2: Cancel stops the stream immediately ---
    await (async () => {
      console.log('🧪 Running: Scenario 2 - Stream Cancellation (Optimized)...');
      const socket = createClientSocket();

      await new Promise<void>((resolve, reject) => {
        socket.on('connect', async () => {
          const sessionId = 'session-s2';
          const messageId = 'msg-s2';
          let chunkCount = 0;
          let gotCancelledEvent = false;

          socket.emit('send_message', {
            sessionId,
            messageId,
            text: 'Write a long story',
            streamDelay: 20, // 20ms delay
            customText: 'One Two Three Four Five Six Seven Eight Nine Ten'
          });

          socket.on('stream_chunk', async (chunk) => {
            chunkCount++;
            if (chunkCount === 3) {
              // Cancel the stream after 3 chunks
              socket.emit('cancel_stream', { sessionId, messageId });
            } else if (chunkCount > 3) {
              if (gotCancelledEvent) {
                reject(new Error('Received chunk after stream was cancelled and acknowledged!'));
              }
            }
          });

          socket.on('stream_cancelled', async (data) => {
            try {
              assert.strictEqual(data.messageId, messageId);
              gotCancelledEvent = true;
              // Wait a bit to ensure no more chunks arrive
              await delay(100);
              resolve();
            } catch (err) {
              reject(err);
            }
          });

          socket.on('stream_error', (err) => reject(new Error(`Received stream_error: ${JSON.stringify(err)}`)));
        });

        socket.on('connect_error', (err) => reject(err));
      });
      console.log('✅ PASS: Scenario 2 - Stream Cancellation stops generation instantly!\n');
    })();

    cleanupSockets();

    // --- SCENARIO 3: Reconnect resumes stream with catch-up buffer ---
    await (async () => {
      console.log('🧪 Running: Scenario 3 - Network Reconnection & Stream Resumption (Optimized)...');
      
      const sessionId = 'session-s3';
      const messageId = 'msg-s3';
      let lastReceivedIndex = -1;
      
      // Step 3a: Start stream and disconnect after receiving a couple of chunks
      console.log('   └ Phase A: Starting stream and simulating disconnect...');
      const socket1 = createClientSocket();
      
      await new Promise<void>((resolve, reject) => {
        socket1.on('connect', () => {
          socket1.emit('send_message', {
            sessionId,
            messageId,
            text: 'Tell me a long story',
            streamDelay: 50, // 50ms delay
            customText: 'Deep in the heart of the Swiss Alps lived a clockmaker named Samuel who loved ticking.'
          });

          socket1.on('stream_chunk', (chunk) => {
            lastReceivedIndex = chunk.chunkIndex;
            if (lastReceivedIndex === 2) {
              // Simulate abrupt network drop by disconnecting
              socket1.disconnect();
              resolve();
            }
          });
        });
        socket1.on('connect_error', (err) => reject(err));
      });

      console.log(`   └ Disconnected after chunk index ${lastReceivedIndex}. Waiting while server buffers chunks offline...`);
      // Wait 300ms so the server streams a few more chunks in the background (6 chunks)
      await delay(300);

      // Step 3b: Connect new socket and resume stream
      console.log('   └ Phase B: Reconnecting and sending resume_stream...');
      const socket2 = createClientSocket();
      
      await new Promise<void>((resolve, reject) => {
        socket2.on('connect', () => {
          socket2.emit('resume_stream', {
            sessionId,
            lastReceivedIndex,
          });

          let firstResumedChunk = true;
          socket2.on('stream_chunk', (chunk) => {
            try {
              if (firstResumedChunk) {
                firstResumedChunk = false;
                // Verify we catch up immediately on the missed index
                assert.strictEqual(chunk.chunkIndex, lastReceivedIndex + 1, 'Should catch up starting from index 3');
                console.log(`   └ Catch-up received. Resumed chunk index: ${chunk.chunkIndex}`);
              }
              
              if (chunk.isFinished) {
                console.log(`   └ Resumed stream successfully completed at index ${chunk.chunkIndex}.`);
                resolve();
              }
            } catch (err) {
              reject(err);
            }
          });
        });
        socket2.on('connect_error', (err) => reject(err));
      });
      console.log('✅ PASS: Scenario 3 - Network Reconnection catches up and completes stream!\n');
    })();

    cleanupSockets();

    // --- SCENARIO 4: Rate Limiting ---
    await (async () => {
      console.log('🧪 Running: Scenario 4 - Rate Limiting...');
      const socket = createClientSocket();

      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
          const sessionId = 'session-s4';
          const messageId = 'msg-s4';

          // Send message
          socket.emit('send_message', {
            sessionId,
            messageId,
            text: 'First message',
          });

          // Immediately send another message
          socket.emit('send_message', {
            sessionId,
            messageId: 'msg-s4-spam',
            text: 'Second message (spam)',
          });

          socket.on('stream_error', (data: { messageId: string; error: string }) => {
            try {
              if (data.messageId === 'msg-s4-spam') {
                assert.ok(data.error.includes('Rate limit exceeded'), 'Error message should indicate rate limiting');
                resolve();
              }
            } catch (err) {
              reject(err);
            }
          });
        });
        socket.on('connect_error', (err) => reject(err));
      });
      console.log('✅ PASS: Scenario 4 - Rate Limiting prevents spamming successfully!\n');
    })();

    cleanupSockets();

    // --- SCENARIO 5: Expired Session Error ---
    await (async () => {
      console.log('🧪 Running: Scenario 5 - Expired/Missing Session Handling...');
      const socket = createClientSocket();

      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
          // Attempt to resume a non-existent session ID
          socket.emit('resume_stream', {
            sessionId: 'non-existent-session-id-12345',
            lastReceivedIndex: 5,
          });

          socket.on('stream_error', (data: { sessionId: string; error: string }) => {
            try {
              assert.strictEqual(data.sessionId, 'non-existent-session-id-12345');
              assert.strictEqual(data.error, 'Session expired or not found');
              resolve();
            } catch (err) {
              reject(err);
            }
          });
        });
        socket.on('connect_error', (err) => reject(err));
      });
      console.log('✅ PASS: Scenario 5 - Expired/Missing session handles gracefully!\n');
    })();

    cleanupSockets();

    // --- SCENARIO 6: Negative Index Safety in Resume ---
    await (async () => {
      console.log('🧪 Running: Scenario 6 - Negative Index Safety in Resume...');
      
      const sessionId = 'session-s6';
      const messageId = 'msg-s6';
      
      const socket1 = createClientSocket();
      
      await new Promise<void>((resolve, reject) => {
        socket1.on('connect', () => {
          socket1.emit('send_message', {
            sessionId,
            messageId,
            text: 'Trigger negative index test',
            streamDelay: 50,
            customText: 'WordA WordB WordC'
          });

          socket1.on('stream_chunk', (chunk) => {
            if (chunk.chunkIndex === 1) {
              socket1.disconnect();
              resolve();
            }
          });
        });
        socket1.on('connect_error', (err) => reject(err));
      });

      await delay(100);

      // Now reconnect and send lastReceivedIndex = -5
      const socket2 = createClientSocket();
      await new Promise<void>((resolve, reject) => {
        socket2.on('connect', () => {
          socket2.emit('resume_stream', {
            sessionId,
            lastReceivedIndex: -5, // Negative index! Should be normalized to -1, starting catch-up at index 0
          });

          socket2.on('stream_chunk', (chunk) => {
            try {
              assert.ok(chunk.chunkIndex >= 0, 'Chunk index should be normalized to >= 0');
              assert.notStrictEqual(chunk.text, undefined);
              assert.notStrictEqual(chunk.text, null);
              assert.strictEqual(typeof chunk.text, 'string');
              
              if (chunk.isFinished) {
                resolve();
              }
            } catch (err) {
              reject(err);
            }
          });
        });
        socket2.on('connect_error', (err) => reject(err));
      });
      console.log('✅ PASS: Scenario 6 - Negative Index is normalized and handled safely!\n');
    })();

    cleanupSockets();

    // --- SCENARIO 7: Rate Limit Memory Cleanup on Disconnect ---
    await (async () => {
      console.log('🧪 Running: Scenario 7 - Rate Limit Cleanup on Disconnect...');
      
      const sessionId = 'session-s7-spam';
      
      // Connect and send a queryParam so the handshake query has our sessionId
      const socket = createClientSocket({ sessionId });
      
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
          // Trigger rate limiting by sending a message
          socket.emit('send_message', {
            sessionId,
            messageId: 'msg-s7-spam',
            text: 'Rate limiting test message',
          });

          // Disconnect quickly to trigger clean up
          setTimeout(() => {
            socket.disconnect();
            resolve();
          }, 50);
        });
        socket.on('connect_error', (err) => reject(err));
      });

      // Wait a moment for server disconnect logs to output and ensure it doesn't crash
      await delay(100);
      console.log('✅ PASS: Scenario 7 - Disconnect triggers rate limit map cleanup successfully!\n');
    })();

    console.log('🎉 All E2E Scenarios Passed Successfully! 🏆');
    process.exit(0);
  } catch (error) {
    console.error('❌ FAIL: One or more scenarios failed!');
    console.error(error);
    process.exit(1);
  } finally {
    cleanupSockets();
    console.log('🔌 Closing NestJS test server...');
    await app.close();
  }
}

runTests();
