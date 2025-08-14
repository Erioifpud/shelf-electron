import { Transform, type TransformCallback } from 'stream';

/**
 * A Transform stream that consumes raw bytes and produces full, length-prefixed frames.
 *
 * This class implements the core protocol parsing logic in an idiomatic Node.js
 * fashion. It is designed to be piped from a raw byte stream (like an Http2Stream)
 * and will, in turn, emit fully assembled data frames as distinct 'data' events.
 *
 * @remarks
 * The primary advantage of using a `Transform` stream is its built-in, automatic
 * handling of backpressure. If the downstream consumer of this parser is slow,
 * this stream's internal readable buffer will fill. When full, `this.push()`
 * will return `false`, and the stream machinery automatically stops consuming
 * data from the upstream source (the `Http2Stream`) until the buffer has drained.
 * This prevents memory leaks and deadlocks in high-throughput scenarios.
 */
export class FrameParser extends Transform {
  private buffer: Buffer = Buffer.alloc(0);
  private expectedFrameSize: number | null = null;

  constructor() {
    // readableHighWaterMark sets the buffer size for the *output* side of this
    // Transform stream. It controls how many parsed frames we can buffer before
    // applying backpressure to the upstream source.
    super({ readableHighWaterMark: 16 * 1024 });
  }

  /**
   * The internal implementation of the transform logic, called by the stream
   * runtime whenever a new chunk of data is available from the upstream source.
   * @param chunk A chunk of raw data from the source stream.
   * @param _encoding The encoding of the chunk (ignored, we work with Buffers).
   * @param callback A function to be called when processing of the current
   * chunk is complete. This signals readiness for the next chunk.
   */
  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    // Append the new chunk to our internal assembly buffer.
    this.buffer = Buffer.concat([this.buffer, chunk]);

    try {
      // Loop to process as many full frames as possible from the current buffer.
      while (true) {
        // State 1: We are waiting for the 4-byte length prefix.
        if (this.expectedFrameSize === null) {
          if (this.buffer.length < 4) {
            // Not enough data for the length prefix. Stop and wait for more.
            break;
          }
          // We have enough data. Read the size of the next frame's payload.
          this.expectedFrameSize = this.buffer.readUInt32BE(0);
          // Consume the length prefix from the buffer.
          this.buffer = this.buffer.subarray(4);
        }

        // State 2: We have the length, now wait for the full frame payload.
        if (this.buffer.length < this.expectedFrameSize) {
          // The full frame has not yet arrived. Stop and wait for more data.
          break;
        }

        // A complete frame is available. Extract it.
        const framePayload = this.buffer.subarray(0, this.expectedFrameSize);

        // Consume the extracted frame from our assembly buffer.
        this.buffer = this.buffer.subarray(this.expectedFrameSize);

        // Reset state to prepare for the next frame's length prefix.
        this.expectedFrameSize = null;

        // CRITICAL: Push the completed frame payload to the readable side.
        // This makes it available to downstream consumers (e.g., via a 'data'
        // event). This single call implicitly handles all backpressure logic.
        this.push(framePayload);
      }

      // Signal that we have successfully processed this chunk and are ready for more.
      callback();
    } catch (error: any) {
      // If a parsing error occurs (e.g., buffer manipulation fails),
      // pass it to the stream to signal a fatal error state.
      callback(error);
    }
  }

  /**
   * Called by the stream runtime when the upstream source has ended.
   * This method ensures that the stream ends in a clean state.
   * @param callback A function to call when flushing is complete.
   */
  _flush(callback: TransformCallback): void {
    if (this.buffer.length > 0) {
      // If the source stream ends but we still have buffered data, it means
      // a message was truncated mid-transmission. This is a protocol error.
      callback(new Error('Stream ended with incomplete frame data.'));
    } else {
      // The buffer is empty, indicating a clean shutdown.
      callback();
    }
  }
}