import { Messenger, MessengerFactory } from "@freezm-ltd/post-together"
import { EntryMetadataHttp, MergeRequest, precursor2request, request2precursor, RequestPrecursor, RequestPrecursorExtended, RequestPrecursorWithStream, ReservedRequest, Responsified, responsify, ResponsifyResponse, UnzipRequest, UnzipResponse, ZipEntryRequest, ZipRequest } from "./client"
import { EventTarget2 } from "@freezm-ltd/event-target-2"
import { lengthCallback, mergeStream, sliceByteStream } from "@freezm-ltd/stream-utils"
import { makeZip, predictLength } from "client-zip"
import { Entry, ZipEntry } from "@zip.js/zip.js"
import { getUint16LE, ResponsifiedReader } from "./zip"
import { base, getDownloadHeader, mergeSignal, randomUUID, structuredClonePolyfill } from "./utils"
import { CacheBucket } from "./cache"
import { StreamBuffer } from "./stream"

export type ResponsifiedGenerator = (request: Request, clientId: string) => Responsified | PromiseLike<Responsified>

export const UNZIP_CACHE_CHUNK_SIZE = 10 * 1024 * 1024 // 10MiB
export const UNZIP_CACHE_NAME = "service-worker-responsify-unzip-cache"


export class Responser extends EventTarget2 {
    protected path = (new URL(self.registration.scope)).pathname + "_service-worker-responsify"
    protected messenger: Messenger
    protected address: WeakMap<WindowClient, Messenger> = new WeakMap()
    protected storage: Map<string, ResponsifiedGenerator> = new Map()
    protected static _instance: Responser
    protected constructor() {
        super()
        this.messenger = MessengerFactory.new(self as ServiceWorkerGlobalScope)

        // reserve
        this.messenger.response<number, ResponsifyResponse>("reserve", (timeout, e) => {
            const uurl = this.getUniqueURL()
            const client = e.source as unknown as WindowClient
            if (!this.address.has(client)) this.address.set(client, MessengerFactory.new(client));
            this.storage.set(uurl.id, async (request: Request) => {
                const messenger = this.address.get(client)
                const response = await messenger?.request<ReservedRequest, Responsified>("reserved", {
                    id: uurl.id,
                    precursor: request2precursor(request)
                }, request.body ? [request.body] : undefined, timeout) // wait for timeout
                return response || { reuse: true, status: 404 }
            })
            return uurl
        })

        // store
        this.messenger.response<RequestPrecursorExtended, ResponsifyResponse>("store", (precursor) => {
            const uurl = this.getUniqueURL()
            this.storage.set(uurl.id, async (childRequest: Request, clientId: string) => {
                // GET, HEAD method sync
                const parentRequest = precursor2request(precursor, { method: childRequest.method })
                // nest Range header
                const parentRange = parentRequest.headers.get("Range") as Range
                const childRange = (new Headers(childRequest.headers)).get("Range") as Range
                if (childRange) {
                    let range = childRange
                    if (parentRange) range = nestRange(parentRange, childRange);
                    parentRequest.headers.set("Range", range)
                }
                let response = await this.createResponse(parentRequest, clientId)
                if (parentRange && childRange && response.status === 206) {
                    const offset = parseRange(parentRange).start
                    const total = getRangeLength(parentRange)
                    const range = response.headers.get("Content-Range") as Range
                    const { start, end } = parseRange(range)
                    const headers = new Headers(response.headers)
                    headers.set("Accept-Ranges", "bytes")
                    headers.set("Content-Range", `bytes ${start - offset}-${end - offset}/${total > 0 ? total : Number(range.split("/").pop()) - offset}`)
                    response = new Response(response.body, { headers, status: response.status, statusText: response.statusText })
                }
                return responsify(response, { reuse: precursor.reuse })
            })
            return uurl
        })

        // forward
        this.messenger.response<Responsified, ResponsifyResponse>("forward", (responsified) => {
            const uurl = this.getUniqueURL()
            this.storage.set(uurl.id, (request: Request) => {
                const { body, ...init } = responsified
                const result: Responsified = { body: undefined, ...init }

                // GET request, add body
                if (request.method === "GET") {
                    if (responsified.reuse) {
                        if (responsified.body instanceof ReadableStream) {
                            const [stream1, stream2] = responsified.body.tee()
                            responsified.body = stream1
                            result.body = stream2
                        } else { // polyfill clone blob, buffers supported?
                            result.body = structuredClonePolyfill(responsified.body)
                        }
                    } else {
                        result.body = responsified.body
                    }
                }

                // add Content-Length header
                const headers = new Headers(result.headers)
                let length = 0
                if (body) {
                    if (body instanceof ReadableStream && responsified.length) {
                        length = responsified.length
                    } else if ("buffer" in (body as ArrayBufferView)) {
                        length = (body as ArrayBufferView).buffer.byteLength
                    } else if (body instanceof Blob) {
                        length = body.size
                    } else {
                        length = (body as string).length
                    }
                    if (length) {
                        headers.set("Accept-Ranges", "bytes")
                        headers.set("Content-Length", length.toString())
                    }
                }

                // range request
                if (request.headers.has("Range")) { // HEAD, GET
                    let { start, end } = parseRange(request.headers.get("Range") as Range)
                    // @ts-ignore
                    if (end < 0 && length) end = length - 1;
                    if (end < 0) headers.set("Content-Range", `bytes */*`)
                    else {
                        headers.set("Content-Range", `bytes ${start}-${end}/${length || "*"}`)
                    }
                    if (result.body) {
                        if (result.body instanceof ReadableStream) {
                            result.body = result.body.pipeThrough(sliceByteStream(start, end < 0 ? undefined : (end + 1)))
                        } else {
                            if ("buffer" in (result.body as ArrayBufferView)) {
                                result.body = (result.body as ArrayBufferView).buffer as ArrayBuffer
                            }
                            result.body = (result.body as any).slice(start, end + 1)
                        }
                    }
                    result.status = 206
                    result.statusText = "Partial Content"
                }

                result.headers = Object.fromEntries([...headers])
                return result
            })
            return uurl
        })

        // merge
        this.messenger.response<MergeRequest, ResponsifyResponse>("merge", (responsifiedExtended) => {
            const { parts, ...init } = responsifiedExtended
            parts.sort((a, b) => a.index - b.index)
            const uurl = this.getUniqueURL()
            const lastPart = parts[parts.length - 1]
            const total = init.length || (lastPart.length ? lastPart.index + lastPart.length : undefined)

            this.storage.set(uurl.id, (request: Request, clientId: string) => {
                const result: Responsified = structuredClonePolyfill(init)
                result.body = undefined
                result.headers = result.headers || {}
                result.headers["Accept-Ranges"] = "bytes"

                const precursors: Array<RequestPrecursor> = []
                const contentRange = { start: -1, end: -1 }

                if (request.headers.has("Range")) { // range request
                    const range = request.headers.get("Range") as Range
                    let { start, end } = parseRange(range, total)
                    end += 1
                    if (end < 1) end = Number.MAX_SAFE_INTEGER;
                    for (let i = 0; i < parts.length; i++) {
                        const p1 = parts[i].index
                        const p2 = parts[i + 1]?.index || Number.MAX_SAFE_INTEGER

                        if (p2 <= start || end <= p1) { //  --[==]--<-->-- or --<-->--[==]--
                            // skip
                            continue
                        }

                        const part = structuredClonePolyfill(parts[i].request)
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
                        precursors.push(part)
                    }
                    result.status = 206
                    result.statusText = "Partial Content"
                    {
                        const { start, end } = contentRange
                        result.headers["Content-Range"] = `bytes ${start}-${end < 0 ? "" : end}/${total ? total : "*"}`
                        result.headers["Content-Length"] = end < 0 ? "" : (end - start + 1).toString()
                    }
                } else {
                    precursors.push(...parts.map(m => m.request))
                    result.status = 200
                    result.statusText = "OK"
                    if (total) result.headers["Content-Length"] = total.toString();
                }

                if (request.method === "GET") { // GET request, add body
                    const sourceGen = () => precursors.map((p) => async () => (await this.createResponseFromPrecursor(p, clientId)).body!)
                    precursors.map((p) => async () => (await this.createResponseFromPrecursor(p, clientId)).body!)

                    const url = new URL(request.url)
                    const signal = request.signal

                    if (url.searchParams.get("buffer") === "true") { // stream buffer
                        // check cache
                        let stream = StreamBuffer.get(uurl.id, contentRange, signal)
                        if (stream) result.body = stream
                        else {
                            // cache
                            result.body = StreamBuffer.set(uurl.id, contentRange, (signal) => mergeStream(sourceGen(), undefined, { signal }), {
                                signal,
                                lifespan: url.searchParams.has("lifespan") ? Number(url.searchParams.get("lifespan")) : undefined,
                                waitSizeMax: url.searchParams.has("waitSizeMax") ? Number(url.searchParams.get("waitSizeMax")) : undefined,
                                inspectDuration: url.searchParams.has("inspectDuration") ? Number(url.searchParams.get("inspectDuration")) : undefined,
                            })
                        }
                    } else { // normal
                        result.body = mergeStream(sourceGen(), undefined, { signal })
                    }
                }

                return result
            })

            return uurl
        })

        // zip
        this.messenger.response<ZipRequest, ResponsifyResponse>("zip", (zip) => {
            const uurl = this.getUniqueURL()
            const reuse = zip.entries.every(entry => entry.request.reuse)
            const name = zip.name.toLowerCase().lastIndexOf(".zip") === zip.name.length - 4 ? zip.name : zip.name + ".zip"
            let size = 0
            if (zip.entries.every(entry => entry.size !== undefined)) {
                try { // try predict length
                    size = Number(predictLength(zip.entries.map(entry => {
                        return { name: entry.name, size: entry.size! }
                    })))
                } catch { }
            }
            let abortController = new AbortController()
            let written = 0
            if (zip.broadcast) {
                const broadcastChannel = new BroadcastChannel(zip.broadcast)
                const interval = setInterval(() => {
                    broadcastChannel.postMessage({ total: size, written })
                    if (size === written) clearInterval(interval);
                }, 500);
            }
            this.storage.set(uurl.id, (request, clientId) => { // zipping files
                const headers = getDownloadHeader(name)
                if (size > 0n) headers["Content-Length"] = size.toString();
                const result: Responsified = { reuse, headers }
                if (request.method === "GET") { // GET request, add body
                    abortController.abort("ZipRequestNewlyInitiated")
                    abortController = new AbortController()
                    written = 0
                    const source = this.zipSource(zip.entries, clientId, request.signal)
                    result.body = makeZip(source, { buffersAreUTF8: true }).pipeThrough(lengthCallback((delta) => written += delta), { signal: abortController.signal })
                }
                return result
            })
            return uurl
        })

        // unzip
        const unzipClients: Map<string, Set<string>> = new Map()
        setInterval(async () => {
            const orphans: Array<string> = []
            for (let key of await caches.keys()) {
                const clientIds = unzipClients.get(key)
                if (clientIds) {
                    for (let clientId of clientIds) {
                        const client = await self.clients.get(clientId)
                        if (!client) clientIds.delete(clientId);
                    }
                    if (clientIds.size > 0) continue;
                }
                if (key.startsWith(UNZIP_CACHE_NAME)) orphans.push(key);
            }
            for (let key of orphans) {
                const cache = await caches.open(key)
                for (let key of await cache.keys()) await cache.delete(key);
                caches.delete(key)
            }
        }, 1000);
        this.messenger.response<UnzipRequest, UnzipResponse>("unzip", async (unzip, e) => {
            const uurl = this.getUniqueURL()
            const precursor = unzip.request
            const sourceClientId = (e.source as unknown as Client).id
            const unzipId = unzip.id || uurl.id
            const password = unzip.password
            let passwordChecked = false
            const entryMap: Map<string, ZipEntry> = new Map()
            const entryPathId: Map<string, string> = new Map()
            const entryDataOffset: Map<string, number> = new Map()
            const entryMetaData: Record<string, EntryMetadataHttp> = {}
            const entryInit: Set<string> = new Set()
            const zip = require("@zip.js/zip.js")
            const entries = await new zip.fs.FS().importZip(new ResponsifiedReader(this, precursor, sourceClientId))

            for (let entry of entries) { //
                if (!entry.data || entry.data.directory) continue;
                if (!passwordChecked && entry.isPasswordProtected()) {
                    passwordChecked = true
                    if (!password || !await entry.checkPassword(password)) {
                        return { passwordNeed: true, id: "", url: "", unzipId: "", entries: {} }
                    }
                }

                const name = entry.data.filename
                entryMap.set(name, entry)
                const pathId = randomUUID() // compress original path
                entryPathId.set(pathId, name)

                // filter Functions(not transferable)
                let data: Record<string, any> = {}
                for (let [key, value] of Object.entries(entry.data)) {
                    if (value instanceof Function) {
                        continue
                    }
                    data[key] = value
                }
                data["url"] = uurl.url + "&path=" + pathId
                entryMetaData[name] = data as EntryMetadataHttp
            }

            this.storage.set(uurl.id, async (request, clientId) => {
                const param = (new URL(request.url)).searchParams
                let path = param.get("path")
                if (!path) return { status: 400, body: "Need searchParam - 'path'", reuse: true }
                path = entryPathId.get(path) || ""
                const entry = entryMap.get(path)
                if (!entry) return { status: 404, body: "Entry not found", reuse: true }
                const data = entry.data! as Entry
                // if empty file
                if (data.uncompressedSize === 0) {
                    const headers = getDownloadHeader(base(data.filename))
                    headers["Content-Length"] = "0"
                    return {
                        reuse: true,
                        body: new Uint8Array(0),
                        headers,
                        status: 200
                    } as Responsified
                }
                // range request
                const range = { start: 0, end: data.uncompressedSize - 1 }
                const isRanged = request.headers.has("Range")
                if (isRanged) {
                    const parsed = parseRange(request.headers.get("Range") as Range)
                    range.start = parsed.start
                    if (parsed.end > 0) range.end = parsed.end;
                }
                if (range.end > data.uncompressedSize - 1) { // range not satisfiable
                    return {
                        headers: { "Content-Range": `bytes */${data.uncompressedSize}` },
                        status: 416,
                        reuse: true
                    }
                }

                const result: Responsified = {
                    reuse: true,
                    headers: {
                        "Accept-Ranges": "bytes",
                        "Content-Range": `bytes ${range.start}-${range.end}/${entry.uncompressedSize}`,
                        "Content-Length": `${range.end - range.start + 1}`,
                    },
                    status: isRanged ? 206 : 200
                }
                Object.assign(result.headers!, getDownloadHeader(base(data.filename)))

                if (request.method === "HEAD") { // HEAD request, no body
                    return result
                }
                if (data.compressedSize === data.uncompressedSize && !data.encrypted) { // seekable
                    if (!entryDataOffset.has(path)) {
                        const view = new Uint8Array(await (await this.createResponseFromPrecursor(precursor, clientId, data.offset + 26, 4)).arrayBuffer())
                        entryDataOffset.set(path, data.offset + 30 + getUint16LE(view, 0) + getUint16LE(view, 2))
                    }
                    const offset = entryDataOffset.get(path)!
                    result.body = (await this.createResponseFromPrecursor(precursor, clientId, range.start + offset, range.end - range.start + 1)).body!
                } else { // unseekable, cacheStorage need
                    const key = `${UNZIP_CACHE_NAME}:${unzipId}`
                    const clients = unzipClients.get(key)
                    if (clients) clients.add(clientId);
                    else unzipClients.set(key, new Set([sourceClientId, clientId]));
                    const bucket = await CacheBucket.new(key)

                    if (!entryInit.has(path)) {
                        entryInit.add(path)
                        const { readable, writable } = new TransformStream()
                        const abortController = new AbortController()
                        data.getData!(writable, { password, signal: abortController.signal }).catch((e) => {
                            if (!String(e).startsWith("CacheBucket")) {
                                console.debug("Entry.getData error:", e)
                            }
                        })
                        bucket.set(path, readable, 0, abortController)
                    }
                    result.body = await bucket.get(path, range.start, range.end - range.start + 1)
                }

                let broadcast = param.get("broadcast")
                if (broadcast) {
                    const channel = new BroadcastChannel(broadcast)
                    const total = entry.uncompressedSize
                    let written = 0
                    const interval = setInterval(() => {
                        channel.postMessage({ total, written })
                        if (total === written) clearInterval(interval);
                    }, 500);
                    result.body = result.body.pipeThrough(lengthCallback((delta) => written += delta))
                }

                return result
            })
            return {
                id: uurl.id,
                unzipId,
                url: uurl.url,
                passwordNeed: false,
                entries: entryMetaData
            }
        })

        // revoke
        this.messenger.response<string, boolean>("revoke", (url) => {
            const id = this.parseId(url)
            let result = false
            if (id) result = this.storage.delete(id);
            return result
        })

        // handleRequest
        self.addEventListener("fetch", async (e: FetchEvent) => {
            const response = this.handleRequest(e.request, e.clientId || e.resultingClientId)
            if (response) e.respondWith(response);
        })
    }

