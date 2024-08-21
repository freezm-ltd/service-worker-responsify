import { EventTarget2 } from "@freezm-ltd/event-target-2";
import { fitMetaByteStream, mergeStream, sliceByteStream } from "@freezm-ltd/stream-utils";

export const CACHE_CHUNK_SIZE = 10 * 1024 * 1024 // 10MiB

export class CacheBucket extends EventTarget2 {
    protected cache: Cache | null = null
    protected writing: Map<string, { stream: ReadableStream<Uint8Array>, number: number }> = new Map()
    static buckets: Map<string, CacheBucket> = new Map()

    private constructor(
        readonly id: string,
        readonly chunkSize: number = CACHE_CHUNK_SIZE
    ) {
        super()
    }

    static async new(id: string, chunkSize?: number) {
        let bucket = this.buckets.get(id)
        if (!bucket) {
            bucket = new CacheBucket(id, chunkSize)
            await bucket.init()
            this.buckets.set(id, bucket)
        }
        return bucket
    }

    static async drop(id: string) {
        if (await caches.has(id)) {
            const cache = await caches.open(id)
            for (let key of await cache.keys()) await cache.delete(key);
            await caches.delete(id)
        }
        this.buckets.delete(id)
    }

    async init() {
        this.cache = await caches.open(this.id)
        this.dispatch("init")
    }

    pathNumber(path: string, number: number) {
        return `${path}:${number}`
    }

    async set(path: string, data: ReadableStream<Uint8Array>, at = 0, abortController?: AbortController) {
        if (!path.startsWith("/")) path = "/" + path;

        if (!this.cache) await this.waitFor("init");
        const cache = this.cache!

        const startNumber = Math.floor(at / this.chunkSize)
        const padIndex = at % this.chunkSize
        if (padIndex > 0) { // need padding
            let padding: ReadableStream<Uint8Array>
            const match = await cache.match(this.pathNumber(path, startNumber))
            padding = (match ? (await match.blob()).slice(0, padIndex) : new Blob([new ArrayBuffer(padIndex)])).stream()
            const source = data
            data = mergeStream([() => padding, () => source])
        }

        const reader = data.pipeThrough(fitMetaByteStream(this.chunkSize)).getReader()
        let number = startNumber
        let loop = true
        this.writing.set(path, { stream: new ReadableStream(), number: -1 })
        while (loop) {
            const { done, value } = await reader.read()
            const deleted = !await caches.has(this.id)

            // GC
            const prev = this.writing.get(path)
            if (prev) prev.stream.cancel("CacheBucket: expired");

            if (done) break;
            if (deleted) {
                abortController?.abort("CacheBucket: expired")
                CacheBucket.drop(this.id)
                break
            }

            const [stream1, stream2] = value.tee()
            this.writing.set(path, { stream: stream2, number })

            const key = this.pathNumber(path, number)
            this.dispatch("caching", key)

            await cache.put(key, new Response(stream1))
            number++
        }
        this.writing.delete(path)
    }

    async get(path: string, at = 0, length: number): Promise<ReadableStream<Uint8Array>> {
        if (!path.startsWith("/")) path = "/" + path;

        if (!this.cache) await this.waitFor("init");
        const cache = this.cache!

        const startNumber = Math.floor(at / this.chunkSize)
        const endNumber = Math.floor((at + length) / this.chunkSize)
        const startOffset = at % this.chunkSize
        const endOffset = (at + length) % this.chunkSize

        const { readable, writable } = new TransformStream()
        const task = async () => {
            for (let i = startNumber; i <= endNumber; i++) {
                const key = this.pathNumber(path, i)
                const cached = await cache.match(key)
                let source = cached?.body
                if (!source) {
                    let writing = this.writing.get(path)
                    if (!writing) break // caching stopped
                    if (writing.number < i) { // need wait
                        await this.waitFor("caching", key)
                        writing = this.writing.get(path)!
                    }
                    const [stream1, stream2] = writing.stream.tee() // copy stream
                    writing.stream = stream1
                    source = stream2
                }

                // slice stream
                const sliceStart = i === startNumber && startOffset > 0
                const sliceEnd = i === endNumber && endOffset > 0
                if (sliceStart && sliceEnd) {
                    source = source.pipeThrough(sliceByteStream(startOffset, endOffset))
                } else if (sliceStart) {
                    source = source.pipeThrough(sliceByteStream(startOffset))
                } else if (sliceEnd) {
                    source = source.pipeThrough(sliceByteStream(0, endOffset))
                }

                await source.pipeTo(writable, { preventClose: true }).catch(() => { })
            }
            writable.close().catch(() => { })
        }

        task()
        return readable
    }
}