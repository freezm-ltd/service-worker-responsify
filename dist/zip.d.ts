import { Initializable, ReadableReader } from "@zip.js/zip.js";
import { Responser } from "./serviceworker";
import { RequestPrecursorExtended } from "./client";
export declare class ResponsifiedReader implements Initializable, ReadableReader {
    readonly responser: Responser;
    readonly precursor: RequestPrecursorExtended;
    readonly clientId: string;
    constructor(responser: Responser, precursor: RequestPrecursorExtended, clientId: string);
    get readable(): ReadableStream<any>;
    size: number | undefined;
    init(): Promise<void>;
    readUint8Array(index: number, length: number): Promise<Uint8Array>;
}
export declare function getUint16LE(uint8View: Uint8Array, offset: number): number;
