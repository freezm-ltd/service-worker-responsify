// node_modules/.pnpm/@freezm-ltd+post-together@https+++codeload.github.com+freezm-ltd+post-together+tar.gz+e9777a1_575bqxlf6wnwfzmrlpm4c5gslq/node_modules/@freezm-ltd/post-together/dist/index.js
var EventTarget2 = class extends EventTarget {
  constructor() {
    super(...arguments);
    this.listeners = /* @__PURE__ */ new Map();
    this._bubbleMap = /* @__PURE__ */ new Map();
    this.atomicQueue = /* @__PURE__ */ new Map();
  }
  async waitFor(type, compareValue) {
    return new Promise((resolve) => {
      if (compareValue !== void 0) {
        this.listenOnceOnly(type, (e2) => resolve(e2.detail), (e2) => e2.detail === compareValue);
      } else {
        this.listenOnce(type, (e2) => resolve(e2.detail));
      }
    });
  }
  callback(type, callback) {
    this.waitFor(type).then(callback);
  }
  dispatch(type, detail) {
    this.dispatchEvent(new CustomEvent(type, detail !== void 0 ? { detail } : void 0));
  }
  listen(type, callback, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, /* @__PURE__ */ new Set());
    this.listeners.get(type).add(callback);
    this.addEventListener(type, callback, options);
  }
  remove(type, callback, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, /* @__PURE__ */ new Set());
    this.listeners.get(type).delete(callback);
    this.removeEventListener(type, callback, options);
  }
  destroy() {
    for (let type of this.listeners.keys()) {
      for (let callback of this.listeners.get(type)) {
        this.remove(type, callback);
      }
    }
  }
  listenOnce(type, callback) {
    this.listen(type, callback, { once: true });
  }
  listenOnceOnly(type, callback, only) {
    const wrapper = (e2) => {
      if (only(e2)) {
        this.remove(type, wrapper);
        callback(e2);
      }
    };
    this.listen(type, wrapper);
  }
  listenDebounce(type, callback, options = { timeout: 100, mode: "last" }) {
    switch (options.mode) {
      case "first":
        return this.listenDebounceFirst(type, callback, options);
      case "last":
        return this.listenDebounceLast(type, callback, options);
    }
  }
  listenDebounceFirst(type, callback, options = { timeout: 100 }) {
    let lastMs = 0;
    this.listen(
      type,
      (e2) => {
        const currentMs = Date.now();
        if (currentMs - lastMs > options.timeout) {
          callback(e2);
        }
        lastMs = currentMs;
      },
      options
    );
  }
  listenDebounceLast(type, callback, options = { timeout: 100 }) {
    let timoutInstance;
    this.listen(
      type,
      (e2) => {
        clearTimeout(timoutInstance);
        timoutInstance = window.setTimeout(() => callback(e2), options.timeout);
      },
      options
    );
  }
  enableBubble(type) {
    if (this._bubbleMap.has(type)) return;
    const dispatcher = (e2) => {
      this.parent?.dispatch(e2.type, e2.detail);
    };
    this.listen(type, dispatcher);
    this._bubbleMap.set(type, dispatcher);
  }
  disableBubble(type) {
    if (!this._bubbleMap.has(type)) return;
    const dispatcher = this._bubbleMap.get(type);
    this.remove(type, dispatcher);
    this._bubbleMap.delete(type);
  }
  _atomicInit(type) {
    this.atomicQueue.set(type, []);
    const atomicLoop = async () => {
      const queue = this.atomicQueue.get(type);
      while (true) {
        const task = queue.shift();
        if (task) {
          await task();
        } else {
          await this.waitFor("__atomic-add", type);
        }
      }
    };
    atomicLoop();
  }
  atomic(type, func) {
    return new Promise((resolve) => {
      const wrap = async () => resolve(await func());
      if (!this.atomicQueue.has(type)) this._atomicInit(type);
      this.atomicQueue.get(type).push(wrap);
      this.dispatch("__atomic-add", type);
    });
  }
};
function generateId() {
  return crypto.randomUUID();
}
var IDENTIFIER = "post-together";
function isMessage(data) {
  return data.id && data.type && data.__identifier === IDENTIFIER;
}
function isMessageCustomEvent(e2) {
  return "data" in e2 && isMessage(e2.data);
}
function unwrapMessage(e2) {
  if (isMessageCustomEvent(e2)) {
    return e2.data;
  }
}
var Messenger = class {
  constructor(listenFrom, sendTo) {
    this.listenFrom = listenFrom;
    this.sendTo = sendTo;
    this.activated = true;
    this.listenerWeakMap = /* @__PURE__ */ new WeakMap();
    this.listenerSet = /* @__PURE__ */ new Set();
  }
  // create request message from type and payload
  createRequest(type, payload, transfer) {
    const id = generateId();
    return { id, type, payload, transfer, __type: "request", __identifier: IDENTIFIER };
  }
  // create response message from request message and payload
  createResponse(request, payload, transfer) {
    const { id, type, __identifier } = request;
    return { id, type, payload, transfer, __type: "response", __identifier };
  }
  // inject informations to message
  async _inject(message) {
  }
  // listen for response
  responseCallback(request, callback) {
    const listener = async (e2) => {
      const response = unwrapMessage(e2);
      if (response && response.id === request.id && response.type === request.type && response.__type === "response") {
        await this._inject(response);
        this.listenFrom.removeEventListener("message", listener);
        callback(response.payload);
      }
    };
    this.listenFrom.addEventListener("message", listener);
    return () => this.listenFrom.removeEventListener("message", listener);
  }
  _getSendTo(event) {
    let sendTo = this.sendTo;
    if (event) {
      const source = event.source;
      if (source) sendTo = source;
    }
    return sendTo;
  }
  // send message
  async _send(message, event) {
    const option = { transfer: message.transfer };
    if (isIframe()) Object.assign(option, { targetOrigin: "*" });
    this._getSendTo(event).postMessage(message, option);
  }
  // send message and get response
  request(type, payload, transfer, timeout = 5e3) {
    return new Promise(async (resolve, reject) => {
      const message = this.createRequest(type, payload, transfer);
      const rejector = this.responseCallback(message, resolve);
      await this._send(message);
      setTimeout(() => {
        rejector();
        reject(`MessengerRequestTimeoutError: request timeout reached: ${timeout}ms`);
      }, timeout);
    });
  }
  wrapMessageHandler(type, handler) {
    return async (e2) => {
      const request = unwrapMessage(e2);
      if (request && request.type === type && request.__type === "request" && this.activated) {
        await this._inject(request);
        const result = await handler(request.payload, e2);
        let response;
        if (result instanceof Object && "payload" in result && "transfer" in result) {
          const { payload, transfer } = result;
          response = this.createResponse(request, payload, transfer);
        } else {
          response = this.createResponse(request, result);
        }
        await this._send(response, e2);
      }
    };
  }
  // get request and give response
  response(type, handler) {
    if (this.listenerSet.has(handler)) throw new Error("MessengerAddEventListenerError: this message handler already attached");
    const wrapped = this.wrapMessageHandler(type, handler);
    this.listenerWeakMap.set(handler, wrapped);
    this.listenerSet.add(handler);
    this.listenFrom.addEventListener("message", wrapped);
  }
  // remove response handler
  deresponse(handler) {
    const iterator = handler ? [handler] : this.listenerSet;
    for (let handler2 of iterator) {
      const wrapped = this.listenerWeakMap.get(handler2);
      if (wrapped) {
        this.listenFrom.removeEventListener("message", wrapped);
        this.listenerWeakMap.delete(handler2);
      }
      this.listenerSet.delete(handler2);
    }
  }
  // re-activate message handling
  activate() {
    if (this.activated) return;
    this.activated = true;
  }
  // deactivate message handling
  deactivate() {
    if (!this.activated) return;
    this.activated = false;
  }
};
var CrossOriginWindowMessenger = class extends Messenger {
  constructor(listenFrom, sendTo, sendToOrigin) {
    super(listenFrom, sendTo);
    this.listenFrom = listenFrom;
    this.sendTo = sendTo;
    this.sendToOrigin = sendToOrigin;
  }
  async _send(message, event) {
    this._getSendTo(event).postMessage(message, { transfer: message.transfer, targetOrigin: this.sendToOrigin });
  }
};
var MessageHubCrossOriginIframeURL = "https://freezm-ltd.github.io/post-together/iframe/";
var MessageHubCrossOriginIframeOrigin = new URL(MessageHubCrossOriginIframeURL).origin;
function isIframe(origin) {
  if (globalThis.constructor === globalThis.Window) {
    if (!origin) origin = window.origin;
    return origin === MessageHubCrossOriginIframeOrigin;
  }
  return false;
}
var MessageStoreMessageType = `${IDENTIFIER}:__store`;
var MessageFetchMessageType = `${IDENTIFIER}:__fetch`;
var BroadcastChannelMessenger = class extends Messenger {
  async _inject(message) {
    if (!("metadata" in message)) return;
    const { id } = message;
    const response = await MessageHub.fetch(id);
    if (!response.ok) throw new Error("BroadcastChannelMessengerFetchPayloadError: MessageHub fetch failed.");
    message.payload = response.message.payload;
    message.transfer = response.message.transfer;
  }
  async _send(message) {
    if (message.transfer) {
      const { payload, transfer, ...metadata } = message;
      const result = await MessageHub.store(message);
      if (!result.ok) throw new Error("BroadcastChannelMessengerSendError: MessageHub store failed.");
      Object.assign(metadata, { metadata: true });
      this._getSendTo().postMessage(metadata);
    } else {
      this._getSendTo().postMessage(message);
    }
  }
};
var AbstractMessageHub = class extends EventTarget2 {
  constructor() {
    super();
    this.state = "off";
    this.listenFroms = /* @__PURE__ */ new Set();
    this.init();
  }
  async init() {
    if (this.state === "on") return;
    if (this.state === "initializing") return await this.waitFor("done");
    this.state = "initializing";
    await this._init();
    this.state = "on";
    this.dispatch("done");
  }
  async _init() {
  }
  async store(message) {
    await this.init();
    return await this.target.request(MessageStoreMessageType, message, message.transfer);
  }
  async fetch(id) {
    await this.init();
    return await this.target.request(MessageFetchMessageType, id);
  }
  // listen request
  async addListen(listenFrom) {
    await this.init();
    if (this.listenFroms.has(listenFrom)) return;
    const listenTarget = MessengerFactory.new(listenFrom);
    this.listenFroms.add(listenFrom);
    listenTarget.response(MessageStoreMessageType, async (message) => {
      return await this.store(message);
    });
    listenTarget.response(MessageFetchMessageType, async (id) => {
      const result = await this.fetch(id);
      if (result.ok) {
        return { payload: result, transfer: result.message.transfer };
      }
      return result;
    });
  }
};
var ServiceWorkerMessageHub = class extends AbstractMessageHub {
  constructor() {
    super(...arguments);
    this.storage = /* @__PURE__ */ new Map();
  }
  // add listen; requests from windows -> serviceworker
  async _init() {
    this.addListen(self);
  }
  // service worker is MessageHub storage itself
  async store(message) {
    try {
      this.storage.set(message.id, message);
      return { ok: true };
    } catch (e2) {
      return { ok: false, error: e2 };
    }
  }
  async fetch(id) {
    let message = this.storage.get(id);
    if (!message) return { ok: false, error: "Not Found" };
    this.storage.delete(id);
    return { ok: true, message };
  }
};
var DedicatedWorkerMessageHub = class extends AbstractMessageHub {
  // worker -> parent window
  async _init() {
    this.target = MessengerFactory.new(self);
  }
};
var WindowMessageHub = class extends AbstractMessageHub {
  async _initSameOrigin() {
    if (!globalThis.navigator.serviceWorker.controller) {
      setTimeout(() => {
        window.location.assign(window.location.href);
      }, 1e3);
      await new Promise(() => {
      });
    } else {
      this.target = MessengerFactory.new(globalThis.navigator.serviceWorker);
      window.parent.postMessage("loadend", { targetOrigin: "*" });
    }
  }
  async _initCrossOrigin() {
    let iframeload = false;
    const iframe = document.createElement("iframe");
    const listener = (e2) => {
      if (isIframe(e2.origin) && e2.data === "loadend") {
        iframeload = true;
        this.dispatch("iframeloadend");
        window.removeEventListener("message", listener);
      }
    };
    window.addEventListener("message", listener);
    iframe.setAttribute("src", MessageHubCrossOriginIframeURL);
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    if (!iframeload) await this.waitFor("iframeloadend");
    this.target = new CrossOriginWindowMessenger(window, iframe.contentWindow, MessageHubCrossOriginIframeOrigin);
  }
  // worker/window -> window -> iframe/serviceworker -> window -> worker/window
  async _init() {
    if (isIframe()) await this._initSameOrigin();
    else await this._initCrossOrigin();
    this.addListen(window);
  }
};
var MessageHub = class _MessageHub {
  constructor() {
    this.changeHub();
  }
  changeHub() {
    switch (globalThis.constructor) {
      case globalThis.ServiceWorkerGlobalScope:
        this.hub = new ServiceWorkerMessageHub();
        break;
      case globalThis.Window:
        this.hub = new WindowMessageHub();
        break;
      case globalThis.DedicatedWorkerGlobalScope:
        this.hub = new DedicatedWorkerMessageHub();
        break;
      default:
        throw new Error("MessageHubConstructError: Cannot create MessageHub instance in this scope.");
    }
  }
  static init() {
    if (!_MessageHub._instance) _MessageHub._instance = new _MessageHub();
  }
  static get instance() {
    this.init();
    return _MessageHub._instance;
  }
  static async store(message) {
    return this.instance.hub.store(message);
  }
  static async fetch(id) {
    return this.instance.hub.fetch(id);
  }
  static async addListen(listenFrom) {
    return this.instance.hub.addListen(listenFrom);
  }
};
var MessengerFactory = class {
  constructor() {
  }
  static new(option) {
    if (!option) throw new Error("MessengerFactoryNoOptionError: Cannot create Messenger, argument 'option' is not provided");
    let send;
    let listen;
    switch (option.constructor) {
      case globalThis.ServiceWorker: {
        listen = window.navigator.serviceWorker;
        send = option;
        break;
      }
      case globalThis.ServiceWorkerContainer: {
        listen = option;
        send = option.controller;
        break;
      }
      case globalThis.ServiceWorkerGlobalScope: {
        listen = option;
        send = void 0;
        break;
      }
      case globalThis.Worker: {
        listen = send = option;
        MessageHub.addListen(option);
        break;
      }
      case globalThis.DedicatedWorkerGlobalScope: {
        listen = send = option;
        break;
      }
      case globalThis.Window: {
        const targetWindow = option;
        listen = window;
        send = targetWindow;
        break;
      }
      case globalThis.Client:
      case globalThis.WindowClient: {
        listen = self;
        send = option;
        break;
      }
      case globalThis.BroadcastChannel: {
        const name = option.name;
        return new BroadcastChannelMessenger(new BroadcastChannel(name), new BroadcastChannel(name));
      }
      case globalThis.MessagePort: {
        listen = send = option;
        break;
      }
    }
    if (listen) {
      return new Messenger(listen, send);
    } else {
      throw new Error("MessengerFactoryError: Cannot create Messenger, arguments not supported");
    }
  }
};
MessageHub.init();

