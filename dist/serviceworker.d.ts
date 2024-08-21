import { Messenger } from "@freezm-ltd/post-together";
import { RequestPrecursor, RequestPrecursorExtended, RequestPrecursorWithStream, Responsified, ZipEntryRequest } from "./client";
import { EventTarget2 } from "@freezm-ltd/event-target-2";
export type ResponsifiedGenerator = (request: Request) => Responsified | PromiseLike<Responsified>;
export declare const UNZIP_CACHE_CHUNK_SIZE: number;
export declare const UNZIP_CACHE_NAME = "service-worker-responsify-unzip-cache";
export declare const UNZIP_CACHE_RETAIN_INTERVAL: number;
export declare class Responser extends EventTarget2 {
    protected path: string;
    protected messenger: Messenger;
    protected address: WeakMap<WindowClient, Messenger>;
    protected storage: Map<string, ResponsifiedGenerator>;
    protected static _instance: Responser;
    protected constructor();
    handleRequest(request: Request): Promise<Response> | undefined;
    createResponse(request: Request): Promise<Response>;
    createResponseFromPrecursor(precursor: RequestPrecursor | RequestPrecursorWithStream | RequestPrecursorExtended, at?: number, length?: number): Promise<Response>;
    parseId(url: string | URL): string | null;
    getUniqueURL(): {
        id: string;
        url: string;
    };
    zipSource(entries: Array<ZipEntryRequest>, signal?: AbortSignal): AsyncGenerator<{
        name: string;
        size: number | undefined;
        input: ReadableStream<Uint8Array>;
    }, void, unknown>;
    static activate(): void;
}
