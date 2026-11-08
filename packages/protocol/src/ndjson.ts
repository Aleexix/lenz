/** Splits a byte stream into newline-delimited JSON frames. */
export class NdjsonDecoder {
  private buffer = ''

  push(chunk: string): unknown[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    const frames: unknown[] = []
    for (const line of lines) {
      if (line.trim() === '') continue
      frames.push(JSON.parse(line))
    }
    return frames
  }
}

export function encodeFrame(frame: unknown): string {
  return `${JSON.stringify(frame)}\n`
}
