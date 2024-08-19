import { EventTarget2 } from "@freezm-ltd/event-target-2";
export declare const CACHE_CHUNK_SIZE: number;
export declare class CacheBucket extends EventTarget2 {
    readonly id: string;
    readonly chunkSize: number;
    bucket: Cache | null;
    writing: Map<string, ReadableStream<Uint8Array>>;
    constructor(id: string, chunkSize?: number);
    init(): Promise<void>;
    pathNumber(path: string, number: number): string;
    set(path: string, data: ReadableStream<Uint8Array>, at?: number): Promise<void>;
}
