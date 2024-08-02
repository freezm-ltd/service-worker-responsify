import { Messenger } from "@freezm-ltd/post-together";
export type Responsifiable = ReadableStream<Uint8Array> | Request | Response | URL;
export type ResponsifiableGenerator = (request: Request) => PromiseLike<Responsifiable>;
export type ResponsifyOrigin = "window" | "serviceworker";
export type RequestPrecursor = {
    url: string;
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
};
export type RequestPrecursorExtended = RequestPrecursor & {
    reuse: boolean;
};
export type RequestPrecursorWithStream = Omit<RequestPrecursor, "body"> & {
    body?: ReadableStream<Uint8Array>;
};
export type Responsified = {
    reuse: boolean;
    length?: number;
    body?: ReadableStream<Uint8Array> | string | BufferSource | Blob;
    headers?: Record<string, string>;
    status?: number;
    statusText?: string;
};
export type ResponsifyResponse = {
    id: string;
    url: string;
};
export type ReservedRequest = {
    id: string;
    precursor: RequestPrecursorWithStream;
};
export type PartRequest = {
    index: number;
    length?: number;
    request: RequestPrecursorExtended;
};
export type MergeRequest = Array<PartRequest>;
export declare class Responsify {
    protected static _instance: Responsify;
    protected messenger: Messenger;
    protected reserved: Map<string, (request: Request) => Promise<Responsified>>;
    protected constructor();
    protected static get instance(): Responsify;
    static reserve(generator: ResponsifiableGenerator, reuse?: boolean): Promise<string>;
    static store(precursor: RequestPrecursorExtended): Promise<string>;
    static forward(responsified: Responsified): Promise<string>;
    static merge(merge: MergeRequest): Promise<string>;
}
export declare function responsify(responsifiable: Responsifiable, init?: Responsified): Promise<Responsified>;
export declare function request2precursor(request: Request): RequestPrecursorWithStream;
export declare function precursor2request(precursor: RequestPrecursor | RequestPrecursorWithStream | RequestPrecursorExtended): Request;
