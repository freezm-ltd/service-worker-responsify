import { Messenger, MessengerFactory } from "@freezm-ltd/post-together"
import { EntryMetaData } from "@zip.js/zip.js"
import { UNZIP_CACHE_RETAIN_INTERVAL } from "./serviceworker"

export type Responsifiable = ReadableStream<Uint8Array> | Request | Response | BufferSource | Blob | URL | string
export type ResponsifiableGenerator = (request: Request) => PromiseLike<Responsifiable>
export type ResponsifyOrigin = "window" | "serviceworker"

export type RequestPrecursor = { // "fully" postMessageable RequestInit (no transfer, independent of window)
    url: string
    body?: string | BufferSource | Blob;
    cache?: RequestCache;
    credentials?: RequestCredentials;
    headers?: Record<string, string> | [string, string][];
    integrity?: string;
    keepalive?: boolean;
    method?: string;
    mode?: RequestMode;
    priority?: RequestPriority;
    redirect?: RequestRedirect;
    referrer?: string;
    referrerPolicy?: ReferrerPolicy;
}
export type RequestPrecursorExtended = RequestPrecursor & {
    reuse: boolean // if reuse, uurl not expired
}
export type RequestPrecursorWithStream = Omit<RequestPrecursor, "body"> & {
    body?: ReadableStream<Uint8Array>
}

export type Responsified = {
    reuse: boolean // if reuse, uurl not expired
    length?: number // if stream, maybe content length needed

    body?: ReadableStream<Uint8Array> | string | BufferSource | Blob
    headers?: Record<string, string>
    status?: number
    statusText?: string
}

export type ResponsifyResponse = {
    id: string
    url: string
}

export type ReservedRequest = {
    id: string,
    precursor: RequestPrecursorWithStream
}

export type PartRequest = {
    index: number
    length?: number // last one need when suffix request
    request: RequestPrecursor
}
export type MergeRequest = Omit<Responsified, "body"> & { parts: Array<PartRequest> }

export type ZipEntryRequest = {
    name: string
    size?: number
    request: RequestPrecursorExtended
}
export type ZipRequest = {
    name: string
    entries: Array<ZipEntryRequest>
}

export type UnzipRequest = {
    request: RequestPrecursorExtended
    password?: string
    id?: string // unique id, to allow parallel access
}
export type UnzipResponse = ResponsifyResponse & {
    passwordNeed: boolean
    entries: Record<string, EntryMetadataHttp>
    unzipId: string // unique id, to allow parallel access
}
export type EntryMetadataHttp = EntryMetaData & { url: string }

export class Responsify {
    protected static _instance: Responsify

    protected messenger: Messenger
    protected reserved: Map<string, (request: Request) => Promise<Responsified>> = new Map()
    protected constructor() {
        this.messenger = MessengerFactory.new(navigator.serviceWorker)
        this.messenger.response<ReservedRequest, Responsified>("reserved", async ({ id, precursor }) => {
            const responsified = this.reserved.get(id)
            if (responsified) {
                const result = await responsified(precursor2request(precursor))
                if (result.body instanceof ReadableStream) {
                    return { payload: result, transfer: [result.body] }
                }
                return result
            } else {
                return { reuse: false, status: 404 }
            }
        })
        setInterval(() => { // retain unzip cache
            window.navigator.serviceWorker.controller?.postMessage({ unzipRetain: Array.from(this.unzipRetain) })
        }, UNZIP_CACHE_RETAIN_INTERVAL)
    }

    protected static get instance() {
        if (!this._instance) this._instance = new Responsify();
        return this._instance
    }

    // reserve (promised) window-created response and forward to service worker future
    static async reserve(generator: ResponsifiableGenerator, reuse: boolean, timeout = 5 * 60 * 1000): Promise<string> {
        const result = await this.instance.messenger.request<number, ResponsifyResponse>("reserve", timeout)
        this.instance.reserved.set(result.id, async (request: Request) => {
            if (!reuse) this.instance.reserved.delete(result.id);
            return responsify(await generator(request), { reuse })
        })
        return result.url
    }