    handleRequest(request: Request, clientId: string) {
        if (this.parseId(request.url)) {
            return this.createResponse(request, clientId)
        }
    }

    async createResponse(request: Request, clientId: string): Promise<Response> {
        const id = this.parseId(request.url)!
        if (this.storage.has(id)) {
            const responsified = await this.storage.get(id)!(request, clientId)
            const { reuse, body, ...init } = responsified
            if (!reuse) this.storage.delete(id);
            if (responsified.status === 301 || responsified.status === 302) { // redirect
                const location = responsified.headers!.location!
                return await this.createResponse(new Request(location, request), clientId)
            }
            return new Response(body, init)
        }
        if (request.method === "HEAD" && request.url.startsWith("blob:")) { // blob url HEAD request
            const length = (await fetch(request.url)).headers.get("Content-Length")!
            return new Response(null, {
                headers: {
                    "Accept-Ranges": "bytes",
                    "Content-Length": length,
                }
            })
        }
        return await fetch(request)
    }

    async createResponseFromPrecursor(precursor: RequestPrecursor | RequestPrecursorWithStream | RequestPrecursorExtended, clientId: string, at?: number, length?: number) {
        const init: RequestInit = {}
        if (at !== undefined && length) {
            init.method = "GET"
            const headers = new Headers(precursor.headers)
            headers.set("Range", `bytes=${at}-${at + length - 1}`)
            init.headers = Object.fromEntries([...headers])
        }
        return this.createResponse(precursor2request(precursor, init), clientId)
    }

    parseId(url: string | URL) {
        url = new URL(url)
        if (url.pathname !== this.path) return null;
        return url.searchParams.get("id")
    }

    getUniqueURL(): { id: string, url: string } {
        const id = randomUUID()
        if (this.storage.has(id)) return this.getUniqueURL();
        return {
            id,
            url: `${location.origin}${this.path}?id=${id}`
        }
    }

    async * zipSource(entries: Array<ZipEntryRequest>, clientId: string, signal?: AbortSignal) {
        const controller = new AbortController();
        const mergedSignal = signal ? mergeSignal(controller.signal, signal) : controller.signal;
        const promises = entries.map(({ name, size, request }) => {
            return async () => {
                // ignore request if size is 0
                if (size === 0) return { name, size, input: new ArrayBuffer(0) };
                return {
                    name,
                    size,
                    input: (await this.createResponse(precursor2request(request, { signal: mergedSignal }), clientId)).body!
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

