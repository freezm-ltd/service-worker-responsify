import structuredClone from '@ungap/structured-clone';

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
		"Content-Type": "application/octet-stream",
		"Content-Disposition": "attachment; filename*=UTF-8''" + newname
	};
}

export function mergeSignal(signal1: AbortSignal, signal2: AbortSignal) {
	const controller = new AbortController()
	signal1.onabort = (e) => controller.abort((e.target as AbortSignal).reason)
	signal2.onabort = (e) => controller.abort((e.target as AbortSignal).reason)
	return controller.signal
}

export function structuredClonePolyfill<T>(any: T) {
	return (globalThis.structuredClone || structuredClone)(any)
}

export function randomUUID() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    } else {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c: string) => {
            const r = (Math.random() * 16) | 0,
                v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
}