// src/client.ts
var Responsify = class _Responsify {
  constructor() {
    this.reserved = /* @__PURE__ */ new Map();
    this.messenger = MessengerFactory.new(navigator.serviceWorker);
    this.messenger.response("reserved", async ({ id, precursor }) => {
      const responsified = this.reserved.get(id);
      if (responsified) {
        const result = await responsified(precursor2request(precursor));
        if (!result.reuse) this.reserved.delete(id);
        if (result.body instanceof ReadableStream) {
          return { payload: result, transfer: [result.body] };
        }
        return result;
      } else {
        return { reuse: false, status: 404 };
      }
    });
  }
  static get instance() {
    if (!this._instance) this._instance = new _Responsify();
    return this._instance;
  }
  // reserve (promised) window-created response and forward to service worker future
  static async reserve(generator, reuse = false) {
    const result = await this.instance.messenger.request("reserve", null);
    this.instance.reserved.set(result.id, async (request) => {
      return responsify(await generator(request), { reuse });
    });
    return result.url;
  }
  // store request-precursor in service-worker and get response future
  static async store(precursor) {
    return (await this.instance.messenger.request("store", precursor)).url;
  }
  // forward window-created response to service worker
  static async forward(responsified) {
    let transfer = void 0;
    if (responsified.body instanceof ReadableStream) {
      transfer = [responsified.body];
    }
    return (await this.instance.messenger.request("forward", responsified, transfer)).url;
  }
  // merge multiple requests to single-ranged request
  static async merge(merge) {
    return (await this.instance.messenger.request("merge", merge)).url;
  }
  // zip multiple requests
  static async zip(zip) {
    return (await this.instance.messenger.request("zip", zip)).url;
  }
};
async function responsify(responsifiable, init) {
  switch (responsifiable.constructor) {
    case ReadableStream:
      return responsifyStream(responsifiable, init);
    case Request:
      return responsifyRequest(responsifiable, init);
    case Response:
      return responsifyResponse(responsifiable, init);
    case URL:
      return responsifyRequest(new Request(responsifiable.href));
    default:
      throw new Error('Cannot responsify from argument "responsifiable"');
  }
}
async function responsifyRequest(request, init) {
  return responsifyResponse(await fetch(request), init);
}
function responsifyResponse(response, init) {
  return {
    reuse: init?.reuse || false,
    body: response.body || void 0,
    headers: init?.headers || Object.fromEntries([...response.headers]),
    status: init?.status || response.status,
    statusText: init?.statusText || response.statusText
  };
}
function responsifyStream(stream, init) {
  return Object.assign({ body: stream }, init);
}
function request2precursor(request) {
  return {
    url: request.url,
    body: request.body || void 0,
    cache: request.cache,
    credentials: request.credentials,
    headers: Object.fromEntries([...request.headers]),
    integrity: request.integrity,
    keepalive: request.keepalive,
    method: request.method,
    mode: request.mode,
    //priority: request.priority,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy
  };
}
function precursor2request(precursor, additionalInit) {
  let { url, ...init } = precursor;
  if (init.mode === "navigate") {
    init.mode = "same-origin";
  }
  if ("reuse" in init) {
    const { reuse, ..._init } = init;
    init = _init;
  }
  if (additionalInit) Object.assign(init, additionalInit);
  return new Request(url, init);
}

