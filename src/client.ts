import { Messenger, MessengerFactory } from "@freezm-ltd/post-together"

export type Responsifiable = ReadableStream<Uint8Array> | Request | Response | URL
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
    request: RequestPrecursorExtended
}
export type MergeRequest = Array<PartRequest>

export type ZipEntryRequest = {
    name: string
    size?: number
    request: RequestPrecursorExtended
}
export type ZipRequest = {
    name: string
    entries: Array<ZipEntryRequest>
}

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
                if (!result.reuse) this.reserved.delete(id);
                if (result.body instanceof ReadableStream) {
                    return { payload: result, transfer: [result.body] }
                }
                return result
            } else {
                return { reuse: false, status: 404 }
            }
        })
    }

    protected static get instance() {
        if (!this._instance) this._instance = new Responsify();
        return this._instance
    }

    // reserve (promised) window-created response and forward to service worker future
    static async reserve(generator: ResponsifiableGenerator, reuse: boolean = false): Promise<string> {
        const result = await this.instance.messenger.request<null, ResponsifyResponse>("reserve", null)
        this.instance.reserved.set(result.id, async (request: Request) => {
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
}

export async function responsify(responsifiable: Responsifiable, init?: Responsified) {
    switch (responsifiable.constructor) {
        case ReadableStream: return responsifyStream(responsifiable as ReadableStream, init)
        case Request: return responsifyRequest(responsifiable as Request, init)
        case Response: return responsifyResponse(responsifiable as Response, init)
        case URL: return responsifyRequest(new Request((responsifiable as URL).href));
        default: throw new Error('Cannot responsify from argument "responsifiable"')
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