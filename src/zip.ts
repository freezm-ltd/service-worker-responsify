import { HttpRangeReader, Initializable, ReadableReader, URLString } from "@zip.js/zip.js";
import { Responser } from "./serviceworker";
import { precursor2request, RequestPrecursorExtended } from "./client";

export class ResponsifiedReader implements Initializable, ReadableReader {
    constructor(
        readonly responser: Responser,
        readonly precursor: RequestPrecursorExtended
    ) {

    }

    // @ts-ignore
    get readable() {
        // @ts-ignore
        const { readable, writable } = new TransformStream();
        const interval = setInterval(() => {
            // @ts-ignore
            const { offset, size } = readable;
            if (offset && size) {
                clearInterval(interval);
                this.responser.createResponseFromPrecursor(this.precursor, offset, size).then((response) => {
                    const body = response.body;
                    if (!body) return writable.close();
                    body.pipeTo(writable);
                });
            }
        }, 10);
        return readable;
    }

    size: number | undefined

    async init() {
        const request = precursor2request(this.precursor)
        let method = "HEAD"
        if (request.url.startsWith("blob:")) { // blob url
            method = "GET"
        }
        const response = await this.responser.createResponse(new Request(request, { method }))
        const length = response.headers.get("Content-Length")
        if (length) this.size = Number(length);
    }

    async readUint8Array(index: number, length: number) {
        const response = await this.responser.createResponseFromPrecursor(this.precursor, index, length)
        const data = new Uint8Array(await response.arrayBuffer())
        return data
    }
}

export function getUint16LE(uint8View: Uint8Array, offset: number) {
    return uint8View[offset] + uint8View[offset + 1] * 0x100;
}