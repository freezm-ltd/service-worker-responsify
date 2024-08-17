export declare function isStreamTrnasferable(): Promise<boolean>;
export declare const clean: (path: string) => string;
export declare const base: (path: string) => string;
export declare function getDownloadHeader(name: string): Record<string, string>;
export declare function base64URLencode(str: string): string;
export declare function base64URLdecode(str: string): string;
export declare function mergeSignal(signal1: AbortSignal, signal2: AbortSignal): AbortSignal;
export declare function structuredClonePolyfill<T>(any: T): T;