    // store request-precursor in service-worker and get response future
    static async store(precursor: RequestPrecursorExtended): Promise<string> {
        return (await this.instance.messenger.request<RequestPrecursorExtended, ResponsifyResponse>("store", precursor)).url
    }

    // forward window-created response to service worker
    static async forward(responsified: Responsified) {
        let transfer = undefined
        if (responsified.body instanceof ReadableStream) {
            transfer = [responsified.body]
        }
        return (await this.instance.messenger.request<Responsified, ResponsifyResponse>("forward", responsified, transfer)).url
    }

    // merge multiple requests to single-ranged request
    static async merge(merge: MergeRequest) {
        return (await this.instance.messenger.request<MergeRequest, ResponsifyResponse>("merge", merge)).url
    }

    // zip multiple requests
    static async zip(zip: ZipRequest) {
        return (await this.instance.messenger.request<ZipRequest, ResponsifyResponse>("zip", zip)).url
    }

    // unzip
    readonly unzipRetain: Set<string> = new Set()
    static async unzip(unzip: UnzipRequest, promptPassword: (isFirst: boolean) => string | PromiseLike<string> = unzipPromptPassword) {
        let result: UnzipResponse | undefined = undefined
        let isFirst = true
        while (!result || result.passwordNeed) {
            result = await this.instance.messenger.request<UnzipRequest, UnzipResponse>("unzip", unzip)
            if (result.passwordNeed) {
                unzip.password = await promptPassword(isFirst)
                isFirst = false
            }
        }
        this.instance.unzipRetain.add(result.unzipId)
        return {
            url: result.url,
            entries: result.entries,
        }
    }

    // revoke
    static async revoke(url: string) {
        return await this.instance.messenger.request<string, boolean>("revoke", url)
    }
}

function unzipPromptPassword(isFirst: boolean) {
    let password
    if (isFirst) {
        password = prompt("This file is encrypted. Please enter the password.")
    } else {
        password = prompt("The password does not match. Please check the password.")
    }
    if (!password) {
        return unzipPromptPassword(false)
    }
    return password
}

export async function responsify(responsifiable: Responsifiable, init?: Responsified) {
    switch (responsifiable.constructor) {
        case ReadableStream: return responsifyStream(responsifiable as ReadableStream, init)
        case Request: return responsifyRequest(responsifiable as Request, init)
        case Response: return responsifyResponse(responsifiable as Response, init)
        case String:
        case URL: return responsifyResponse(Response.redirect((responsifiable as string | URL), 301), init);
        default: return responsifyResponse(new Response(responsifiable as BodyInit), init)
    }
}

async function responsifyRequest(request: Request, init?: Responsified) {
    return responsifyResponse(await fetch(request), init)
}

function responsifyResponse(response: Response, init?: Responsified): Responsified {
    return {
        reuse: init?.reuse || false,
        body: response.body || undefined,
        headers: init?.headers || Object.fromEntries([...response.headers]),
        status: init?.status || response.status,
        statusText: init?.statusText || response.statusText,
    }
}

function responsifyStream(stream: ReadableStream<Uint8Array>, init?: Responsified) {
    return Object.assign({ body: stream }, init)
}

export function request2precursor(request: Request): RequestPrecursorWithStream {
    return {
        url: request.url,
        body: request.body || undefined,
        cache: request.cache,
        credentials: request.credentials,
        headers: Object.fromEntries([...request.headers]),
        integrity: request.integrity,
        keepalive: request.keepalive,
        method: request.method,
        mode: request.mode,
        //priority: request.priority,
        redirect: request.redirect,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
    }
}

export function precursor2request(precursor: RequestPrecursor | RequestPrecursorWithStream | RequestPrecursorExtended, additionalInit?: RequestInit) {
    let { url, ...init } = precursor
    if (init.mode === "navigate") {
        init.mode = "same-origin"
    }
    if ("reuse" in init) {
        const { reuse, ..._init } = init
        init = _init
    }
    if (additionalInit) Object.assign(init, additionalInit);
    return new Request(url, init)
}