import { Messenger } from "@freezm-ltd/post-together";
import { Responsified, ZipEntryRequest } from "./client";
import { EventTarget2 } from "@freezm-ltd/event-target-2";
export type ResponsifiedGenerator = (request: Request) => Responsified | PromiseLike<Responsified>;
export declare class Responser extends EventTarget2 {
    protected path: string;
    protected messenger: Messenger;
    protected address: WeakMap<WindowClient, Messenger>;
    protected storage: Map<string, ResponsifiedGenerator>;
    protected cache: Cache | undefined;
    protected static _instance: Responser;
    protected constructor();
    handleRequest(request: Request): Promise<Response> | undefined;
    createResponse(request: Request): Promise<Response>;
    parseId(url: string | URL): string | null | undefined;
    getUniqueURL(): {
        id: string;
        url: string;
    };
    zipSource(entries: Array<ZipEntryRequest>): AsyncGenerator<{
        name: string;
        size: number | undefined;
        input: ReadableStream<Uint8Array>;
    }, void, unknown>;
    static activate(): void;
}
