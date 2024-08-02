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
        this.listenOnceOnly(type, (e) => resolve(e.detail), (e) => e.detail === compareValue);
      } else {
        this.listenOnce(type, (e) => resolve(e.detail));
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
    const wrapper = (e) => {
      if (only(e)) {
        this.remove(type, wrapper);
        callback(e);
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
      (e) => {
        const currentMs = Date.now();
        if (currentMs - lastMs > options.timeout) {
          callback(e);
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
      (e) => {
        clearTimeout(timoutInstance);
        timoutInstance = window.setTimeout(() => callback(e), options.timeout);
      },
      options
    );
  }
  enableBubble(type) {
    if (this._bubbleMap.has(type)) return;
    const dispatcher = (e) => {
      this.parent?.dispatch(e.type, e.detail);
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
function isMessageCustomEvent(e) {
  return "data" in e && isMessage(e.data);
}
function unwrapMessage(e) {
  if (isMessageCustomEvent(e)) {
    return e.data;
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
    const listener = async (e) => {
      const response = unwrapMessage(e);
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
    return async (e) => {
      const request = unwrapMessage(e);
      if (request && request.type === type && request.__type === "request" && this.activated) {
        await this._inject(request);
        const result = await handler(request.payload, e);
        let response;
        if (result instanceof Object && "payload" in result && "transfer" in result) {
          const { payload, transfer } = result;
          response = this.createResponse(request, payload, transfer);
        } else {
          response = this.createResponse(request, result);
        }
        await this._send(response, e);
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
    } catch (e) {
      return { ok: false, error: e };
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
    const listener = (e) => {
      if (isIframe(e.origin) && e.data === "loadend") {
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
function precursor2request(precursor) {
  let { url, ...init } = precursor;
  if (init.mode === "navigate") {
    init.mode = "same-origin";
  }
  if ("reuse" in init) {
    const { reuse, ..._init } = init;
    init = _init;
  }
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
        this.listenOnceOnly(type, (e) => resolve(e.detail), (e) => e.detail === compareValue);
      } else {
        this.listenOnce(type, (e) => resolve(e.detail));
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
    const wrapper = (e) => {
      if (only(e)) {
        this.remove(type, wrapper);
        callback(e);
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
      (e) => {
        const currentMs = Date.now();
        if (currentMs - lastMs > options.timeout) {
          callback(e);
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
      (e) => {
        clearTimeout(timoutInstance);
        timoutInstance = window.setTimeout(() => callback(e), options.timeout);
      },
      options
    );
  }
  enableBubble(type) {
    if (this._bubbleMap.has(type)) return;
    const dispatcher = (e) => {
      this.parent?.dispatch(e.type, e.detail);
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
        this.listenOnceOnly(type, (e) => resolve(e.detail), (e) => e.detail === compareValue);
      } else {
        this.listenOnce(type, (e) => resolve(e.detail));
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
    const wrapper = (e) => {
      if (only(e)) {
        this.remove(type, wrapper);
        callback(e);
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
      (e) => {
        const currentMs = Date.now();
        if (currentMs - lastMs > options.timeout) {
          callback(e);
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
      (e) => {
        clearTimeout(timoutInstance);
        timoutInstance = window.setTimeout(() => callback(e), options.timeout);
      },
      options
    );
  }
  enableBubble(type) {
    if (this._bubbleMap.has(type)) return;
    const dispatcher = (e) => {
      this.parent?.dispatch(e.type, e.detail);
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
  emitter.listen("next", (e) => load(e.detail));
  const task = async () => {
    let index = 0;
    while (index < generators.length) {
      if (!buffer[index]) await emitter.waitFor("load", index);
      try {
        await buffer[index].pipeTo(writable, { preventClose: true });
      } catch (e) {
        Object.values(buffer).forEach((stream) => stream.cancel(e).catch(
          /* silent catch */
        ));
        throw e;
      }
      emitter.dispatch("next", index + parallel);
      index++;
    }
    await writable.close();
    emitter.destroy();
  };
  task();
  for (let i = 0; i < parallel; i++) load(i);
  return readable;
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
    this.messenger.response("reserve", (_, e) => {
      const uurl = this.getUniqueURL();
      const client = e.source;
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
      merge.sort((a, b) => a.index - b.index);
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
          for (let i = 0; i < merge.length; i++) {
            const p1 = merge[i].index;
            const p2 = merge[i + 1]?.index || Number.MAX_SAFE_INTEGER;
            if (p2 <= start || end <= p1) {
              continue;
            }
            const part = structuredClone(merge[i].request);
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
          const generators = parts.map((p) => async () => (await this.createResponse(precursor2request(p))).body);
          result.body = mergeStream(generators);
        }
        return result;
      });
      return uurl;
    });
    caches.open("service-worker-responsify-cache").then((cache) => {
      this.cache = cache;
      this.dispatch("init");
    });
    self.addEventListener("fetch", async (e) => {
      const response = this.handleRequest(e.request);
      if (response) e.respondWith(response);
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
