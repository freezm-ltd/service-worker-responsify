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

export function base64URLencode(str: string) {
	return btoa(
		encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
			return String.fromCharCode(parseInt(p1, 16));
		})
	).replace(/[+/]/g, (m) => ENC[m]);
}

export function base64URLdecode(str: string) {
	return decodeURIComponent(
		Array.prototype.map
			.call(atob(str.replace(/[-_.]/g, (m) => DEC[m])), function (c) {
				return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
			})
			.join("")
	);
}

const ENC: any = {
    '+': '-',
    '/': '_'
}
const DEC: any = {
    '-': '+',
    '_': '/',
    '.': '='
}