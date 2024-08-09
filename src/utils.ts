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

export const clean = (path: string) => {
	// resolve . and .., and remove trailing /
	const parts = path.split("/");
	const stack = [];
	for (const part of parts) {
		if (part === "..") {
			stack.pop();
		} else if (part !== ".") {
			stack.push(part);
		}

		// remove trailing /
		if (stack.length > 1 && stack[stack.length - 1] === "") {
			stack.pop();
		}
	}

	return stack.join("/");
};

export const base = (path: string) => {
	const cleaned = clean(path);
	return cleaned.substring(cleaned.lastIndexOf("/") + 1);
};

export function getDownloadHeader(name: string): Record<string, string> {
	const newname = encodeURIComponent(name.replace(/\//g, ":")).replace(/['()]/g, escape).replace(/\*/g, "%2A");

	return {
		"Content-Type": "application/octet-stream; charset=utf-8",
		"Content-Disposition": "attachment; filename*=UTF-8''" + newname
	};
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