// node_modules/.pnpm/@freezm-ltd+event-target-2@https+++codeload.github.com+freezm-ltd+EventTarget2+tar.gz+11ff208_3njyjyppej5icdv7ro2urw6f3a/node_modules/@freezm-ltd/event-target-2/dist/index.js
var EventTarget22 = class extends EventTarget {
  constructor() {
    super(...arguments);
    this.listeners = /* @__PURE__ */ new Map();
    this._bubbleMap = /* @__PURE__ */ new Map();
    this.atomicQueue = /* @__PURE__ */ new Map();
  }
  async waitFor(type, compareValue) {
    return new Promise((resolve) => {
      if (compareValue !== void 0) {
        this.listenOnceOnly(type, (e2) => resolve(e2.detail), (e2) => e2.detail === compareValue);
      } else {
        this.listenOnce(type, (e2) => resolve(e2.detail));
      }
    });
  }
  callback(type, callback) {
    this.waitFor(type).then(callback);
  }
  dispatch(type, detail) {
    this.dispatchEvent(new CustomEvent(type, detail !== void 0 ? { detail } : void 0));
  }
  listen(type, callback, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, /* @__PURE__ */ new Set());
    this.listeners.get(type).add(callback);
    this.addEventListener(type, callback, options);
  }
  remove(type, callback, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, /* @__PURE__ */ new Set());
    this.listeners.get(type).delete(callback);
    this.removeEventListener(type, callback, options);
  }
  destroy() {
    for (let type of this.listeners.keys()) {
      for (let callback of this.listeners.get(type)) {
        this.remove(type, callback);
      }
    }
  }
  listenOnce(type, callback) {
    this.listen(type, callback, { once: true });
  }
  listenOnceOnly(type, callback, only) {
    const wrapper = (e2) => {
      if (only(e2)) {
        this.remove(type, wrapper);
        callback(e2);
      }
    };
    this.listen(type, wrapper);
  }
  listenDebounce(type, callback, options = { timeout: 100, mode: "last" }) {
    switch (options.mode) {
      case "first":
        return this.listenDebounceFirst(type, callback, options);
      case "last":
        return this.listenDebounceLast(type, callback, options);
    }
  }
  listenDebounceFirst(type, callback, options = { timeout: 100 }) {
    let lastMs = 0;
    this.listen(
      type,
      (e2) => {
        const currentMs = Date.now();
        if (currentMs - lastMs > options.timeout) {
          callback(e2);
        }
        lastMs = currentMs;
      },
      options
    );
  }
  listenDebounceLast(type, callback, options = { timeout: 100 }) {
    let timoutInstance;
    this.listen(
      type,
      (e2) => {
        clearTimeout(timoutInstance);
        timoutInstance = window.setTimeout(() => callback(e2), options.timeout);
      },
      options
    );
  }
  enableBubble(type) {
    if (this._bubbleMap.has(type)) return;
    const dispatcher = (e2) => {
      this.parent?.dispatch(e2.type, e2.detail);
    };
    this.listen(type, dispatcher);
    this._bubbleMap.set(type, dispatcher);
  }
  disableBubble(type) {
    if (!this._bubbleMap.has(type)) return;
    const dispatcher = this._bubbleMap.get(type);
    this.remove(type, dispatcher);
    this._bubbleMap.delete(type);
  }
  _atomicInit(type) {
    this.atomicQueue.set(type, []);
    const atomicLoop = async () => {
      const queue = this.atomicQueue.get(type);
      while (true) {
        const task = queue.shift();
        if (task) {
          await task();
        } else {
          await this.waitFor("__atomic-add", type);
        }
      }
    };
    atomicLoop();
  }
  atomic(type, func) {
    return new Promise((resolve) => {
      const wrap = async () => resolve(await func());
      if (!this.atomicQueue.has(type)) this._atomicInit(type);
      this.atomicQueue.get(type).push(wrap);
      this.dispatch("__atomic-add", type);
    });
  }
};

