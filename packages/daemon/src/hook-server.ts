import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const MAX_BODY_BYTES = 1024 * 1024

/**
 * Loopback HTTP endpoint for agent hooks: POST /hooks/<token> with a JSON
 * body. Answers 200 with an empty body right away, which Claude Code reads as
 * "no decision", so hooks never change what the agent does.
 */
export class HookServer {
  private readonly server: Server
  port = 0

  constructor(private readonly onHook: (token: string, payload: unknown) => void) {
    this.server = createServer((request, response) => {
      const match = /^\/hooks\/([A-Za-z0-9_-]{8,128})$/.exec(request.url ?? '')
      if (request.method !== 'POST' || !match?.[1]) {
        response.writeHead(404).end()
        return
      }
      const token = match[1]
      const chunks: Buffer[] = []
      let size = 0
      request.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) request.destroy()
        else chunks.push(chunk)
      })
      request.on('end', () => {
        response.writeHead(200).end()
        try {
          this.onHook(token, JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          // A malformed body changes nothing.
        }
      })
    })
  }

  listen(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject)
        this.port = (this.server.address() as AddressInfo).port
        resolve(this.port)
      })
    })
  }

  close(): void {
    this.server.close()
  }
}
