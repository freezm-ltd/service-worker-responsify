import { Messenger, MessengerFactory } from "@freezm-ltd/post-together"
import { precursor2request, request2precursor, RequestPrecursor, RequestPrecursorExtended, ReservedRequest, Responsified, responsify, ResponsifyResponse } from "./client"
import { EventTarget2 } from "@freezm-ltd/event-target-2"
import { sliceByteStream } from "@freezm-ltd/stream-utils"

function createId() {
    return crypto.randomUUID()
}

export type ResponsifiedGenerator = (request: Request) => Responsified | PromiseLike<Responsified>

export class Responser extends EventTarget2 {
    protected path = (new URL(self.registration.scope)).pathname + "_service-worker-responsify"
    protected messenger: Messenger
    protected address: WeakMap<WindowClient, Messenger> = new WeakMap()
    protected storage: Map<string, ResponsifiedGenerator> = new Map()
    protected cache: Cache | undefined
    protected static _instance: Responser
    protected constructor() {
        super()
        this.messenger = MessengerFactory.new(self as ServiceWorkerGlobalScope)
        this.messenger.response<null, ResponsifyResponse>("reserve", (_, e) => {
            const uurl = this.getUniqueURL()
            const client = e.source as unknown as WindowClient
            if (!this.address.has(client)) this.address.set(client, MessengerFactory.new(client));
            this.storage.set(uurl.id, async (request: Request) => {
                const messenger = this.address.get(client)
                const response = await messenger?.request<ReservedRequest, Responsified>("reserved", {
                    id: uurl.id,
                    precursor: request2precursor(request)
                }, request.body ? [request.body] : undefined)
                return response || { reuse: false, status: 404 }
            })
            return uurl
        })
        this.messenger.response<RequestPrecursorExtended, ResponsifyResponse>("store", (precursor) => {
            const uurl = this.getUniqueURL()
            this.storage.set(uurl.id, async (childRequest: Request) => {
                const parentRequest = precursor2request(precursor)
                // nest Range header
                const parentRange = parentRequest.headers.get("Range") as Range
                const childRange = (new Headers(childRequest.headers)).get("Range") as Range
                if (childRange) {
                    let range = childRange
                    if (parentRange) range = nestRange(parentRange, childRange);
                    parentRequest.headers.set("Range", range)
                }
                let response = await this.createResponse(parentRequest)
                if (parentRange && childRange && response.status === 206) {
                    const offset = parseRange(parentRange).start
                    const total = getRangeLength(parentRange)
                    const range = response.headers.get("Content-Range") as Range
                    const { start, end } = parseRange(range)
                    const headers = new Headers(response.headers)
                    headers.set("Content-Range", `bytes ${start - offset}-${end - offset}/${total > 0 ? total : Number(range.split("/").pop()) - offset}`)
                    response = new Response(response.body, { headers, status: response.status, statusText: response.statusText })
                }
                return responsify(response, { reuse: precursor.reuse })
            })
            return uurl
        })
        this.messenger.response<Responsified, ResponsifyResponse>("forward", (responsified) => {
            const uurl = this.getUniqueURL()
            this.storage.set(uurl.id, (request: Request) => {
                let result = responsified
                if (responsified.reuse && responsified.body instanceof ReadableStream) {
                    const { body, ...init } = responsified
                    const [stream1, stream2] = body.tee()
                    responsified.body = stream1
                    result = { body: stream2, ...init }
                }
                // range request
                if (request.headers.has("Range") && result.body instanceof ReadableStream) {
                    let { start, end } = parseRange(request.headers.get("Range") as Range)
                    if (end < 0 && responsified.length) end = responsified.length - 1;
                    result.body = result.body.pipeThrough(sliceByteStream(start, end < 0 ? undefined : (end + 1)))
                    const headers = new Headers(result.headers)
                    if (end < 0) {
                        headers.set("Content-Range", `bytes */*`)
                    } else {
                        headers.set("Content-Range", `bytes ${start}-${end}/${responsified.length || "*"}`)
                        headers.set("Content-Length", (end - start + 1).toString())
                    }
                    result.headers = Object.fromEntries([...headers])
                    result.status = 206
                    result.statusText = "Partial Content"
                }
                return result
            })
            return uurl
        })
        caches.open("service-worker-responsify-cache").then(cache => {
            this.cache = cache
            this.dispatch("init")
        })
        self.addEventListener("fetch", async (e: FetchEvent) => {
            const response = this.handleRequest(e.request)
            if (response) e.respondWith(response);
        })
    }

    handleRequest(request: Request) {
        if (this.parseId(request.url)) {
            return this.createResponse(request)
        }
    }

    async createResponse(request: Request) {
        const id = this.parseId(request.url)!
        if (this.storage.has(id)) {
            const responsified = await this.storage.get(id)!(request)
            const { reuse, body, ...init } = responsified
            if (!reuse) this.storage.delete(id);
            return new Response(body, init)
        }
        return await fetch(request) //new Response(undefined, { status: 404 })
    }

    parseId(url: string | URL) {
        url = new URL(url)
        if (url.pathname !== this.path) return;
        return url.searchParams.get("id")
    }

    getUniqueURL(): { id: string, url: string } {
        const id = createId()
        if (this.storage.has(id)) return this.getUniqueURL();
        return {
            id,
            url: `${location.origin}${this.path}?id=${id}`
        }
    }

    static activate() {
        if (!this._instance) this._instance = new Responser();
    }
}

type Range = `bytes=${number}-${number}` | `bytes=${number}-` | `bytes ${number}-${number}` | `bytes ${number}-`
function parseRange(range: Range, length?: number) {
    let start: number | string;
    let end: number | string;
    [, start, end] = /bytes[=\s](\d+)-(\d+)?/.exec(range)!;
    start = Number(start)
    end = Number(end) || length || -1
    return { start, end }
}
function getRangeLength(range: Range, length?: number) {
    const parsed = parseRange(range, length)
    const size = parsed.end - parsed.start + 1
    if (size < 0) return 0;
    return size
}
function nestRange(parentRange: Range, childRange: Range, parentLength?: number): Range {
    const parent = parseRange(parentRange, parentLength)
    const child = parseRange(childRange)
    child.start += parent.start
    if (child.end > 0) child.end += parent.start;
    return `bytes=${child.start}-${child.end > 0 ? child.end : parent.end > 0 ? parent.end : ""}`
}