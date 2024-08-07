export async function isStreamTrnasferable() {
    try {
        const { readable, writable } = new TransformStream()
        writable.close()
        switch (globalThis.constructor) {
            case globalThis.ServiceWorkerGlobalScope: {
                (await self.clients.matchAll())[0].postMessage({ readable, writable }, { transfer: [readable, writable] })
                break
            }
            case globalThis.Window: {
                postMessage({ readable, writable }, { transfer: [readable, writable] })
                break
            }
        }
        return true
    } catch {
        return false
    }
}