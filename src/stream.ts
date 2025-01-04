type ByteRange = { start: number, end: number, current?: number }
type Source = (signal?: AbortSignal) => ReadableStream<Uint8Array>
type Receiver = (done: boolean, chunk?: Uint8Array, position?: number) => boolean
type Connection = { receiver: Receiver, range: ByteRange & { current: number } }
type StreamBufferOption = {
    lifespan?: number
    waitSizeMax?: number
    inspectDuration?: number
    signal?: AbortSignal
}

/**
 * Peek and buffering stream
 */

export class StreamBuffer {
    private static storage: Map<string, StreamBuffer[]> = new Map()

    static get(key: string, range: ByteRange, signal?: AbortSignal) {
        const buffers = this.storage.get(key)
        if (buffers) {
            for (let buffer of buffers) {
                if (buffer.has(range)) return buffer.read(range, signal);
            }
        }
    }

    static set(key: string, range: ByteRange, source: Source, option?: StreamBufferOption) {
        const buffers = this.storage.get(key)
        const buffer = new this(key, range, source, option)
        if (buffers) buffers.push(buffer);
        else this.storage.set(key, [buffer]);
        return buffer.read(range, option?.signal)
    }

    private lifespan = 5000 // 5s
    private abortTimeout: any
    private abortController = new AbortController()
    private connections: Connection[] = []

    private buffer: Uint8Array[] = []
    private buffered: ByteRange
    private waitSizeMax = 4 * 1024 * 1024 // 4MiB

    get bufferedSize() {
        return this.buffered.end - this.buffered.start
    }

    private constructor(
        readonly key: string,
        readonly range: ByteRange,
        readonly source: Source,
        option: StreamBufferOption = {},
    ) {
        if (option.lifespan) this.lifespan = option.lifespan;
        if (option.waitSizeMax) this.waitSizeMax = option.waitSizeMax;
        if (option.inspectDuration) this.inspectDuration = option.inspectDuration;

        this.buffered = { start: range.start, end: range.start }
        const stream = source(this.abortController.signal)
        this.init(stream)
    }

    private init(stream: ReadableStream<Uint8Array>) {
        const _this = this
        stream.pipeTo(new WritableStream({
            write(chunk) {
                _this.write(chunk)
            },
            close() {
                _this.close()
            }
        }))
        const interval = setInterval(() => {
            if (this.abortController.signal.aborted) return clearInterval(interval);
            this.inspect()
        }, this.inspectDuration);
    }

    // last read range start position
    private inspected: number[] = []
    private inspectDuration = 250 // 250ms
    private inspectMaxLength = this.lifespan / this.inspectDuration
    private inspect() {
        if (this.connections.length === 0) return; // skip if no connection

        const min = Math.min(...this.connections.map(({ range: { current } }) => current))

        this.inspected.push(min)

        if (this.inspected.length === this.inspectMaxLength) {
            const truncate = this.inspected.shift()
            if (truncate === undefined) return; // skip if no inspection

            const buffer = this.buffer
            let position = this.buffered.start
            for (let i = 0; i < buffer.length; i++) {
                const next = position + buffer[i].length
                if (truncate < next) { // truncate
                    buffer.splice(0, i)
                    this.buffered.start = position
                    break;
                }
                position = next
            }
        }
    }

    private has({ start, end }: ByteRange) {
        return !this.abortController.signal.aborted && this.buffered.start <= start && start <= this.buffered.end + this.waitSizeMax && end <= this.range.end
    }

    private write(chunk: Uint8Array) {
        // push
        this.buffer.push(chunk)
        const position = this.buffered.end
        this.buffered.end = position + chunk.length
        // transmit
        for (let { receiver } of this.connections) {
            receiver(false, chunk, position)
        }
    }

    private close() {
        for (let { receiver } of this.connections) {
            receiver(true)
        }
    }

    private read(_range: ByteRange, signal?: AbortSignal) {
        if (this.abortTimeout) {
            clearTimeout(this.abortTimeout)
            this.abortTimeout = undefined
        };

        let receiver: Receiver
        let connection: Connection
        let disconnected = false
        const range = { ..._range, current: _range.start }

        const disconnect = () => {
            if (disconnected) return;
            disconnected = true
            const index = this.connections.indexOf(connection)
            if (index > -1) this.connections.splice(this.connections.indexOf(connection), 1);
            if (this.connections.length === 0) {
                if (this.abortTimeout) clearTimeout(this.abortTimeout);
                this.abortTimeout = setTimeout(() => this.expire(), this.lifespan);
            }
        }

        signal?.addEventListener("abort", disconnect)

        const connect = (controller: ReadableStreamDefaultController<Uint8Array>) => {
            receiver = (done, chunk, position) => {
                const { current, end } = range
                if (chunk && position !== undefined) {
                    const next = position + chunk.length
                    if (next <= current) return false; // skip
                    if (position < current) {
                        chunk = chunk.slice(current - position)
                        position = current
                    }
                    if (end < next) {
                        chunk = chunk.slice(0, end - position)
                        controller.enqueue(chunk)
                        controller.close()
                        disconnect()
                        return true
                    }
                    controller.enqueue(chunk)
                    range.current = next
                    return false
                }
                if (!done) return false;
                controller.close()
                disconnect()
                return true
            }

            // process buffered data first
            let position = this.buffered.start
            for (let chunk of this.buffer) {
                if (receiver(false, chunk, position)) return; // early return if done
                position += chunk.length
            }

            connection = { receiver, range }
            this.connections.push(connection)
        }

        return new ReadableStream<Uint8Array>({
            start: connect,
            cancel: disconnect,
        })
    }

    private expire() {
        if (this.connections.length > 0) return;
        this.abortController.abort("expired")
        const buffers = StreamBuffer.storage.get(this.key)
        if (buffers) buffers.splice(buffers.indexOf(this), 1);
    }
}
