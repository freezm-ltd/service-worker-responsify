type ByteRange = {
    start: number;
    end: number;
    current?: number;
};
type Source = (signal?: AbortSignal) => ReadableStream<Uint8Array>;
type Receiver = (done: boolean, chunk?: Uint8Array, position?: number) => boolean;
type Connection = {
    receiver: Receiver;
    range: ByteRange & {
        current: number;
    };
};
type StreamBufferOption = {
    lifespan?: number;
    waitSizeMax?: number;
    inspectDuration?: number;
    signal?: AbortSignal;
};
/**
 * Peek and buffering stream
 */
declare class StreamBuffer {
    readonly key: string;
    readonly range: ByteRange;
    readonly source: Source;
    private static storage;
    static get(key: string, range: ByteRange, signal?: AbortSignal): ReadableStream<Uint8Array<ArrayBufferLike>> | undefined;
    static set(key: string, range: ByteRange, source: Source, option?: StreamBufferOption): ReadableStream<Uint8Array<ArrayBufferLike>>;
    private lifespan;
    private abortTimeout;
    private abortController;
    private connections;
    private buffer;
    private buffered;
    private waitSizeMax;
    get bufferedSize(): number;
    private constructor();
    private init;
    private inspected;
    private inspectDuration;
    private inspectMaxLength;
    private inspect;
    private has;
    private write;
    private close;
    private read;
    private expire;
}
