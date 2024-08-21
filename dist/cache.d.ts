import { EventTarget2 } from "@freezm-ltd/event-target-2";
export declare const CACHE_CHUNK_SIZE: number;
export declare class CacheBucket extends EventTarget2 {
    readonly id: string;
    readonly chunkSize: number;
    protected cache: Cache | null;
    protected writing: Map<string, {
        stream: ReadableStream<Uint8Array>;
        number: number;
    }>;
    static buckets: Map<string, CacheBucket>;
    private constructor();
    static new(id: string, chunkSize?: number): Promise<CacheBucket>;
    static drop(id: string): Promise<void>;
    init(): Promise<void>;
    pathNumber(path: string, number: number): string;
    set(path: string, data: ReadableStream<Uint8Array>, at?: number, abortController?: AbortController): Promise<void>;
    get(path: string, at: number | undefined, length: number): Promise<ReadableStream<Uint8Array>>;
}
