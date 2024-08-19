import { EventTarget2 } from "@freezm-ltd/event-target-2";
import { fitMetaByteStream, mergeStream, sliceByteStream } from "@freezm-ltd/stream-utils";

export const CACHE_CHUNK_SIZE = 10 * 1024 * 1024 // 10MiB

export class CacheBucket extends EventTarget2 {
    bucket: Cache | null = null
    writing: Map<string, ReadableStream<Uint8Array>> = new Map()

    constructor(
        readonly id: string,
        readonly chunkSize: number = CACHE_CHUNK_SIZE
    ) {
        super()
        this.init()
    }

    async init() {
        this.bucket = await caches.open(`CacheBucket:${this.id}`)
        this.dispatch("init")
    }

    pathNumber(path: string, number: number) {
        return `${path}:${number}`
    }

    async set(path: string, data: ReadableStream<Uint8Array>, at = 0) {
        if (!path.startsWith("/")) path = "/" + path;

        if (!this.bucket) await this.waitFor("init");
        const bucket = this.bucket!

        const startNumber = Math.floor(at / this.chunkSize)
        const padIndex = at % this.chunkSize
        if (padIndex > 0) { // need padding
            let padding: ReadableStream<Uint8Array>
            const match = await bucket.match(this.pathNumber(path, startNumber))
            if (match) {
                padding = match.body!.pipeThrough(sliceByteStream(0, padIndex))
            } else {
                padding = (new Blob([new ArrayBuffer(padIndex)])).stream()
            }
            const source = data
            data = mergeStream([() => padding, () => source])
        }

        const reader = data.pipeThrough(fitMetaByteStream(this.chunkSize)).getReader()
        let number = startNumber
        let loop = true
        while (loop) {
            const { done, value } = await reader.read()
            if (done) break;

            const [stream1, stream2] = value.tee()
            if (this.writing.get(path)?.locked) this.writing.get(path)!.cancel("expired"); // for GC
            this.writing.set(path, stream2)
            this.dispatch("caching", { path, number })

            await bucket.put(this.pathNumber(path, number), new Response(stream1))
            number++
        }
    }

    /*async get(path: string, at = 0, length?: number): Promise<ReadableStream<Uint8Array> | null> {
        if (!path.startsWith("/")) path = "/" + path;

        if (!this.bucket) await this.waitFor("init");
        const bucket = this.bucket!


    }*/
}