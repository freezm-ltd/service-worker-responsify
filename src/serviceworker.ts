import { Messenger, MessengerFactory } from "@freezm-ltd/post-together"
import { MergeRequest, PartRequest, precursor2request, request2precursor, RequestPrecursor, RequestPrecursorExtended, ReservedRequest, Responsified, responsify, ResponsifyResponse, ZipEntryRequest, ZipRequest } from "./client"
import { EventTarget2 } from "@freezm-ltd/event-target-2"
import { mergeStream, sliceByteStream } from "@freezm-ltd/stream-utils"
import { makeZip, predictLength } from "client-zip"

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
                if (request.method === "HEAD") { // HEAD
                    result.body = undefined
                }
                if (responsified.reuse && responsified.body instanceof ReadableStream) { // GET
                    const { body, ...init } = responsified
                    const [stream1, stream2] = body.tee()
                    responsified.body = stream1
                    result = { body: stream2, ...init }
                }
                // range request
                if (request.headers.has("Range")) { // HEAD, GET
                    const headers = new Headers(result.headers)
                    let { start, end } = parseRange(request.headers.get("Range") as Range)
                    // @ts-ignore
                    if (end < 0 && result.body && "length" in result.body) end = result.body.length - 1;
                    if (end < 0 && responsified.length) end = responsified.length - 1;
                    if (end < 0) headers.set("Content-Range", `bytes */*`)
                    else {
                        headers.set("Content-Range", `bytes ${start}-${end}/${responsified.length || "*"}`)
                        headers.set("Content-Length", (end - start + 1).toString())
                    }
                    if (result.body) { // GET
                        if (result.body instanceof ReadableStream) {
                            result.body = result.body.pipeThrough(sliceByteStream(start, end < 0 ? undefined : (end + 1)))
                        } else {
                            if ("buffer" in (result.body as ArrayBufferView)) {
                                result.body = (result.body as ArrayBufferView).buffer
                            }
                            result.body = (result.body as any).slice(start, end + 1)
                        }
                    }
                    result.headers = Object.fromEntries([...headers])
                    result.status = 206
                    result.statusText = "Partial Content"
                }
                return result
            })
            return uurl
        })
        this.messenger.response<MergeRequest, ResponsifyResponse>("merge", (merge) => {
            merge.sort((a, b) => a.index - b.index)
            const uurl = this.getUniqueURL()
            const reuse = merge.every(part => part.request.reuse)
            this.storage.set(uurl.id, (request: Request) => {
                const result: Responsified = { reuse }
                const parts: Array<RequestPrecursor> = []
                const contentRange = { start: -1, end: -1 }
                const lastPart = merge[merge.length - 1]
                const total = lastPart.length ? lastPart.index + lastPart.length : undefined

                if (request.headers.has("Range")) { // range request
                    const range = request.headers.get("Range") as Range
                    let { start, end } = parseRange(range, total)
                    end += 1
                    if (end < 1) end = Number.MAX_SAFE_INTEGER;
                    for (let i = 0; i < merge.length; i++) {
                        const p1 = merge[i].index
                        const p2 = merge[i + 1]?.index || Number.MAX_SAFE_INTEGER

                        if (p2 <= start || end <= p1) { //  --[==]--<-->-- or --<-->--[==]--
                            // skip
                            continue
                        }

                        const part = structuredClone(merge[i].request)
                        let range = ""

                        if (start <= p1 && p2 <= end) { // --<--[==]-->--  ;  [==]
                            // entire range
                        }
                        else if (p1 <= start && end <= p2) { // --[==<==>==]--  ;  <==>
                            contentRange.start = start
                            if (end === p2 && p2 === Number.MAX_SAFE_INTEGER) {
                                range = `bytes=${start - p1}-`
                            } else {
                                range = `bytes=${start - p1}-${end - p1 - 1}`
                                contentRange.end = end - 1
                            }
                        }
                        else if (p1 <= start && start < p2) { // --[==<==]-->--  ;  <==]
                            range = `bytes=${start - p1}-`
                            contentRange.start = start
                        }
                        else if (p1 < end && end <= p2) { // --<--[==>==]--  ;  [==>
                            contentRange.start = start
                            if (end === p2 && p2 === Number.MAX_SAFE_INTEGER) {
                                // entire range
                            } else {
                                range = `bytes=0-${end - p1 - 1}`
                                contentRange.end = end - 1
                            }
                        }

                        if (range) {
                            const headers = new Headers(part.headers)
                            headers.set("Range", range)
                            part.headers = Object.fromEntries([...headers])
                        }
                        parts.push(part)
                    }
                    result.status = 206
                    result.statusText = "Partial Content"
                    {
                        const { start, end } = contentRange
                        result.headers = {
                            "Content-Range": `bytes ${start}-${end < 0 ? "" : end}/${total ? total : "*"}`,
                            "Content-Length": end < 0 ? "" : (end - start + 1).toString()
                        }
                    }
                } else {
                    parts.push(...merge.map(m => m.request))
                    result.status = 200
                    result.statusText = "OK"
                }
                result.headers = result.headers || {}
                result.headers["Accept-Ranges"] = "bytes"

                if (request.method === "GET") {
                    const generators = parts.map((p) => async () => (await this.createResponse(precursor2request(p))).body!)
                    result.body = mergeStream(generators)
                }

                return result
            })

            return uurl
        })
        this.messenger.response<ZipRequest, ResponsifyResponse>("zip", (zip) => {
            const uurl = this.getUniqueURL()
            const reuse = zip.entries.every(entry => entry.request.reuse)
            const name = zip.name.toLowerCase().lastIndexOf(".zip") === zip.name.length - 4 ? zip.name : zip.name + ".zip"
            let size = 0n
            if (zip.entries.every(entry => !!entry.size)) {
                try {
                    size = predictLength(zip.entries.map(entry => {
                        return { name: entry.name, size: entry.size! }
                    }))
                } catch { }
            }
            this.storage.set(uurl.id, () => {
                const newname = encodeURIComponent(name.replace(/\//g, ":")).replace(/['()]/g, escape).replace(/\*/g, "%2A");
                const headers: Record<string, string> = {
                    "Content-Type": "application/octet-stream; charset=utf-8",
                    "Content-Disposition": "attachment; filename*=UTF-8''" + newname
                };
                if (size > 0n) headers["Content-Length"] = size.toString();
                return { reuse, headers, body: makeZip(this.zipSource(zip.entries), { buffersAreUTF8: true }) }
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

    async* zipSource(entries: Array<ZipEntryRequest>) {
        const controller = new AbortController();
        const { signal } = controller;
        const promises = entries.map((entry) => {
            return async () => {
                return {
                    name: entry.name,
                    size: entry.size,
                    input: (await this.createResponse(precursor2request(entry.request, { signal }))).body!
                };
            };
        });
        try {
            for (const promise of promises) {
                yield await promise();
            }
        } catch (e) {
            controller.abort(e);
        }
    }

    static activate() {
        if (!this._instance) this._instance = new Responser();
    }
}

type Range = `bytes=${number}-${number}` | `bytes=${number}-` | `bytes ${number}-${number}` | `bytes ${number}-` | `bytes=-${number}`
function parseRange(range: Range, length: number = 0) {
    let start: number | string;
    let end: number | string;
    [, start, end] = /bytes[=\s](\d+)-(\d+)?/.exec(range) || [-1, -1, -1];
    if (start === -1) {
        const suffix = Number(/bytes[=\s]-(\d+)/.exec(range)![1]);
        start = length - suffix
        end = length - 1
    }
    if (end === undefined) end = -1;
    start = Number(start)
    end = Number(end)
    if (end < 0) end = length - 1;
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