// node_modules/.pnpm/@freezm-ltd+stream-utils@https+++codeload.github.com+freezm-ltd+stream-utils+tar.gz+03153d599_q2ftbtg22vq2mmblukhdob3yq4/node_modules/@freezm-ltd/stream-utils/dist/index.js
var EventTarget23 = class extends EventTarget {
  constructor() {
    super(...arguments);
    this.listeners = /* @__PURE__ */ new Map();
    this._bubbleMap = /* @__PURE__ */ new Map();
    this.atomicQueue = /* @__PURE__ */ new Map();
  }
  async waitFor(type, compareValue) {
    return new Promise((resolve) => {
      if (compareValue !== void 0) {
        this.listenOnceOnly(type, (e2) => resolve(e2.detail), (e2) => e2.detail === compareValue);
      } else {
        this.listenOnce(type, (e2) => resolve(e2.detail));
      }
    });
  }
  callback(type, callback) {
    this.waitFor(type).then(callback);
  }
  dispatch(type, detail) {
    this.dispatchEvent(new CustomEvent(type, detail !== void 0 ? { detail } : void 0));
  }
  listen(type, callback, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, /* @__PURE__ */ new Set());
    this.listeners.get(type).add(callback);
    this.addEventListener(type, callback, options);
  }
  remove(type, callback, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, /* @__PURE__ */ new Set());
    this.listeners.get(type).delete(callback);
    this.removeEventListener(type, callback, options);
  }
  destroy() {
    for (let type of this.listeners.keys()) {
      for (let callback of this.listeners.get(type)) {
        this.remove(type, callback);
      }
    }
  }
  listenOnce(type, callback) {
    this.listen(type, callback, { once: true });
  }
  listenOnceOnly(type, callback, only) {
    const wrapper = (e2) => {
      if (only(e2)) {
        this.remove(type, wrapper);
        callback(e2);
      }
    };
    this.listen(type, wrapper);
  }
  listenDebounce(type, callback, options = { timeout: 100, mode: "last" }) {
    switch (options.mode) {
      case "first":
        return this.listenDebounceFirst(type, callback, options);
      case "last":
        return this.listenDebounceLast(type, callback, options);
    }
  }
  listenDebounceFirst(type, callback, options = { timeout: 100 }) {
    let lastMs = 0;
    this.listen(
      type,
      (e2) => {
        const currentMs = Date.now();
        if (currentMs - lastMs > options.timeout) {
          callback(e2);
        }
        lastMs = currentMs;
      },
      options
    );
  }
  listenDebounceLast(type, callback, options = { timeout: 100 }) {
    let timoutInstance;
    this.listen(
      type,
      (e2) => {
        clearTimeout(timoutInstance);
        timoutInstance = window.setTimeout(() => callback(e2), options.timeout);
      },
      options
    );
  }
  enableBubble(type) {
    if (this._bubbleMap.has(type)) return;
    const dispatcher = (e2) => {
      this.parent?.dispatch(e2.type, e2.detail);
    };
    this.listen(type, dispatcher);
    this._bubbleMap.set(type, dispatcher);
  }
  disableBubble(type) {
    if (!this._bubbleMap.has(type)) return;
    const dispatcher = this._bubbleMap.get(type);
    this.remove(type, dispatcher);
    this._bubbleMap.delete(type);
  }
  _atomicInit(type) {
    this.atomicQueue.set(type, []);
    const atomicLoop = async () => {
      const queue = this.atomicQueue.get(type);
      while (true) {
        const task = queue.shift();
        if (task) {
          await task();
        } else {
          await this.waitFor("__atomic-add", type);
        }
      }
    };
    atomicLoop();
  }
  atomic(type, func) {
    return new Promise((resolve) => {
      const wrap = async () => resolve(await func());
      if (!this.atomicQueue.has(type)) this._atomicInit(type);
      this.atomicQueue.get(type).push(wrap);
      this.dispatch("__atomic-add", type);
    });
  }
};
function sliceStream(start, end = Number.POSITIVE_INFINITY, measurer, slicer) {
  let index = 0;
  return new TransformStream({
    transform(chunk, controller) {
      const size = measurer(chunk);
      const nextIndex = index + size;
      if (start <= index && nextIndex <= end) {
        controller.enqueue(chunk);
      } else if (index <= start && end <= nextIndex) {
        controller.enqueue(slicer(chunk, start - index, end - index));
      } else if (index <= start && start < nextIndex) {
        controller.enqueue(slicer(chunk, start - index, size));
      } else if (index < end && end <= nextIndex) {
        controller.enqueue(slicer(chunk, 0, end - index));
      } else {
      }
      index = nextIndex;
    }
  });
}
function sliceByteStream(start, end) {
  return sliceStream(
    start,
    end,
    (chunk) => chunk.length,
    (chunk, start2, end2) => chunk.slice(start2, end2)
  );
}
function mergeStream(generators, context, option) {
  const { readable, writable } = new TransformStream(void 0, option?.writableStrategy, option?.readableStrategy);
  const emitter = new EventTarget23();
  const buffer = {};
  const signal = option?.signal;
  const parallel = option?.parallel || 1;
  const load = async (index) => {
    if (index >= generators.length) return;
    buffer[index] = await generators[index](context, signal);
    emitter.dispatch("load", index);
  };
  emitter.listen("next", (e2) => load(e2.detail));
  const task = async () => {
    let index = 0;
    while (index < generators.length) {
      if (!buffer[index]) await emitter.waitFor("load", index);
      try {
        await buffer[index].pipeTo(writable, { preventClose: true });
      } catch (e2) {
        Object.values(buffer).forEach((stream) => stream.cancel(e2).catch(
          /* silent catch */
        ));
        throw e2;
      }
      emitter.dispatch("next", index + parallel);
      index++;
    }
    await writable.close();
    emitter.destroy();
  };
  task();
  for (let i2 = 0; i2 < parallel; i2++) load(i2);
  return readable;
}

// node_modules/.pnpm/client-zip@2.4.5/node_modules/client-zip/index.js
"stream" in Blob.prototype || Object.defineProperty(Blob.prototype, "stream", { value() {
  return new Response(this).body;
} }), "setBigUint64" in DataView.prototype || Object.defineProperty(DataView.prototype, "setBigUint64", { value(e2, n2, t2) {
  const i2 = Number(0xffffffffn & n2), r2 = Number(n2 >> 32n);
  this.setUint32(e2 + (t2 ? 0 : 4), i2, t2), this.setUint32(e2 + (t2 ? 4 : 0), r2, t2);
} });
var e = (e2) => new DataView(new ArrayBuffer(e2));
var n = (e2) => new Uint8Array(e2.buffer || e2);
var t = (e2) => new TextEncoder().encode(String(e2));
var i = (e2) => Math.min(4294967295, Number(e2));
var r = (e2) => Math.min(65535, Number(e2));
function f(e2, i2) {
  if (void 0 === i2 || i2 instanceof Date || (i2 = new Date(i2)), e2 instanceof File) return { isFile: 1, t: i2 || new Date(e2.lastModified), i: e2.stream() };
  if (e2 instanceof Response) return { isFile: 1, t: i2 || new Date(e2.headers.get("Last-Modified") || Date.now()), i: e2.body };
  if (void 0 === i2) i2 = /* @__PURE__ */ new Date();
  else if (isNaN(i2)) throw new Error("Invalid modification date.");
  if (void 0 === e2) return { isFile: 0, t: i2 };
  if ("string" == typeof e2) return { isFile: 1, t: i2, i: t(e2) };
  if (e2 instanceof Blob) return { isFile: 1, t: i2, i: e2.stream() };
  if (e2 instanceof Uint8Array || e2 instanceof ReadableStream) return { isFile: 1, t: i2, i: e2 };
  if (e2 instanceof ArrayBuffer || ArrayBuffer.isView(e2)) return { isFile: 1, t: i2, i: n(e2) };
  if (Symbol.asyncIterator in e2) return { isFile: 1, t: i2, i: o(e2[Symbol.asyncIterator]()) };
  throw new TypeError("Unsupported input format.");
}
function o(e2, n2 = e2) {
  return new ReadableStream({ async pull(n3) {
    let t2 = 0;
    for (; n3.desiredSize > t2; ) {
      const i2 = await e2.next();
      if (!i2.value) {
        n3.close();
        break;
      }
      {
        const e3 = a(i2.value);
        n3.enqueue(e3), t2 += e3.byteLength;
      }
    }
  }, cancel(e3) {
    n2.throw?.(e3);
  } });
}
function a(e2) {
  return "string" == typeof e2 ? t(e2) : e2 instanceof Uint8Array ? e2 : n(e2);
}
function s(e2, i2, r2) {
  let [f2, o2] = function(e3) {
    return e3 ? e3 instanceof Uint8Array ? [e3, 1] : ArrayBuffer.isView(e3) || e3 instanceof ArrayBuffer ? [n(e3), 1] : [t(e3), 0] : [void 0, 0];
  }(i2);
  if (e2 instanceof File) return { o: d(f2 || t(e2.name)), u: BigInt(e2.size), l: o2 };
  if (e2 instanceof Response) {
    const n2 = e2.headers.get("content-disposition"), i3 = n2 && n2.match(/;\s*filename\*?=["']?(.*?)["']?$/i), a2 = i3 && i3[1] || e2.url && new URL(e2.url).pathname.split("/").findLast(Boolean), s2 = a2 && decodeURIComponent(a2), u2 = r2 || +e2.headers.get("content-length");
    return { o: d(f2 || t(s2)), u: BigInt(u2), l: o2 };
  }
  return f2 = d(f2, void 0 !== e2 || void 0 !== r2), "string" == typeof e2 ? { o: f2, u: BigInt(t(e2).length), l: o2 } : e2 instanceof Blob ? { o: f2, u: BigInt(e2.size), l: o2 } : e2 instanceof ArrayBuffer || ArrayBuffer.isView(e2) ? { o: f2, u: BigInt(e2.byteLength), l: o2 } : { o: f2, u: u(e2, r2), l: o2 };
}
function u(e2, n2) {
  return n2 > -1 ? BigInt(n2) : e2 ? void 0 : 0n;
}
function d(e2, n2 = 1) {
  if (!e2 || e2.every((c) => 47 === c)) throw new Error("The file must have a name.");
  if (n2) for (; 47 === e2[e2.length - 1]; ) e2 = e2.subarray(0, -1);
  else 47 !== e2[e2.length - 1] && (e2 = new Uint8Array([...e2, 47]));
  return e2;
}
var l = new Uint32Array(256);
for (let e2 = 0; e2 < 256; ++e2) {
  let n2 = e2;
  for (let e3 = 0; e3 < 8; ++e3) n2 = n2 >>> 1 ^ (1 & n2 && 3988292384);
  l[e2] = n2;
}
function y(e2, n2 = 0) {
  n2 ^= -1;
  for (var t2 = 0, i2 = e2.length; t2 < i2; t2++) n2 = n2 >>> 8 ^ l[255 & n2 ^ e2[t2]];
  return (-1 ^ n2) >>> 0;
}
function w(e2, n2, t2 = 0) {
  const i2 = e2.getSeconds() >> 1 | e2.getMinutes() << 5 | e2.getHours() << 11, r2 = e2.getDate() | e2.getMonth() + 1 << 5 | e2.getFullYear() - 1980 << 9;
  n2.setUint16(t2, i2, 1), n2.setUint16(t2 + 2, r2, 1);
}
function B({ o: e2, l: n2 }, t2) {
  return 8 * (!n2 || (t2 ?? function(e3) {
    try {
      b.decode(e3);
    } catch {
      return 0;
    }
    return 1;
  }(e2)));
}
var b = new TextDecoder("utf8", { fatal: 1 });
function p(t2, i2 = 0) {
  const r2 = e(30);
  return r2.setUint32(0, 1347093252), r2.setUint32(4, 754976768 | i2), w(t2.t, r2, 10), r2.setUint16(26, t2.o.length, 1), n(r2);
}
async function* g(e2) {
  let { i: n2 } = e2;
  if ("then" in n2 && (n2 = await n2), n2 instanceof Uint8Array) yield n2, e2.m = y(n2, 0), e2.u = BigInt(n2.length);
  else {
    e2.u = 0n;
    const t2 = n2.getReader();
    for (; ; ) {
      const { value: n3, done: i2 } = await t2.read();
      if (i2) break;
      e2.m = y(n3, e2.m), e2.u += BigInt(n3.length), yield n3;
    }
  }
}
function I(t2, r2) {
  const f2 = e(16 + (r2 ? 8 : 0));
  return f2.setUint32(0, 1347094280), f2.setUint32(4, t2.isFile ? t2.m : 0, 1), r2 ? (f2.setBigUint64(8, t2.u, 1), f2.setBigUint64(16, t2.u, 1)) : (f2.setUint32(8, i(t2.u), 1), f2.setUint32(12, i(t2.u), 1)), n(f2);
}
function v(t2, r2, f2 = 0, o2 = 0) {
  const a2 = e(46);
  return a2.setUint32(0, 1347092738), a2.setUint32(4, 755182848), a2.setUint16(8, 2048 | f2), w(t2.t, a2, 12), a2.setUint32(16, t2.isFile ? t2.m : 0, 1), a2.setUint32(20, i(t2.u), 1), a2.setUint32(24, i(t2.u), 1), a2.setUint16(28, t2.o.length, 1), a2.setUint16(30, o2, 1), a2.setUint16(40, t2.isFile ? 33204 : 16893, 1), a2.setUint32(42, i(r2), 1), n(a2);
}
function h(t2, i2, r2) {
  const f2 = e(r2);
  return f2.setUint16(0, 1, 1), f2.setUint16(2, r2 - 4, 1), 16 & r2 && (f2.setBigUint64(4, t2.u, 1), f2.setBigUint64(12, t2.u, 1)), f2.setBigUint64(r2 - 8, i2, 1), n(f2);
}
function D(e2) {
  return e2 instanceof File || e2 instanceof Response ? [[e2], [e2]] : [[e2.input, e2.name, e2.size], [e2.input, e2.lastModified]];
}
var S = (e2) => function(e3) {
  let n2 = BigInt(22), t2 = 0n, i2 = 0;
  for (const r2 of e3) {
    if (!r2.o) throw new Error("Every file must have a non-empty name.");
    if (void 0 === r2.u) throw new Error(`Missing size for file "${new TextDecoder().decode(r2.o)}".`);
    const e4 = r2.u >= 0xffffffffn, f2 = t2 >= 0xffffffffn;
    t2 += BigInt(46 + r2.o.length + (e4 && 8)) + r2.u, n2 += BigInt(r2.o.length + 46 + (12 * f2 | 28 * e4)), i2 || (i2 = e4);
  }
  return (i2 || t2 >= 0xffffffffn) && (n2 += BigInt(76)), n2 + t2;
}(function* (e3) {
  for (const n2 of e3) yield s(...D(n2)[0]);
}(e2));
function N(t2, a2 = {}) {
  const u2 = function(e2) {
    const n2 = e2[Symbol.iterator in e2 ? Symbol.iterator : Symbol.asyncIterator]();
    return { async next() {
      const e3 = await n2.next();
      if (e3.done) return e3;
      const [t3, i2] = D(e3.value);
      return { done: 0, value: Object.assign(f(...i2), s(...t3)) };
    }, throw: n2.throw?.bind(n2), [Symbol.asyncIterator]() {
      return this;
    } };
  }(t2);
  return o(async function* (t3, f2) {
    const o2 = [];
    let a3 = 0n, s2 = 0n, u3 = 0;
    for await (const e2 of t3) {
      const n2 = B(e2, f2.buffersAreUTF8);
      yield p(e2, n2), yield new Uint8Array(e2.o), e2.isFile && (yield* g(e2));
      const t4 = e2.u >= 0xffffffffn, i2 = 12 * (a3 >= 0xffffffffn) | 28 * t4;
      yield I(e2, t4), o2.push(v(e2, a3, n2, i2)), o2.push(e2.o), i2 && o2.push(h(e2, a3, i2)), t4 && (a3 += 8n), s2++, a3 += BigInt(46 + e2.o.length) + e2.u, u3 || (u3 = t4);
    }
    let d2 = 0n;
    for (const e2 of o2) yield e2, d2 += BigInt(e2.length);
    if (u3 || a3 >= 0xffffffffn) {
      const t4 = e(76);
      t4.setUint32(0, 1347094022), t4.setBigUint64(4, BigInt(44), 1), t4.setUint32(12, 755182848), t4.setBigUint64(24, s2, 1), t4.setBigUint64(32, s2, 1), t4.setBigUint64(40, d2, 1), t4.setBigUint64(48, a3, 1), t4.setUint32(56, 1347094023), t4.setBigUint64(64, a3 + d2, 1), t4.setUint32(72, 1, 1), yield n(t4);
    }
    const l2 = e(22);
    l2.setUint32(0, 1347093766), l2.setUint16(8, r(s2), 1), l2.setUint16(10, r(s2), 1), l2.setUint32(12, i(d2), 1), l2.setUint32(16, i(a3), 1), yield n(l2);
  }(u2, a2), u2);
}

// src/serviceworker.ts
function createId() {
  return crypto.randomUUID();
}
var Responser = class _Responser extends EventTarget22 {
  constructor() {
    super();
    this.path = new URL(self.registration.scope).pathname + "_service-worker-responsify";
    this.address = /* @__PURE__ */ new WeakMap();
    this.storage = /* @__PURE__ */ new Map();
    this.messenger = MessengerFactory.new(self);
    this.messenger.response("reserve", (_, e2) => {
      const uurl = this.getUniqueURL();
      const client = e2.source;
      if (!this.address.has(client)) this.address.set(client, MessengerFactory.new(client));
      this.storage.set(uurl.id, async (request) => {
        const messenger = this.address.get(client);
        const response = await messenger?.request("reserved", {
          id: uurl.id,
          precursor: request2precursor(request)
        }, request.body ? [request.body] : void 0);
        return response || { reuse: false, status: 404 };
      });
      return uurl;
    });
    this.messenger.response("store", (precursor) => {
      const uurl = this.getUniqueURL();
      this.storage.set(uurl.id, async (childRequest) => {
        const parentRequest = precursor2request(precursor);
        const parentRange = parentRequest.headers.get("Range");
        const childRange = new Headers(childRequest.headers).get("Range");
        if (childRange) {
          let range = childRange;
          if (parentRange) range = nestRange(parentRange, childRange);
          parentRequest.headers.set("Range", range);
        }
        let response = await this.createResponse(parentRequest);
        if (parentRange && childRange && response.status === 206) {
          const offset = parseRange(parentRange).start;
          const total = getRangeLength(parentRange);
          const range = response.headers.get("Content-Range");
          const { start, end } = parseRange(range);
          const headers = new Headers(response.headers);
          headers.set("Content-Range", `bytes ${start - offset}-${end - offset}/${total > 0 ? total : Number(range.split("/").pop()) - offset}`);
          response = new Response(response.body, { headers, status: response.status, statusText: response.statusText });
        }
        return responsify(response, { reuse: precursor.reuse });
      });
      return uurl;
    });
    this.messenger.response("forward", (responsified) => {
      const uurl = this.getUniqueURL();
      this.storage.set(uurl.id, (request) => {
        let result = responsified;
        if (request.method === "HEAD") {
          result.body = void 0;
        }
        if (responsified.reuse && responsified.body instanceof ReadableStream) {
          const { body, ...init } = responsified;
          const [stream1, stream2] = body.tee();
          responsified.body = stream1;
          result = { body: stream2, ...init };
        }
        if (request.headers.has("Range")) {
          const headers = new Headers(result.headers);
          let { start, end } = parseRange(request.headers.get("Range"));
          if (end < 0 && result.body && "length" in result.body) end = result.body.length - 1;
          if (end < 0 && responsified.length) end = responsified.length - 1;
          if (end < 0) headers.set("Content-Range", `bytes */*`);
          else {
            headers.set("Content-Range", `bytes ${start}-${end}/${responsified.length || "*"}`);
            headers.set("Content-Length", (end - start + 1).toString());
          }
          if (result.body) {
            if (result.body instanceof ReadableStream) {
              result.body = result.body.pipeThrough(sliceByteStream(start, end < 0 ? void 0 : end + 1));
            } else {
              if ("buffer" in result.body) {
                result.body = result.body.buffer;
              }
              result.body = result.body.slice(start, end + 1);
            }
          }
          result.headers = Object.fromEntries([...headers]);
          result.status = 206;
          result.statusText = "Partial Content";
        }
        return result;
      });
      return uurl;
    });
    this.messenger.response("merge", (merge) => {
      merge.sort((a2, b2) => a2.index - b2.index);
      const uurl = this.getUniqueURL();
      const reuse = merge.every((part) => part.request.reuse);
      this.storage.set(uurl.id, (request) => {
        const result = { reuse };
        const parts = [];
        const contentRange = { start: -1, end: -1 };
        const lastPart = merge[merge.length - 1];
        const total = lastPart.length ? lastPart.index + lastPart.length : void 0;
        if (request.headers.has("Range")) {
          const range = request.headers.get("Range");
          let { start, end } = parseRange(range, total);
          end += 1;
          if (end < 1) end = Number.MAX_SAFE_INTEGER;
          for (let i2 = 0; i2 < merge.length; i2++) {
            const p1 = merge[i2].index;
            const p2 = merge[i2 + 1]?.index || Number.MAX_SAFE_INTEGER;
            if (p2 <= start || end <= p1) {
              continue;
            }
            const part = structuredClone(merge[i2].request);
            let range2 = "";
            if (start <= p1 && p2 <= end) {
            } else if (p1 <= start && end <= p2) {
              contentRange.start = start;
              if (end === p2 && p2 === Number.MAX_SAFE_INTEGER) {
                range2 = `bytes=${start - p1}-`;
              } else {
                range2 = `bytes=${start - p1}-${end - p1 - 1}`;
                contentRange.end = end - 1;
              }
            } else if (p1 <= start && start < p2) {
              range2 = `bytes=${start - p1}-`;
              contentRange.start = start;
            } else if (p1 < end && end <= p2) {
              contentRange.start = start;
              if (end === p2 && p2 === Number.MAX_SAFE_INTEGER) {
              } else {
                range2 = `bytes=0-${end - p1 - 1}`;
                contentRange.end = end - 1;
              }
            }
            if (range2) {
              const headers = new Headers(part.headers);
              headers.set("Range", range2);
              part.headers = Object.fromEntries([...headers]);
            }
            parts.push(part);
          }
          result.status = 206;
          result.statusText = "Partial Content";
          {
            const { start: start2, end: end2 } = contentRange;
            result.headers = {
              "Content-Range": `bytes ${start2}-${end2 < 0 ? "" : end2}/${total ? total : "*"}`,
              "Content-Length": end2 < 0 ? "" : (end2 - start2 + 1).toString()
            };
          }
        } else {
          parts.push(...merge.map((m) => m.request));
          result.status = 200;
          result.statusText = "OK";
        }
        result.headers = result.headers || {};
        result.headers["Accept-Ranges"] = "bytes";
        if (request.method === "GET") {
          const generators = parts.map((p2) => async () => (await this.createResponse(precursor2request(p2))).body);
          result.body = mergeStream(generators);
        }
        return result;
      });
      return uurl;
    });
    this.messenger.response("zip", (zip) => {
      const uurl = this.getUniqueURL();
      const reuse = zip.entries.every((entry) => entry.request.reuse);
      const name = zip.name.toLowerCase().lastIndexOf(".zip") === zip.name.length - 4 ? zip.name : zip.name + ".zip";
      let size = 0n;
      if (zip.entries.every((entry) => !!entry.size)) {
        try {
          size = S(zip.entries.map((entry) => {
            return { name: entry.name, size: entry.size };
          }));
        } catch {
        }
      }
      this.storage.set(uurl.id, () => {
        const newname = encodeURIComponent(name.replace(/\//g, ":")).replace(/['()]/g, escape).replace(/\*/g, "%2A");
        const headers = {
          "Content-Type": "application/octet-stream; charset=utf-8",
          "Content-Disposition": "attachment; filename*=UTF-8''" + newname
        };
        if (size > 0n) headers["Content-Length"] = size.toString();
        return { reuse, headers, body: N(this.zipSource(zip.entries), { buffersAreUTF8: true }) };
      });
      return uurl;
    });
    caches.open("service-worker-responsify-cache").then((cache) => {
      this.cache = cache;
      this.dispatch("init");
    });
    self.addEventListener("fetch", async (e2) => {
      const response = this.handleRequest(e2.request);
      if (response) e2.respondWith(response);
    });
  }
  handleRequest(request) {
    if (this.parseId(request.url)) {
      return this.createResponse(request);
    }
  }
  async createResponse(request) {
    const id = this.parseId(request.url);
    if (this.storage.has(id)) {
      const responsified = await this.storage.get(id)(request);
      const { reuse, body, ...init } = responsified;
      if (!reuse) this.storage.delete(id);
      return new Response(body, init);
    }
    return await fetch(request);
  }
  parseId(url) {
    url = new URL(url);
    if (url.pathname !== this.path) return;
    return url.searchParams.get("id");
  }
  getUniqueURL() {
    const id = createId();
    if (this.storage.has(id)) return this.getUniqueURL();
    return {
      id,
      url: `${location.origin}${this.path}?id=${id}`
    };
  }
  async *zipSource(entries) {
    const controller = new AbortController();
    const { signal } = controller;
    const promises = entries.map((entry) => {
      return async () => {
        return {
          name: entry.name,
          size: entry.size,
          input: (await this.createResponse(precursor2request(entry.request, { signal }))).body
        };
      };
    });
    try {
      for (const promise of promises) {
        yield await promise();
      }
    } catch (e2) {
      controller.abort(e2);
    }
  }
  static activate() {
    if (!this._instance) this._instance = new _Responser();
  }
};
function parseRange(range, length = 0) {
  let start;
  let end;
  [, start, end] = /bytes[=\s](\d+)-(\d+)?/.exec(range) || [-1, -1, -1];
  if (start === -1) {
    const suffix = Number(/bytes[=\s]-(\d+)/.exec(range)[1]);
    start = length - suffix;
    end = length - 1;
  }
  if (end === void 0) end = -1;
  start = Number(start);
  end = Number(end);
  if (end < 0) end = length - 1;
  return { start, end };
}
function getRangeLength(range, length) {
  const parsed = parseRange(range, length);
  const size = parsed.end - parsed.start + 1;
  if (size < 0) return 0;
  return size;
}
function nestRange(parentRange, childRange, parentLength) {
  const parent = parseRange(parentRange, parentLength);
  const child = parseRange(childRange);
  child.start += parent.start;
  if (child.end > 0) child.end += parent.start;
  return `bytes=${child.start}-${child.end > 0 ? child.end : parent.end > 0 ? parent.end : ""}`;
}
export {
  Responser,
  Responsify
};
