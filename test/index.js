// node_modules/.pnpm/@freezm-ltd+post-together@https+++codeload.github.com+freezm-ltd+post-together+tar.gz+d1be158_woiexn7dcpu22ggapp2ogzvum4/node_modules/@freezm-ltd/post-together/dist/index.js
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
        this.listenOnceOnly(type, (e3) => resolve(e3.detail), (e3) => e3.detail === compareValue);
      } else {
        this.listenOnce(type, (e3) => resolve(e3.detail));
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
    const wrapper = (e3) => {
      if (only(e3)) {
        this.remove(type, wrapper);
        callback(e3);
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
      (e3) => {
        const currentMs = Date.now();
        if (currentMs - lastMs > options.timeout) {
          callback(e3);
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
      (e3) => {
        clearTimeout(timoutInstance);
        timoutInstance = window.setTimeout(() => callback(e3), options.timeout);
      },
      options
    );
  }
  enableBubble(type) {
    if (this._bubbleMap.has(type)) return;
    const dispatcher = (e3) => {
      this.parent?.dispatch(e3.type, e3.detail);
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
function isMessageCustomEvent(e3) {
  return "data" in e3 && isMessage(e3.data);
}
function unwrapMessage(e3) {
  if (isMessageCustomEvent(e3)) {
    return e3.data;
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
    const listener = async (e3) => {
      const response = unwrapMessage(e3);
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
    return async (e3) => {
      const request = unwrapMessage(e3);
      if (request && request.type === type && request.__type === "request" && this.activated) {
        await this._inject(request);
        const result = await handler(request.payload, e3);
        let response;
        if (result instanceof Object && "payload" in result && "transfer" in result) {
          const { payload, transfer } = result;
          response = this.createResponse(request, payload, transfer);
        } else {
          response = this.createResponse(request, result);
        }
        await this._send(response, e3);
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
  constructor(option) {
    super();
    this.state = "off";
    this.listenFroms = /* @__PURE__ */ new Set();
    this.init(option);
  }
  async init(option) {
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
    } catch (e3) {
      return { ok: false, error: e3 };
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
    const listener = (e3) => {
      if (isIframe(e3.origin) && e3.data === "loadend") {
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
  async _init(option = { iframe: false }) {
    if (!option.iframe || isIframe()) await this._initSameOrigin();
    else await this._initCrossOrigin();
    this.addListen(window);
  }
};
var MessageHub = class _MessageHub {
  constructor(option) {
    this.changeHub(option);
  }
  changeHub(option) {
    switch (globalThis.constructor) {
      case globalThis.ServiceWorkerGlobalScope:
        this.hub = new ServiceWorkerMessageHub(option);
        break;
      case globalThis.Window:
        this.hub = new WindowMessageHub(option);
        break;
      case globalThis.DedicatedWorkerGlobalScope:
        this.hub = new DedicatedWorkerMessageHub(option);
        break;
      default:
        throw new Error("MessageHubConstructError: Cannot create MessageHub instance in this scope.");
    }
  }
  static init(option) {
    if (!_MessageHub._instance) _MessageHub._instance = new _MessageHub(option);
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
        this.listenOnceOnly(type, (e3) => resolve(e3.detail), (e3) => e3.detail === compareValue);
      } else {
        this.listenOnce(type, (e3) => resolve(e3.detail));
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
    const wrapper = (e3) => {
      if (only(e3)) {
        this.remove(type, wrapper);
        callback(e3);
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
      (e3) => {
        const currentMs = Date.now();
        if (currentMs - lastMs > options.timeout) {
          callback(e3);
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
      (e3) => {
        clearTimeout(timoutInstance);
        timoutInstance = window.setTimeout(() => callback(e3), options.timeout);
      },
      options
    );
  }
  enableBubble(type) {
    if (this._bubbleMap.has(type)) return;
    const dispatcher = (e3) => {
      this.parent?.dispatch(e3.type, e3.detail);
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

// node_modules/.pnpm/@freezm-ltd+stream-utils@https+++codeload.github.com+freezm-ltd+stream-utils+tar.gz+c58a36bb4_hrnheaymkmtuv7txepjluwmzdy/node_modules/@freezm-ltd/stream-utils/dist/index.js
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
        this.listenOnceOnly(type, (e3) => resolve(e3.detail), (e3) => e3.detail === compareValue);
      } else {
        this.listenOnce(type, (e3) => resolve(e3.detail));
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
    const wrapper = (e3) => {
      if (only(e3)) {
        this.remove(type, wrapper);
        callback(e3);
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
      (e3) => {
        const currentMs = Date.now();
        if (currentMs - lastMs > options.timeout) {
          callback(e3);
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
      (e3) => {
        clearTimeout(timoutInstance);
        timoutInstance = window.setTimeout(() => callback(e3), options.timeout);
      },
      options
    );
  }
  enableBubble(type) {
    if (this._bubbleMap.has(type)) return;
    const dispatcher = (e3) => {
      this.parent?.dispatch(e3.type, e3.detail);
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
function fitMetaStream(size, measurer, slicer) {
  const transform = new TransformStream();
  const tReadable = transform.readable;
  const tWriter = transform.writable.getWriter();
  const buffer = [];
  let written = 0;
  let writer;
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of tReadable) {
        buffer.push(chunk);
        while (buffer.length > 0) {
          if (!writer) {
            const stream = new TransformStream();
            writer = stream.writable.getWriter();
            controller.enqueue(stream.readable);
          }
          const chunk2 = buffer.pop();
          const total = measurer(chunk2);
          const need = size - written;
          if (total > need) {
            await writer.write(slicer(chunk2, 0, need));
            await writer.close();
            written = 0;
            writer = void 0;
            buffer.push(slicer(chunk2, need, total));
          } else {
            await writer.write(chunk2);
            written += total;
          }
        }
      }
      if (writer) await writer.close();
      controller.close();
    }
  });
  const writable = new WritableStream({
    write(chunk) {
      tWriter.write(chunk);
    },
    close() {
      tWriter.close();
    }
  });
  return { readable, writable };
}
function fitMetaByteStream(size) {
  return fitMetaStream(size, (chunk) => chunk.length, (chunk, start, end) => chunk.slice(start, end));
}
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
  emitter.listen("next", (e3) => load(e3.detail));
  const task = async () => {
    let index = 0;
    while (index < generators.length) {
      if (!buffer[index]) await emitter.waitFor("load", index);
      try {
        await buffer[index].pipeTo(writable, { preventClose: true });
      } catch (e3) {
        Object.values(buffer).forEach((stream) => stream.cancel(e3).catch(
          /* silent catch */
        ));
        throw e3;
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
} }), "setBigUint64" in DataView.prototype || Object.defineProperty(DataView.prototype, "setBigUint64", { value(e3, n2, t2) {
  const i2 = Number(0xffffffffn & n2), r2 = Number(n2 >> 32n);
  this.setUint32(e3 + (t2 ? 0 : 4), i2, t2), this.setUint32(e3 + (t2 ? 4 : 0), r2, t2);
} });
var e = (e3) => new DataView(new ArrayBuffer(e3));
var n = (e3) => new Uint8Array(e3.buffer || e3);
var t = (e3) => new TextEncoder().encode(String(e3));
var i = (e3) => Math.min(4294967295, Number(e3));
var r = (e3) => Math.min(65535, Number(e3));
function f(e3, i2) {
  if (void 0 === i2 || i2 instanceof Date || (i2 = new Date(i2)), e3 instanceof File) return { isFile: 1, t: i2 || new Date(e3.lastModified), i: e3.stream() };
  if (e3 instanceof Response) return { isFile: 1, t: i2 || new Date(e3.headers.get("Last-Modified") || Date.now()), i: e3.body };
  if (void 0 === i2) i2 = /* @__PURE__ */ new Date();
  else if (isNaN(i2)) throw new Error("Invalid modification date.");
  if (void 0 === e3) return { isFile: 0, t: i2 };
  if ("string" == typeof e3) return { isFile: 1, t: i2, i: t(e3) };
  if (e3 instanceof Blob) return { isFile: 1, t: i2, i: e3.stream() };
  if (e3 instanceof Uint8Array || e3 instanceof ReadableStream) return { isFile: 1, t: i2, i: e3 };
  if (e3 instanceof ArrayBuffer || ArrayBuffer.isView(e3)) return { isFile: 1, t: i2, i: n(e3) };
  if (Symbol.asyncIterator in e3) return { isFile: 1, t: i2, i: o(e3[Symbol.asyncIterator]()) };
  throw new TypeError("Unsupported input format.");
}
function o(e3, n2 = e3) {
  return new ReadableStream({ async pull(n3) {
    let t2 = 0;
    for (; n3.desiredSize > t2; ) {
      const i2 = await e3.next();
      if (!i2.value) {
        n3.close();
        break;
      }
      {
        const e4 = a(i2.value);
        n3.enqueue(e4), t2 += e4.byteLength;
      }
    }
  }, cancel(e4) {
    n2.throw?.(e4);
  } });
}
function a(e3) {
  return "string" == typeof e3 ? t(e3) : e3 instanceof Uint8Array ? e3 : n(e3);
}
function s(e3, i2, r2) {
  let [f2, o2] = function(e4) {
    return e4 ? e4 instanceof Uint8Array ? [e4, 1] : ArrayBuffer.isView(e4) || e4 instanceof ArrayBuffer ? [n(e4), 1] : [t(e4), 0] : [void 0, 0];
  }(i2);
  if (e3 instanceof File) return { o: d(f2 || t(e3.name)), u: BigInt(e3.size), l: o2 };
  if (e3 instanceof Response) {
    const n2 = e3.headers.get("content-disposition"), i3 = n2 && n2.match(/;\s*filename\*?=["']?(.*?)["']?$/i), a2 = i3 && i3[1] || e3.url && new URL(e3.url).pathname.split("/").findLast(Boolean), s2 = a2 && decodeURIComponent(a2), u2 = r2 || +e3.headers.get("content-length");
    return { o: d(f2 || t(s2)), u: BigInt(u2), l: o2 };
  }
  return f2 = d(f2, void 0 !== e3 || void 0 !== r2), "string" == typeof e3 ? { o: f2, u: BigInt(t(e3).length), l: o2 } : e3 instanceof Blob ? { o: f2, u: BigInt(e3.size), l: o2 } : e3 instanceof ArrayBuffer || ArrayBuffer.isView(e3) ? { o: f2, u: BigInt(e3.byteLength), l: o2 } : { o: f2, u: u(e3, r2), l: o2 };
}
function u(e3, n2) {
  return n2 > -1 ? BigInt(n2) : e3 ? void 0 : 0n;
}
function d(e3, n2 = 1) {
  if (!e3 || e3.every((c) => 47 === c)) throw new Error("The file must have a name.");
  if (n2) for (; 47 === e3[e3.length - 1]; ) e3 = e3.subarray(0, -1);
  else 47 !== e3[e3.length - 1] && (e3 = new Uint8Array([...e3, 47]));
  return e3;
}
var l = new Uint32Array(256);
for (let e3 = 0; e3 < 256; ++e3) {
  let n2 = e3;
  for (let e4 = 0; e4 < 8; ++e4) n2 = n2 >>> 1 ^ (1 & n2 && 3988292384);
  l[e3] = n2;
}
function y(e3, n2 = 0) {
  n2 ^= -1;
  for (var t2 = 0, i2 = e3.length; t2 < i2; t2++) n2 = n2 >>> 8 ^ l[255 & n2 ^ e3[t2]];
  return (-1 ^ n2) >>> 0;
}
function w(e3, n2, t2 = 0) {
  const i2 = e3.getSeconds() >> 1 | e3.getMinutes() << 5 | e3.getHours() << 11, r2 = e3.getDate() | e3.getMonth() + 1 << 5 | e3.getFullYear() - 1980 << 9;
  n2.setUint16(t2, i2, 1), n2.setUint16(t2 + 2, r2, 1);
}
function B({ o: e3, l: n2 }, t2) {
  return 8 * (!n2 || (t2 ?? function(e4) {
    try {
      b.decode(e4);
    } catch {
      return 0;
    }
    return 1;
  }(e3)));
}
var b = new TextDecoder("utf8", { fatal: 1 });
function p(t2, i2 = 0) {
  const r2 = e(30);
  return r2.setUint32(0, 1347093252), r2.setUint32(4, 754976768 | i2), w(t2.t, r2, 10), r2.setUint16(26, t2.o.length, 1), n(r2);
}
async function* g(e3) {
  let { i: n2 } = e3;
  if ("then" in n2 && (n2 = await n2), n2 instanceof Uint8Array) yield n2, e3.m = y(n2, 0), e3.u = BigInt(n2.length);
  else {
    e3.u = 0n;
    const t2 = n2.getReader();
    for (; ; ) {
      const { value: n3, done: i2 } = await t2.read();
      if (i2) break;
      e3.m = y(n3, e3.m), e3.u += BigInt(n3.length), yield n3;
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
function D(e3) {
  return e3 instanceof File || e3 instanceof Response ? [[e3], [e3]] : [[e3.input, e3.name, e3.size], [e3.input, e3.lastModified]];
}
var S = (e3) => function(e4) {
  let n2 = BigInt(22), t2 = 0n, i2 = 0;
  for (const r2 of e4) {
    if (!r2.o) throw new Error("Every file must have a non-empty name.");
    if (void 0 === r2.u) throw new Error(`Missing size for file "${new TextDecoder().decode(r2.o)}".`);
    const e5 = r2.u >= 0xffffffffn, f2 = t2 >= 0xffffffffn;
    t2 += BigInt(46 + r2.o.length + (e5 && 8)) + r2.u, n2 += BigInt(r2.o.length + 46 + (12 * f2 | 28 * e5)), i2 || (i2 = e5);
  }
  return (i2 || t2 >= 0xffffffffn) && (n2 += BigInt(76)), n2 + t2;
}(function* (e4) {
  for (const n2 of e4) yield s(...D(n2)[0]);
}(e3));
function N(t2, a2 = {}) {
  const u2 = function(e3) {
    const n2 = e3[Symbol.iterator in e3 ? Symbol.iterator : Symbol.asyncIterator]();
    return { async next() {
      const e4 = await n2.next();
      if (e4.done) return e4;
      const [t3, i2] = D(e4.value);
      return { done: 0, value: Object.assign(f(...i2), s(...t3)) };
    }, throw: n2.throw?.bind(n2), [Symbol.asyncIterator]() {
      return this;
    } };
  }(t2);
  return o(async function* (t3, f2) {
    const o2 = [];
    let a3 = 0n, s2 = 0n, u3 = 0;
    for await (const e3 of t3) {
      const n2 = B(e3, f2.buffersAreUTF8);
      yield p(e3, n2), yield new Uint8Array(e3.o), e3.isFile && (yield* g(e3));
      const t4 = e3.u >= 0xffffffffn, i2 = 12 * (a3 >= 0xffffffffn) | 28 * t4;
      yield I(e3, t4), o2.push(v(e3, a3, n2, i2)), o2.push(e3.o), i2 && o2.push(h(e3, a3, i2)), t4 && (a3 += 8n), s2++, a3 += BigInt(46 + e3.o.length) + e3.u, u3 || (u3 = t4);
    }
    let d2 = 0n;
    for (const e3 of o2) yield e3, d2 += BigInt(e3.length);
    if (u3 || a3 >= 0xffffffffn) {
      const t4 = e(76);
      t4.setUint32(0, 1347094022), t4.setBigUint64(4, BigInt(44), 1), t4.setUint32(12, 755182848), t4.setBigUint64(24, s2, 1), t4.setBigUint64(32, s2, 1), t4.setBigUint64(40, d2, 1), t4.setBigUint64(48, a3, 1), t4.setUint32(56, 1347094023), t4.setBigUint64(64, a3 + d2, 1), t4.setUint32(72, 1, 1), yield n(t4);
    }
    const l2 = e(22);
    l2.setUint32(0, 1347093766), l2.setUint16(8, r(s2), 1), l2.setUint16(10, r(s2), 1), l2.setUint32(12, i(d2), 1), l2.setUint32(16, i(a3), 1), yield n(l2);
  }(u2, a2), u2);
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/streams/codecs/deflate.js
var MAX_BITS = 15;
var D_CODES = 30;
var BL_CODES = 19;
var LENGTH_CODES = 29;
var LITERALS = 256;
var L_CODES = LITERALS + 1 + LENGTH_CODES;
var HEAP_SIZE = 2 * L_CODES + 1;
var END_BLOCK = 256;
var MAX_BL_BITS = 7;
var REP_3_6 = 16;
var REPZ_3_10 = 17;
var REPZ_11_138 = 18;
var Buf_size = 8 * 2;
var Z_DEFAULT_COMPRESSION = -1;
var Z_FILTERED = 1;
var Z_HUFFMAN_ONLY = 2;
var Z_DEFAULT_STRATEGY = 0;
var Z_NO_FLUSH = 0;
var Z_PARTIAL_FLUSH = 1;
var Z_FULL_FLUSH = 3;
var Z_FINISH = 4;
var Z_OK = 0;
var Z_STREAM_END = 1;
var Z_NEED_DICT = 2;
var Z_STREAM_ERROR = -2;
var Z_DATA_ERROR = -3;
var Z_BUF_ERROR = -5;
function extractArray(array) {
  return flatArray(array.map(([length, value]) => new Array(length).fill(value, 0, length)));
}
function flatArray(array) {
  return array.reduce((a2, b2) => a2.concat(Array.isArray(b2) ? flatArray(b2) : b2), []);
}
var _dist_code = [0, 1, 2, 3].concat(...extractArray([
  [2, 4],
  [2, 5],
  [4, 6],
  [4, 7],
  [8, 8],
  [8, 9],
  [16, 10],
  [16, 11],
  [32, 12],
  [32, 13],
  [64, 14],
  [64, 15],
  [2, 0],
  [1, 16],
  [1, 17],
  [2, 18],
  [2, 19],
  [4, 20],
  [4, 21],
  [8, 22],
  [8, 23],
  [16, 24],
  [16, 25],
  [32, 26],
  [32, 27],
  [64, 28],
  [64, 29]
]));
function Tree() {
  const that = this;
  function gen_bitlen(s2) {
    const tree = that.dyn_tree;
    const stree = that.stat_desc.static_tree;
    const extra = that.stat_desc.extra_bits;
    const base = that.stat_desc.extra_base;
    const max_length = that.stat_desc.max_length;
    let h2;
    let n2, m;
    let bits;
    let xbits;
    let f2;
    let overflow = 0;
    for (bits = 0; bits <= MAX_BITS; bits++)
      s2.bl_count[bits] = 0;
    tree[s2.heap[s2.heap_max] * 2 + 1] = 0;
    for (h2 = s2.heap_max + 1; h2 < HEAP_SIZE; h2++) {
      n2 = s2.heap[h2];
      bits = tree[tree[n2 * 2 + 1] * 2 + 1] + 1;
      if (bits > max_length) {
        bits = max_length;
        overflow++;
      }
      tree[n2 * 2 + 1] = bits;
      if (n2 > that.max_code)
        continue;
      s2.bl_count[bits]++;
      xbits = 0;
      if (n2 >= base)
        xbits = extra[n2 - base];
      f2 = tree[n2 * 2];
      s2.opt_len += f2 * (bits + xbits);
      if (stree)
        s2.static_len += f2 * (stree[n2 * 2 + 1] + xbits);
    }
    if (overflow === 0)
      return;
    do {
      bits = max_length - 1;
      while (s2.bl_count[bits] === 0)
        bits--;
      s2.bl_count[bits]--;
      s2.bl_count[bits + 1] += 2;
      s2.bl_count[max_length]--;
      overflow -= 2;
    } while (overflow > 0);
    for (bits = max_length; bits !== 0; bits--) {
      n2 = s2.bl_count[bits];
      while (n2 !== 0) {
        m = s2.heap[--h2];
        if (m > that.max_code)
          continue;
        if (tree[m * 2 + 1] != bits) {
          s2.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
          tree[m * 2 + 1] = bits;
        }
        n2--;
      }
    }
  }
  function bi_reverse(code, len) {
    let res = 0;
    do {
      res |= code & 1;
      code >>>= 1;
      res <<= 1;
    } while (--len > 0);
    return res >>> 1;
  }
  function gen_codes(tree, max_code, bl_count) {
    const next_code = [];
    let code = 0;
    let bits;
    let n2;
    let len;
    for (bits = 1; bits <= MAX_BITS; bits++) {
      next_code[bits] = code = code + bl_count[bits - 1] << 1;
    }
    for (n2 = 0; n2 <= max_code; n2++) {
      len = tree[n2 * 2 + 1];
      if (len === 0)
        continue;
      tree[n2 * 2] = bi_reverse(next_code[len]++, len);
    }
  }
  that.build_tree = function(s2) {
    const tree = that.dyn_tree;
    const stree = that.stat_desc.static_tree;
    const elems = that.stat_desc.elems;
    let n2, m;
    let max_code = -1;
    let node;
    s2.heap_len = 0;
    s2.heap_max = HEAP_SIZE;
    for (n2 = 0; n2 < elems; n2++) {
      if (tree[n2 * 2] !== 0) {
        s2.heap[++s2.heap_len] = max_code = n2;
        s2.depth[n2] = 0;
      } else {
        tree[n2 * 2 + 1] = 0;
      }
    }
    while (s2.heap_len < 2) {
      node = s2.heap[++s2.heap_len] = max_code < 2 ? ++max_code : 0;
      tree[node * 2] = 1;
      s2.depth[node] = 0;
      s2.opt_len--;
      if (stree)
        s2.static_len -= stree[node * 2 + 1];
    }
    that.max_code = max_code;
    for (n2 = Math.floor(s2.heap_len / 2); n2 >= 1; n2--)
      s2.pqdownheap(tree, n2);
    node = elems;
    do {
      n2 = s2.heap[1];
      s2.heap[1] = s2.heap[s2.heap_len--];
      s2.pqdownheap(tree, 1);
      m = s2.heap[1];
      s2.heap[--s2.heap_max] = n2;
      s2.heap[--s2.heap_max] = m;
      tree[node * 2] = tree[n2 * 2] + tree[m * 2];
      s2.depth[node] = Math.max(s2.depth[n2], s2.depth[m]) + 1;
      tree[n2 * 2 + 1] = tree[m * 2 + 1] = node;
      s2.heap[1] = node++;
      s2.pqdownheap(tree, 1);
    } while (s2.heap_len >= 2);
    s2.heap[--s2.heap_max] = s2.heap[1];
    gen_bitlen(s2);
    gen_codes(tree, that.max_code, s2.bl_count);
  };
}
Tree._length_code = [0, 1, 2, 3, 4, 5, 6, 7].concat(...extractArray([
  [2, 8],
  [2, 9],
  [2, 10],
  [2, 11],
  [4, 12],
  [4, 13],
  [4, 14],
  [4, 15],
  [8, 16],
  [8, 17],
  [8, 18],
  [8, 19],
  [16, 20],
  [16, 21],
  [16, 22],
  [16, 23],
  [32, 24],
  [32, 25],
  [32, 26],
  [31, 27],
  [1, 28]
]));
Tree.base_length = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 0];
Tree.base_dist = [
  0,
  1,
  2,
  3,
  4,
  6,
  8,
  12,
  16,
  24,
  32,
  48,
  64,
  96,
  128,
  192,
  256,
  384,
  512,
  768,
  1024,
  1536,
  2048,
  3072,
  4096,
  6144,
  8192,
  12288,
  16384,
  24576
];
Tree.d_code = function(dist) {
  return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
};
Tree.extra_lbits = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
Tree.extra_dbits = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
Tree.extra_blbits = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7];
Tree.bl_order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
function StaticTree(static_tree, extra_bits, extra_base, elems, max_length) {
  const that = this;
  that.static_tree = static_tree;
  that.extra_bits = extra_bits;
  that.extra_base = extra_base;
  that.elems = elems;
  that.max_length = max_length;
}
var static_ltree2_first_part = [
  12,
  140,
  76,
  204,
  44,
  172,
  108,
  236,
  28,
  156,
  92,
  220,
  60,
  188,
  124,
  252,
  2,
  130,
  66,
  194,
  34,
  162,
  98,
  226,
  18,
  146,
  82,
  210,
  50,
  178,
  114,
  242,
  10,
  138,
  74,
  202,
  42,
  170,
  106,
  234,
  26,
  154,
  90,
  218,
  58,
  186,
  122,
  250,
  6,
  134,
  70,
  198,
  38,
  166,
  102,
  230,
  22,
  150,
  86,
  214,
  54,
  182,
  118,
  246,
  14,
  142,
  78,
  206,
  46,
  174,
  110,
  238,
  30,
  158,
  94,
  222,
  62,
  190,
  126,
  254,
  1,
  129,
  65,
  193,
  33,
  161,
  97,
  225,
  17,
  145,
  81,
  209,
  49,
  177,
  113,
  241,
  9,
  137,
  73,
  201,
  41,
  169,
  105,
  233,
  25,
  153,
  89,
  217,
  57,
  185,
  121,
  249,
  5,
  133,
  69,
  197,
  37,
  165,
  101,
  229,
  21,
  149,
  85,
  213,
  53,
  181,
  117,
  245,
  13,
  141,
  77,
  205,
  45,
  173,
  109,
  237,
  29,
  157,
  93,
  221,
  61,
  189,
  125,
  253,
  19,
  275,
  147,
  403,
  83,
  339,
  211,
  467,
  51,
  307,
  179,
  435,
  115,
  371,
  243,
  499,
  11,
  267,
  139,
  395,
  75,
  331,
  203,
  459,
  43,
  299,
  171,
  427,
  107,
  363,
  235,
  491,
  27,
  283,
  155,
  411,
  91,
  347,
  219,
  475,
  59,
  315,
  187,
  443,
  123,
  379,
  251,
  507,
  7,
  263,
  135,
  391,
  71,
  327,
  199,
  455,
  39,
  295,
  167,
  423,
  103,
  359,
  231,
  487,
  23,
  279,
  151,
  407,
  87,
  343,
  215,
  471,
  55,
  311,
  183,
  439,
  119,
  375,
  247,
  503,
  15,
  271,
  143,
  399,
  79,
  335,
  207,
  463,
  47,
  303,
  175,
  431,
  111,
  367,
  239,
  495,
  31,
  287,
  159,
  415,
  95,
  351,
  223,
  479,
  63,
  319,
  191,
  447,
  127,
  383,
  255,
  511,
  0,
  64,
  32,
  96,
  16,
  80,
  48,
  112,
  8,
  72,
  40,
  104,
  24,
  88,
  56,
  120,
  4,
  68,
  36,
  100,
  20,
  84,
  52,
  116,
  3,
  131,
  67,
  195,
  35,
  163,
  99,
  227
];
var static_ltree2_second_part = extractArray([[144, 8], [112, 9], [24, 7], [8, 8]]);
StaticTree.static_ltree = flatArray(static_ltree2_first_part.map((value, index) => [value, static_ltree2_second_part[index]]));
var static_dtree_first_part = [0, 16, 8, 24, 4, 20, 12, 28, 2, 18, 10, 26, 6, 22, 14, 30, 1, 17, 9, 25, 5, 21, 13, 29, 3, 19, 11, 27, 7, 23];
var static_dtree_second_part = extractArray([[30, 5]]);
StaticTree.static_dtree = flatArray(static_dtree_first_part.map((value, index) => [value, static_dtree_second_part[index]]));
StaticTree.static_l_desc = new StaticTree(StaticTree.static_ltree, Tree.extra_lbits, LITERALS + 1, L_CODES, MAX_BITS);
StaticTree.static_d_desc = new StaticTree(StaticTree.static_dtree, Tree.extra_dbits, 0, D_CODES, MAX_BITS);
StaticTree.static_bl_desc = new StaticTree(null, Tree.extra_blbits, 0, BL_CODES, MAX_BL_BITS);
var MAX_MEM_LEVEL = 9;
var DEF_MEM_LEVEL = 8;
function Config(good_length, max_lazy, nice_length, max_chain, func) {
  const that = this;
  that.good_length = good_length;
  that.max_lazy = max_lazy;
  that.nice_length = nice_length;
  that.max_chain = max_chain;
  that.func = func;
}
var STORED = 0;
var FAST = 1;
var SLOW = 2;
var config_table = [
  new Config(0, 0, 0, 0, STORED),
  new Config(4, 4, 8, 4, FAST),
  new Config(4, 5, 16, 8, FAST),
  new Config(4, 6, 32, 32, FAST),
  new Config(4, 4, 16, 16, SLOW),
  new Config(8, 16, 32, 32, SLOW),
  new Config(8, 16, 128, 128, SLOW),
  new Config(8, 32, 128, 256, SLOW),
  new Config(32, 128, 258, 1024, SLOW),
  new Config(32, 258, 258, 4096, SLOW)
];
var z_errmsg = [
  "need dictionary",
  // Z_NEED_DICT
  // 2
  "stream end",
  // Z_STREAM_END 1
  "",
  // Z_OK 0
  "",
  // Z_ERRNO (-1)
  "stream error",
  // Z_STREAM_ERROR (-2)
  "data error",
  // Z_DATA_ERROR (-3)
  "",
  // Z_MEM_ERROR (-4)
  "buffer error",
  // Z_BUF_ERROR (-5)
  "",
  // Z_VERSION_ERROR (-6)
  ""
];
var NeedMore = 0;
var BlockDone = 1;
var FinishStarted = 2;
var FinishDone = 3;
var PRESET_DICT = 32;
var INIT_STATE = 42;
var BUSY_STATE = 113;
var FINISH_STATE = 666;
var Z_DEFLATED = 8;
var STORED_BLOCK = 0;
var STATIC_TREES = 1;
var DYN_TREES = 2;
var MIN_MATCH = 3;
var MAX_MATCH = 258;
var MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
function smaller(tree, n2, m, depth) {
  const tn2 = tree[n2 * 2];
  const tm2 = tree[m * 2];
  return tn2 < tm2 || tn2 == tm2 && depth[n2] <= depth[m];
}
function Deflate() {
  const that = this;
  let strm;
  let status;
  let pending_buf_size;
  let last_flush;
  let w_size;
  let w_bits;
  let w_mask;
  let win;
  let window_size;
  let prev;
  let head;
  let ins_h;
  let hash_size;
  let hash_bits;
  let hash_mask;
  let hash_shift;
  let block_start;
  let match_length;
  let prev_match;
  let match_available;
  let strstart;
  let match_start;
  let lookahead;
  let prev_length;
  let max_chain_length;
  let max_lazy_match;
  let level;
  let strategy;
  let good_match;
  let nice_match;
  let dyn_ltree;
  let dyn_dtree;
  let bl_tree;
  const l_desc = new Tree();
  const d_desc = new Tree();
  const bl_desc = new Tree();
  that.depth = [];
  let lit_bufsize;
  let last_lit;
  let matches;
  let last_eob_len;
  let bi_buf;
  let bi_valid;
  that.bl_count = [];
  that.heap = [];
  dyn_ltree = [];
  dyn_dtree = [];
  bl_tree = [];
  function lm_init() {
    window_size = 2 * w_size;
    head[hash_size - 1] = 0;
    for (let i2 = 0; i2 < hash_size - 1; i2++) {
      head[i2] = 0;
    }
    max_lazy_match = config_table[level].max_lazy;
    good_match = config_table[level].good_length;
    nice_match = config_table[level].nice_length;
    max_chain_length = config_table[level].max_chain;
    strstart = 0;
    block_start = 0;
    lookahead = 0;
    match_length = prev_length = MIN_MATCH - 1;
    match_available = 0;
    ins_h = 0;
  }
  function init_block() {
    let i2;
    for (i2 = 0; i2 < L_CODES; i2++)
      dyn_ltree[i2 * 2] = 0;
    for (i2 = 0; i2 < D_CODES; i2++)
      dyn_dtree[i2 * 2] = 0;
    for (i2 = 0; i2 < BL_CODES; i2++)
      bl_tree[i2 * 2] = 0;
    dyn_ltree[END_BLOCK * 2] = 1;
    that.opt_len = that.static_len = 0;
    last_lit = matches = 0;
  }
  function tr_init() {
    l_desc.dyn_tree = dyn_ltree;
    l_desc.stat_desc = StaticTree.static_l_desc;
    d_desc.dyn_tree = dyn_dtree;
    d_desc.stat_desc = StaticTree.static_d_desc;
    bl_desc.dyn_tree = bl_tree;
    bl_desc.stat_desc = StaticTree.static_bl_desc;
    bi_buf = 0;
    bi_valid = 0;
    last_eob_len = 8;
    init_block();
  }
  that.pqdownheap = function(tree, k) {
    const heap = that.heap;
    const v2 = heap[k];
    let j = k << 1;
    while (j <= that.heap_len) {
      if (j < that.heap_len && smaller(tree, heap[j + 1], heap[j], that.depth)) {
        j++;
      }
      if (smaller(tree, v2, heap[j], that.depth))
        break;
      heap[k] = heap[j];
      k = j;
      j <<= 1;
    }
    heap[k] = v2;
  };
  function scan_tree(tree, max_code) {
    let prevlen = -1;
    let curlen;
    let nextlen = tree[0 * 2 + 1];
    let count = 0;
    let max_count = 7;
    let min_count = 4;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    }
    tree[(max_code + 1) * 2 + 1] = 65535;
    for (let n2 = 0; n2 <= max_code; n2++) {
      curlen = nextlen;
      nextlen = tree[(n2 + 1) * 2 + 1];
      if (++count < max_count && curlen == nextlen) {
        continue;
      } else if (count < min_count) {
        bl_tree[curlen * 2] += count;
      } else if (curlen !== 0) {
        if (curlen != prevlen)
          bl_tree[curlen * 2]++;
        bl_tree[REP_3_6 * 2]++;
      } else if (count <= 10) {
        bl_tree[REPZ_3_10 * 2]++;
      } else {
        bl_tree[REPZ_11_138 * 2]++;
      }
      count = 0;
      prevlen = curlen;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      } else if (curlen == nextlen) {
        max_count = 6;
        min_count = 3;
      } else {
        max_count = 7;
        min_count = 4;
      }
    }
  }
  function build_bl_tree() {
    let max_blindex;
    scan_tree(dyn_ltree, l_desc.max_code);
    scan_tree(dyn_dtree, d_desc.max_code);
    bl_desc.build_tree(that);
    for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {
      if (bl_tree[Tree.bl_order[max_blindex] * 2 + 1] !== 0)
        break;
    }
    that.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
    return max_blindex;
  }
  function put_byte(p2) {
    that.pending_buf[that.pending++] = p2;
  }
  function put_short(w2) {
    put_byte(w2 & 255);
    put_byte(w2 >>> 8 & 255);
  }
  function putShortMSB(b2) {
    put_byte(b2 >> 8 & 255);
    put_byte(b2 & 255 & 255);
  }
  function send_bits(value, length) {
    let val;
    const len = length;
    if (bi_valid > Buf_size - len) {
      val = value;
      bi_buf |= val << bi_valid & 65535;
      put_short(bi_buf);
      bi_buf = val >>> Buf_size - bi_valid;
      bi_valid += len - Buf_size;
    } else {
      bi_buf |= value << bi_valid & 65535;
      bi_valid += len;
    }
  }
  function send_code(c, tree) {
    const c2 = c * 2;
    send_bits(tree[c2] & 65535, tree[c2 + 1] & 65535);
  }
  function send_tree(tree, max_code) {
    let n2;
    let prevlen = -1;
    let curlen;
    let nextlen = tree[0 * 2 + 1];
    let count = 0;
    let max_count = 7;
    let min_count = 4;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    }
    for (n2 = 0; n2 <= max_code; n2++) {
      curlen = nextlen;
      nextlen = tree[(n2 + 1) * 2 + 1];
      if (++count < max_count && curlen == nextlen) {
        continue;
      } else if (count < min_count) {
        do {
          send_code(curlen, bl_tree);
        } while (--count !== 0);
      } else if (curlen !== 0) {
        if (curlen != prevlen) {
          send_code(curlen, bl_tree);
          count--;
        }
        send_code(REP_3_6, bl_tree);
        send_bits(count - 3, 2);
      } else if (count <= 10) {
        send_code(REPZ_3_10, bl_tree);
        send_bits(count - 3, 3);
      } else {
        send_code(REPZ_11_138, bl_tree);
        send_bits(count - 11, 7);
      }
      count = 0;
      prevlen = curlen;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      } else if (curlen == nextlen) {
        max_count = 6;
        min_count = 3;
      } else {
        max_count = 7;
        min_count = 4;
      }
    }
  }
  function send_all_trees(lcodes, dcodes, blcodes) {
    let rank;
    send_bits(lcodes - 257, 5);
    send_bits(dcodes - 1, 5);
    send_bits(blcodes - 4, 4);
    for (rank = 0; rank < blcodes; rank++) {
      send_bits(bl_tree[Tree.bl_order[rank] * 2 + 1], 3);
    }
    send_tree(dyn_ltree, lcodes - 1);
    send_tree(dyn_dtree, dcodes - 1);
  }
  function bi_flush() {
    if (bi_valid == 16) {
      put_short(bi_buf);
      bi_buf = 0;
      bi_valid = 0;
    } else if (bi_valid >= 8) {
      put_byte(bi_buf & 255);
      bi_buf >>>= 8;
      bi_valid -= 8;
    }
  }
  function _tr_align() {
    send_bits(STATIC_TREES << 1, 3);
    send_code(END_BLOCK, StaticTree.static_ltree);
    bi_flush();
    if (1 + last_eob_len + 10 - bi_valid < 9) {
      send_bits(STATIC_TREES << 1, 3);
      send_code(END_BLOCK, StaticTree.static_ltree);
      bi_flush();
    }
    last_eob_len = 7;
  }
  function _tr_tally(dist, lc) {
    let out_length, in_length, dcode;
    that.dist_buf[last_lit] = dist;
    that.lc_buf[last_lit] = lc & 255;
    last_lit++;
    if (dist === 0) {
      dyn_ltree[lc * 2]++;
    } else {
      matches++;
      dist--;
      dyn_ltree[(Tree._length_code[lc] + LITERALS + 1) * 2]++;
      dyn_dtree[Tree.d_code(dist) * 2]++;
    }
    if ((last_lit & 8191) === 0 && level > 2) {
      out_length = last_lit * 8;
      in_length = strstart - block_start;
      for (dcode = 0; dcode < D_CODES; dcode++) {
        out_length += dyn_dtree[dcode * 2] * (5 + Tree.extra_dbits[dcode]);
      }
      out_length >>>= 3;
      if (matches < Math.floor(last_lit / 2) && out_length < Math.floor(in_length / 2))
        return true;
    }
    return last_lit == lit_bufsize - 1;
  }
  function compress_block(ltree, dtree) {
    let dist;
    let lc;
    let lx = 0;
    let code;
    let extra;
    if (last_lit !== 0) {
      do {
        dist = that.dist_buf[lx];
        lc = that.lc_buf[lx];
        lx++;
        if (dist === 0) {
          send_code(lc, ltree);
        } else {
          code = Tree._length_code[lc];
          send_code(code + LITERALS + 1, ltree);
          extra = Tree.extra_lbits[code];
          if (extra !== 0) {
            lc -= Tree.base_length[code];
            send_bits(lc, extra);
          }
          dist--;
          code = Tree.d_code(dist);
          send_code(code, dtree);
          extra = Tree.extra_dbits[code];
          if (extra !== 0) {
            dist -= Tree.base_dist[code];
            send_bits(dist, extra);
          }
        }
      } while (lx < last_lit);
    }
    send_code(END_BLOCK, ltree);
    last_eob_len = ltree[END_BLOCK * 2 + 1];
  }
  function bi_windup() {
    if (bi_valid > 8) {
      put_short(bi_buf);
    } else if (bi_valid > 0) {
      put_byte(bi_buf & 255);
    }
    bi_buf = 0;
    bi_valid = 0;
  }
  function copy_block(buf, len, header) {
    bi_windup();
    last_eob_len = 8;
    if (header) {
      put_short(len);
      put_short(~len);
    }
    that.pending_buf.set(win.subarray(buf, buf + len), that.pending);
    that.pending += len;
  }
  function _tr_stored_block(buf, stored_len, eof) {
    send_bits((STORED_BLOCK << 1) + (eof ? 1 : 0), 3);
    copy_block(buf, stored_len, true);
  }
  function _tr_flush_block(buf, stored_len, eof) {
    let opt_lenb, static_lenb;
    let max_blindex = 0;
    if (level > 0) {
      l_desc.build_tree(that);
      d_desc.build_tree(that);
      max_blindex = build_bl_tree();
      opt_lenb = that.opt_len + 3 + 7 >>> 3;
      static_lenb = that.static_len + 3 + 7 >>> 3;
      if (static_lenb <= opt_lenb)
        opt_lenb = static_lenb;
    } else {
      opt_lenb = static_lenb = stored_len + 5;
    }
    if (stored_len + 4 <= opt_lenb && buf != -1) {
      _tr_stored_block(buf, stored_len, eof);
    } else if (static_lenb == opt_lenb) {
      send_bits((STATIC_TREES << 1) + (eof ? 1 : 0), 3);
      compress_block(StaticTree.static_ltree, StaticTree.static_dtree);
    } else {
      send_bits((DYN_TREES << 1) + (eof ? 1 : 0), 3);
      send_all_trees(l_desc.max_code + 1, d_desc.max_code + 1, max_blindex + 1);
      compress_block(dyn_ltree, dyn_dtree);
    }
    init_block();
    if (eof) {
      bi_windup();
    }
  }
  function flush_block_only(eof) {
    _tr_flush_block(block_start >= 0 ? block_start : -1, strstart - block_start, eof);
    block_start = strstart;
    strm.flush_pending();
  }
  function fill_window() {
    let n2, m;
    let p2;
    let more;
    do {
      more = window_size - lookahead - strstart;
      if (more === 0 && strstart === 0 && lookahead === 0) {
        more = w_size;
      } else if (more == -1) {
        more--;
      } else if (strstart >= w_size + w_size - MIN_LOOKAHEAD) {
        win.set(win.subarray(w_size, w_size + w_size), 0);
        match_start -= w_size;
        strstart -= w_size;
        block_start -= w_size;
        n2 = hash_size;
        p2 = n2;
        do {
          m = head[--p2] & 65535;
          head[p2] = m >= w_size ? m - w_size : 0;
        } while (--n2 !== 0);
        n2 = w_size;
        p2 = n2;
        do {
          m = prev[--p2] & 65535;
          prev[p2] = m >= w_size ? m - w_size : 0;
        } while (--n2 !== 0);
        more += w_size;
      }
      if (strm.avail_in === 0)
        return;
      n2 = strm.read_buf(win, strstart + lookahead, more);
      lookahead += n2;
      if (lookahead >= MIN_MATCH) {
        ins_h = win[strstart] & 255;
        ins_h = (ins_h << hash_shift ^ win[strstart + 1] & 255) & hash_mask;
      }
    } while (lookahead < MIN_LOOKAHEAD && strm.avail_in !== 0);
  }
  function deflate_stored(flush) {
    let max_block_size = 65535;
    let max_start;
    if (max_block_size > pending_buf_size - 5) {
      max_block_size = pending_buf_size - 5;
    }
    while (true) {
      if (lookahead <= 1) {
        fill_window();
        if (lookahead === 0 && flush == Z_NO_FLUSH)
          return NeedMore;
        if (lookahead === 0)
          break;
      }
      strstart += lookahead;
      lookahead = 0;
      max_start = block_start + max_block_size;
      if (strstart === 0 || strstart >= max_start) {
        lookahead = strstart - max_start;
        strstart = max_start;
        flush_block_only(false);
        if (strm.avail_out === 0)
          return NeedMore;
      }
      if (strstart - block_start >= w_size - MIN_LOOKAHEAD) {
        flush_block_only(false);
        if (strm.avail_out === 0)
          return NeedMore;
      }
    }
    flush_block_only(flush == Z_FINISH);
    if (strm.avail_out === 0)
      return flush == Z_FINISH ? FinishStarted : NeedMore;
    return flush == Z_FINISH ? FinishDone : BlockDone;
  }
  function longest_match(cur_match) {
    let chain_length = max_chain_length;
    let scan = strstart;
    let match;
    let len;
    let best_len = prev_length;
    const limit = strstart > w_size - MIN_LOOKAHEAD ? strstart - (w_size - MIN_LOOKAHEAD) : 0;
    let _nice_match = nice_match;
    const wmask = w_mask;
    const strend = strstart + MAX_MATCH;
    let scan_end1 = win[scan + best_len - 1];
    let scan_end = win[scan + best_len];
    if (prev_length >= good_match) {
      chain_length >>= 2;
    }
    if (_nice_match > lookahead)
      _nice_match = lookahead;
    do {
      match = cur_match;
      if (win[match + best_len] != scan_end || win[match + best_len - 1] != scan_end1 || win[match] != win[scan] || win[++match] != win[scan + 1])
        continue;
      scan += 2;
      match++;
      do {
      } while (win[++scan] == win[++match] && win[++scan] == win[++match] && win[++scan] == win[++match] && win[++scan] == win[++match] && win[++scan] == win[++match] && win[++scan] == win[++match] && win[++scan] == win[++match] && win[++scan] == win[++match] && scan < strend);
      len = MAX_MATCH - (strend - scan);
      scan = strend - MAX_MATCH;
      if (len > best_len) {
        match_start = cur_match;
        best_len = len;
        if (len >= _nice_match)
          break;
        scan_end1 = win[scan + best_len - 1];
        scan_end = win[scan + best_len];
      }
    } while ((cur_match = prev[cur_match & wmask] & 65535) > limit && --chain_length !== 0);
    if (best_len <= lookahead)
      return best_len;
    return lookahead;
  }
  function deflate_fast(flush) {
    let hash_head = 0;
    let bflush;
    while (true) {
      if (lookahead < MIN_LOOKAHEAD) {
        fill_window();
        if (lookahead < MIN_LOOKAHEAD && flush == Z_NO_FLUSH) {
          return NeedMore;
        }
        if (lookahead === 0)
          break;
      }
      if (lookahead >= MIN_MATCH) {
        ins_h = (ins_h << hash_shift ^ win[strstart + (MIN_MATCH - 1)] & 255) & hash_mask;
        hash_head = head[ins_h] & 65535;
        prev[strstart & w_mask] = head[ins_h];
        head[ins_h] = strstart;
      }
      if (hash_head !== 0 && (strstart - hash_head & 65535) <= w_size - MIN_LOOKAHEAD) {
        if (strategy != Z_HUFFMAN_ONLY) {
          match_length = longest_match(hash_head);
        }
      }
      if (match_length >= MIN_MATCH) {
        bflush = _tr_tally(strstart - match_start, match_length - MIN_MATCH);
        lookahead -= match_length;
        if (match_length <= max_lazy_match && lookahead >= MIN_MATCH) {
          match_length--;
          do {
            strstart++;
            ins_h = (ins_h << hash_shift ^ win[strstart + (MIN_MATCH - 1)] & 255) & hash_mask;
            hash_head = head[ins_h] & 65535;
            prev[strstart & w_mask] = head[ins_h];
            head[ins_h] = strstart;
          } while (--match_length !== 0);
          strstart++;
        } else {
          strstart += match_length;
          match_length = 0;
          ins_h = win[strstart] & 255;
          ins_h = (ins_h << hash_shift ^ win[strstart + 1] & 255) & hash_mask;
        }
      } else {
        bflush = _tr_tally(0, win[strstart] & 255);
        lookahead--;
        strstart++;
      }
      if (bflush) {
        flush_block_only(false);
        if (strm.avail_out === 0)
          return NeedMore;
      }
    }
    flush_block_only(flush == Z_FINISH);
    if (strm.avail_out === 0) {
      if (flush == Z_FINISH)
        return FinishStarted;
      else
        return NeedMore;
    }
    return flush == Z_FINISH ? FinishDone : BlockDone;
  }
  function deflate_slow(flush) {
    let hash_head = 0;
    let bflush;
    let max_insert;
    while (true) {
      if (lookahead < MIN_LOOKAHEAD) {
        fill_window();
        if (lookahead < MIN_LOOKAHEAD && flush == Z_NO_FLUSH) {
          return NeedMore;
        }
        if (lookahead === 0)
          break;
      }
      if (lookahead >= MIN_MATCH) {
        ins_h = (ins_h << hash_shift ^ win[strstart + (MIN_MATCH - 1)] & 255) & hash_mask;
        hash_head = head[ins_h] & 65535;
        prev[strstart & w_mask] = head[ins_h];
        head[ins_h] = strstart;
      }
      prev_length = match_length;
      prev_match = match_start;
      match_length = MIN_MATCH - 1;
      if (hash_head !== 0 && prev_length < max_lazy_match && (strstart - hash_head & 65535) <= w_size - MIN_LOOKAHEAD) {
        if (strategy != Z_HUFFMAN_ONLY) {
          match_length = longest_match(hash_head);
        }
        if (match_length <= 5 && (strategy == Z_FILTERED || match_length == MIN_MATCH && strstart - match_start > 4096)) {
          match_length = MIN_MATCH - 1;
        }
      }
      if (prev_length >= MIN_MATCH && match_length <= prev_length) {
        max_insert = strstart + lookahead - MIN_MATCH;
        bflush = _tr_tally(strstart - 1 - prev_match, prev_length - MIN_MATCH);
        lookahead -= prev_length - 1;
        prev_length -= 2;
        do {
          if (++strstart <= max_insert) {
            ins_h = (ins_h << hash_shift ^ win[strstart + (MIN_MATCH - 1)] & 255) & hash_mask;
            hash_head = head[ins_h] & 65535;
            prev[strstart & w_mask] = head[ins_h];
            head[ins_h] = strstart;
          }
        } while (--prev_length !== 0);
        match_available = 0;
        match_length = MIN_MATCH - 1;
        strstart++;
        if (bflush) {
          flush_block_only(false);
          if (strm.avail_out === 0)
            return NeedMore;
        }
      } else if (match_available !== 0) {
        bflush = _tr_tally(0, win[strstart - 1] & 255);
        if (bflush) {
          flush_block_only(false);
        }
        strstart++;
        lookahead--;
        if (strm.avail_out === 0)
          return NeedMore;
      } else {
        match_available = 1;
        strstart++;
        lookahead--;
      }
    }
    if (match_available !== 0) {
      bflush = _tr_tally(0, win[strstart - 1] & 255);
      match_available = 0;
    }
    flush_block_only(flush == Z_FINISH);
    if (strm.avail_out === 0) {
      if (flush == Z_FINISH)
        return FinishStarted;
      else
        return NeedMore;
    }
    return flush == Z_FINISH ? FinishDone : BlockDone;
  }
  function deflateReset(strm2) {
    strm2.total_in = strm2.total_out = 0;
    strm2.msg = null;
    that.pending = 0;
    that.pending_out = 0;
    status = BUSY_STATE;
    last_flush = Z_NO_FLUSH;
    tr_init();
    lm_init();
    return Z_OK;
  }
  that.deflateInit = function(strm2, _level, bits, _method, memLevel, _strategy) {
    if (!_method)
      _method = Z_DEFLATED;
    if (!memLevel)
      memLevel = DEF_MEM_LEVEL;
    if (!_strategy)
      _strategy = Z_DEFAULT_STRATEGY;
    strm2.msg = null;
    if (_level == Z_DEFAULT_COMPRESSION)
      _level = 6;
    if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || _method != Z_DEFLATED || bits < 9 || bits > 15 || _level < 0 || _level > 9 || _strategy < 0 || _strategy > Z_HUFFMAN_ONLY) {
      return Z_STREAM_ERROR;
    }
    strm2.dstate = that;
    w_bits = bits;
    w_size = 1 << w_bits;
    w_mask = w_size - 1;
    hash_bits = memLevel + 7;
    hash_size = 1 << hash_bits;
    hash_mask = hash_size - 1;
    hash_shift = Math.floor((hash_bits + MIN_MATCH - 1) / MIN_MATCH);
    win = new Uint8Array(w_size * 2);
    prev = [];
    head = [];
    lit_bufsize = 1 << memLevel + 6;
    that.pending_buf = new Uint8Array(lit_bufsize * 4);
    pending_buf_size = lit_bufsize * 4;
    that.dist_buf = new Uint16Array(lit_bufsize);
    that.lc_buf = new Uint8Array(lit_bufsize);
    level = _level;
    strategy = _strategy;
    return deflateReset(strm2);
  };
  that.deflateEnd = function() {
    if (status != INIT_STATE && status != BUSY_STATE && status != FINISH_STATE) {
      return Z_STREAM_ERROR;
    }
    that.lc_buf = null;
    that.dist_buf = null;
    that.pending_buf = null;
    head = null;
    prev = null;
    win = null;
    that.dstate = null;
    return status == BUSY_STATE ? Z_DATA_ERROR : Z_OK;
  };
  that.deflateParams = function(strm2, _level, _strategy) {
    let err = Z_OK;
    if (_level == Z_DEFAULT_COMPRESSION) {
      _level = 6;
    }
    if (_level < 0 || _level > 9 || _strategy < 0 || _strategy > Z_HUFFMAN_ONLY) {
      return Z_STREAM_ERROR;
    }
    if (config_table[level].func != config_table[_level].func && strm2.total_in !== 0) {
      err = strm2.deflate(Z_PARTIAL_FLUSH);
    }
    if (level != _level) {
      level = _level;
      max_lazy_match = config_table[level].max_lazy;
      good_match = config_table[level].good_length;
      nice_match = config_table[level].nice_length;
      max_chain_length = config_table[level].max_chain;
    }
    strategy = _strategy;
    return err;
  };
  that.deflateSetDictionary = function(_strm, dictionary, dictLength) {
    let length = dictLength;
    let n2, index = 0;
    if (!dictionary || status != INIT_STATE)
      return Z_STREAM_ERROR;
    if (length < MIN_MATCH)
      return Z_OK;
    if (length > w_size - MIN_LOOKAHEAD) {
      length = w_size - MIN_LOOKAHEAD;
      index = dictLength - length;
    }
    win.set(dictionary.subarray(index, index + length), 0);
    strstart = length;
    block_start = length;
    ins_h = win[0] & 255;
    ins_h = (ins_h << hash_shift ^ win[1] & 255) & hash_mask;
    for (n2 = 0; n2 <= length - MIN_MATCH; n2++) {
      ins_h = (ins_h << hash_shift ^ win[n2 + (MIN_MATCH - 1)] & 255) & hash_mask;
      prev[n2 & w_mask] = head[ins_h];
      head[ins_h] = n2;
    }
    return Z_OK;
  };
  that.deflate = function(_strm, flush) {
    let i2, header, level_flags, old_flush, bstate;
    if (flush > Z_FINISH || flush < 0) {
      return Z_STREAM_ERROR;
    }
    if (!_strm.next_out || !_strm.next_in && _strm.avail_in !== 0 || status == FINISH_STATE && flush != Z_FINISH) {
      _strm.msg = z_errmsg[Z_NEED_DICT - Z_STREAM_ERROR];
      return Z_STREAM_ERROR;
    }
    if (_strm.avail_out === 0) {
      _strm.msg = z_errmsg[Z_NEED_DICT - Z_BUF_ERROR];
      return Z_BUF_ERROR;
    }
    strm = _strm;
    old_flush = last_flush;
    last_flush = flush;
    if (status == INIT_STATE) {
      header = Z_DEFLATED + (w_bits - 8 << 4) << 8;
      level_flags = (level - 1 & 255) >> 1;
      if (level_flags > 3)
        level_flags = 3;
      header |= level_flags << 6;
      if (strstart !== 0)
        header |= PRESET_DICT;
      header += 31 - header % 31;
      status = BUSY_STATE;
      putShortMSB(header);
    }
    if (that.pending !== 0) {
      strm.flush_pending();
      if (strm.avail_out === 0) {
        last_flush = -1;
        return Z_OK;
      }
    } else if (strm.avail_in === 0 && flush <= old_flush && flush != Z_FINISH) {
      strm.msg = z_errmsg[Z_NEED_DICT - Z_BUF_ERROR];
      return Z_BUF_ERROR;
    }
    if (status == FINISH_STATE && strm.avail_in !== 0) {
      _strm.msg = z_errmsg[Z_NEED_DICT - Z_BUF_ERROR];
      return Z_BUF_ERROR;
    }
    if (strm.avail_in !== 0 || lookahead !== 0 || flush != Z_NO_FLUSH && status != FINISH_STATE) {
      bstate = -1;
      switch (config_table[level].func) {
        case STORED:
          bstate = deflate_stored(flush);
          break;
        case FAST:
          bstate = deflate_fast(flush);
          break;
        case SLOW:
          bstate = deflate_slow(flush);
          break;
        default:
      }
      if (bstate == FinishStarted || bstate == FinishDone) {
        status = FINISH_STATE;
      }
      if (bstate == NeedMore || bstate == FinishStarted) {
        if (strm.avail_out === 0) {
          last_flush = -1;
        }
        return Z_OK;
      }
      if (bstate == BlockDone) {
        if (flush == Z_PARTIAL_FLUSH) {
          _tr_align();
        } else {
          _tr_stored_block(0, 0, false);
          if (flush == Z_FULL_FLUSH) {
            for (i2 = 0; i2 < hash_size; i2++)
              head[i2] = 0;
          }
        }
        strm.flush_pending();
        if (strm.avail_out === 0) {
          last_flush = -1;
          return Z_OK;
        }
      }
    }
    if (flush != Z_FINISH)
      return Z_OK;
    return Z_STREAM_END;
  };
}
function ZStream() {
  const that = this;
  that.next_in_index = 0;
  that.next_out_index = 0;
  that.avail_in = 0;
  that.total_in = 0;
  that.avail_out = 0;
  that.total_out = 0;
}
ZStream.prototype = {
  deflateInit(level, bits) {
    const that = this;
    that.dstate = new Deflate();
    if (!bits)
      bits = MAX_BITS;
    return that.dstate.deflateInit(that, level, bits);
  },
  deflate(flush) {
    const that = this;
    if (!that.dstate) {
      return Z_STREAM_ERROR;
    }
    return that.dstate.deflate(that, flush);
  },
  deflateEnd() {
    const that = this;
    if (!that.dstate)
      return Z_STREAM_ERROR;
    const ret = that.dstate.deflateEnd();
    that.dstate = null;
    return ret;
  },
  deflateParams(level, strategy) {
    const that = this;
    if (!that.dstate)
      return Z_STREAM_ERROR;
    return that.dstate.deflateParams(that, level, strategy);
  },
  deflateSetDictionary(dictionary, dictLength) {
    const that = this;
    if (!that.dstate)
      return Z_STREAM_ERROR;
    return that.dstate.deflateSetDictionary(that, dictionary, dictLength);
  },
  // Read a new buffer from the current input stream, update the
  // total number of bytes read. All deflate() input goes through
  // this function so some applications may wish to modify it to avoid
  // allocating a large strm->next_in buffer and copying from it.
  // (See also flush_pending()).
  read_buf(buf, start, size) {
    const that = this;
    let len = that.avail_in;
    if (len > size)
      len = size;
    if (len === 0)
      return 0;
    that.avail_in -= len;
    buf.set(that.next_in.subarray(that.next_in_index, that.next_in_index + len), start);
    that.next_in_index += len;
    that.total_in += len;
    return len;
  },
  // Flush as much pending output as possible. All deflate() output goes
  // through this function so some applications may wish to modify it
  // to avoid allocating a large strm->next_out buffer and copying into it.
  // (See also read_buf()).
  flush_pending() {
    const that = this;
    let len = that.dstate.pending;
    if (len > that.avail_out)
      len = that.avail_out;
    if (len === 0)
      return;
    that.next_out.set(that.dstate.pending_buf.subarray(that.dstate.pending_out, that.dstate.pending_out + len), that.next_out_index);
    that.next_out_index += len;
    that.dstate.pending_out += len;
    that.total_out += len;
    that.avail_out -= len;
    that.dstate.pending -= len;
    if (that.dstate.pending === 0) {
      that.dstate.pending_out = 0;
    }
  }
};
function ZipDeflate(options) {
  const that = this;
  const z = new ZStream();
  const bufsize = getMaximumCompressedSize(options && options.chunkSize ? options.chunkSize : 64 * 1024);
  const flush = Z_NO_FLUSH;
  const buf = new Uint8Array(bufsize);
  let level = options ? options.level : Z_DEFAULT_COMPRESSION;
  if (typeof level == "undefined")
    level = Z_DEFAULT_COMPRESSION;
  z.deflateInit(level);
  z.next_out = buf;
  that.append = function(data, onprogress) {
    let err, array, lastIndex = 0, bufferIndex = 0, bufferSize = 0;
    const buffers = [];
    if (!data.length)
      return;
    z.next_in_index = 0;
    z.next_in = data;
    z.avail_in = data.length;
    do {
      z.next_out_index = 0;
      z.avail_out = bufsize;
      err = z.deflate(flush);
      if (err != Z_OK)
        throw new Error("deflating: " + z.msg);
      if (z.next_out_index)
        if (z.next_out_index == bufsize)
          buffers.push(new Uint8Array(buf));
        else
          buffers.push(buf.subarray(0, z.next_out_index));
      bufferSize += z.next_out_index;
      if (onprogress && z.next_in_index > 0 && z.next_in_index != lastIndex) {
        onprogress(z.next_in_index);
        lastIndex = z.next_in_index;
      }
    } while (z.avail_in > 0 || z.avail_out === 0);
    if (buffers.length > 1) {
      array = new Uint8Array(bufferSize);
      buffers.forEach(function(chunk) {
        array.set(chunk, bufferIndex);
        bufferIndex += chunk.length;
      });
    } else {
      array = buffers[0] ? new Uint8Array(buffers[0]) : new Uint8Array();
    }
    return array;
  };
  that.flush = function() {
    let err, array, bufferIndex = 0, bufferSize = 0;
    const buffers = [];
    do {
      z.next_out_index = 0;
      z.avail_out = bufsize;
      err = z.deflate(Z_FINISH);
      if (err != Z_STREAM_END && err != Z_OK)
        throw new Error("deflating: " + z.msg);
      if (bufsize - z.avail_out > 0)
        buffers.push(buf.slice(0, z.next_out_index));
      bufferSize += z.next_out_index;
    } while (z.avail_in > 0 || z.avail_out === 0);
    z.deflateEnd();
    array = new Uint8Array(bufferSize);
    buffers.forEach(function(chunk) {
      array.set(chunk, bufferIndex);
      bufferIndex += chunk.length;
    });
    return array;
  };
}
function getMaximumCompressedSize(uncompressedSize) {
  return uncompressedSize + 5 * (Math.floor(uncompressedSize / 16383) + 1);
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/streams/codecs/inflate.js
var MAX_BITS2 = 15;
var Z_OK2 = 0;
var Z_STREAM_END2 = 1;
var Z_NEED_DICT2 = 2;
var Z_STREAM_ERROR2 = -2;
var Z_DATA_ERROR2 = -3;
var Z_MEM_ERROR = -4;
var Z_BUF_ERROR2 = -5;
var inflate_mask = [
  0,
  1,
  3,
  7,
  15,
  31,
  63,
  127,
  255,
  511,
  1023,
  2047,
  4095,
  8191,
  16383,
  32767,
  65535
];
var MANY = 1440;
var Z_NO_FLUSH2 = 0;
var Z_FINISH2 = 4;
var fixed_bl = 9;
var fixed_bd = 5;
var fixed_tl = [
  96,
  7,
  256,
  0,
  8,
  80,
  0,
  8,
  16,
  84,
  8,
  115,
  82,
  7,
  31,
  0,
  8,
  112,
  0,
  8,
  48,
  0,
  9,
  192,
  80,
  7,
  10,
  0,
  8,
  96,
  0,
  8,
  32,
  0,
  9,
  160,
  0,
  8,
  0,
  0,
  8,
  128,
  0,
  8,
  64,
  0,
  9,
  224,
  80,
  7,
  6,
  0,
  8,
  88,
  0,
  8,
  24,
  0,
  9,
  144,
  83,
  7,
  59,
  0,
  8,
  120,
  0,
  8,
  56,
  0,
  9,
  208,
  81,
  7,
  17,
  0,
  8,
  104,
  0,
  8,
  40,
  0,
  9,
  176,
  0,
  8,
  8,
  0,
  8,
  136,
  0,
  8,
  72,
  0,
  9,
  240,
  80,
  7,
  4,
  0,
  8,
  84,
  0,
  8,
  20,
  85,
  8,
  227,
  83,
  7,
  43,
  0,
  8,
  116,
  0,
  8,
  52,
  0,
  9,
  200,
  81,
  7,
  13,
  0,
  8,
  100,
  0,
  8,
  36,
  0,
  9,
  168,
  0,
  8,
  4,
  0,
  8,
  132,
  0,
  8,
  68,
  0,
  9,
  232,
  80,
  7,
  8,
  0,
  8,
  92,
  0,
  8,
  28,
  0,
  9,
  152,
  84,
  7,
  83,
  0,
  8,
  124,
  0,
  8,
  60,
  0,
  9,
  216,
  82,
  7,
  23,
  0,
  8,
  108,
  0,
  8,
  44,
  0,
  9,
  184,
  0,
  8,
  12,
  0,
  8,
  140,
  0,
  8,
  76,
  0,
  9,
  248,
  80,
  7,
  3,
  0,
  8,
  82,
  0,
  8,
  18,
  85,
  8,
  163,
  83,
  7,
  35,
  0,
  8,
  114,
  0,
  8,
  50,
  0,
  9,
  196,
  81,
  7,
  11,
  0,
  8,
  98,
  0,
  8,
  34,
  0,
  9,
  164,
  0,
  8,
  2,
  0,
  8,
  130,
  0,
  8,
  66,
  0,
  9,
  228,
  80,
  7,
  7,
  0,
  8,
  90,
  0,
  8,
  26,
  0,
  9,
  148,
  84,
  7,
  67,
  0,
  8,
  122,
  0,
  8,
  58,
  0,
  9,
  212,
  82,
  7,
  19,
  0,
  8,
  106,
  0,
  8,
  42,
  0,
  9,
  180,
  0,
  8,
  10,
  0,
  8,
  138,
  0,
  8,
  74,
  0,
  9,
  244,
  80,
  7,
  5,
  0,
  8,
  86,
  0,
  8,
  22,
  192,
  8,
  0,
  83,
  7,
  51,
  0,
  8,
  118,
  0,
  8,
  54,
  0,
  9,
  204,
  81,
  7,
  15,
  0,
  8,
  102,
  0,
  8,
  38,
  0,
  9,
  172,
  0,
  8,
  6,
  0,
  8,
  134,
  0,
  8,
  70,
  0,
  9,
  236,
  80,
  7,
  9,
  0,
  8,
  94,
  0,
  8,
  30,
  0,
  9,
  156,
  84,
  7,
  99,
  0,
  8,
  126,
  0,
  8,
  62,
  0,
  9,
  220,
  82,
  7,
  27,
  0,
  8,
  110,
  0,
  8,
  46,
  0,
  9,
  188,
  0,
  8,
  14,
  0,
  8,
  142,
  0,
  8,
  78,
  0,
  9,
  252,
  96,
  7,
  256,
  0,
  8,
  81,
  0,
  8,
  17,
  85,
  8,
  131,
  82,
  7,
  31,
  0,
  8,
  113,
  0,
  8,
  49,
  0,
  9,
  194,
  80,
  7,
  10,
  0,
  8,
  97,
  0,
  8,
  33,
  0,
  9,
  162,
  0,
  8,
  1,
  0,
  8,
  129,
  0,
  8,
  65,
  0,
  9,
  226,
  80,
  7,
  6,
  0,
  8,
  89,
  0,
  8,
  25,
  0,
  9,
  146,
  83,
  7,
  59,
  0,
  8,
  121,
  0,
  8,
  57,
  0,
  9,
  210,
  81,
  7,
  17,
  0,
  8,
  105,
  0,
  8,
  41,
  0,
  9,
  178,
  0,
  8,
  9,
  0,
  8,
  137,
  0,
  8,
  73,
  0,
  9,
  242,
  80,
  7,
  4,
  0,
  8,
  85,
  0,
  8,
  21,
  80,
  8,
  258,
  83,
  7,
  43,
  0,
  8,
  117,
  0,
  8,
  53,
  0,
  9,
  202,
  81,
  7,
  13,
  0,
  8,
  101,
  0,
  8,
  37,
  0,
  9,
  170,
  0,
  8,
  5,
  0,
  8,
  133,
  0,
  8,
  69,
  0,
  9,
  234,
  80,
  7,
  8,
  0,
  8,
  93,
  0,
  8,
  29,
  0,
  9,
  154,
  84,
  7,
  83,
  0,
  8,
  125,
  0,
  8,
  61,
  0,
  9,
  218,
  82,
  7,
  23,
  0,
  8,
  109,
  0,
  8,
  45,
  0,
  9,
  186,
  0,
  8,
  13,
  0,
  8,
  141,
  0,
  8,
  77,
  0,
  9,
  250,
  80,
  7,
  3,
  0,
  8,
  83,
  0,
  8,
  19,
  85,
  8,
  195,
  83,
  7,
  35,
  0,
  8,
  115,
  0,
  8,
  51,
  0,
  9,
  198,
  81,
  7,
  11,
  0,
  8,
  99,
  0,
  8,
  35,
  0,
  9,
  166,
  0,
  8,
  3,
  0,
  8,
  131,
  0,
  8,
  67,
  0,
  9,
  230,
  80,
  7,
  7,
  0,
  8,
  91,
  0,
  8,
  27,
  0,
  9,
  150,
  84,
  7,
  67,
  0,
  8,
  123,
  0,
  8,
  59,
  0,
  9,
  214,
  82,
  7,
  19,
  0,
  8,
  107,
  0,
  8,
  43,
  0,
  9,
  182,
  0,
  8,
  11,
  0,
  8,
  139,
  0,
  8,
  75,
  0,
  9,
  246,
  80,
  7,
  5,
  0,
  8,
  87,
  0,
  8,
  23,
  192,
  8,
  0,
  83,
  7,
  51,
  0,
  8,
  119,
  0,
  8,
  55,
  0,
  9,
  206,
  81,
  7,
  15,
  0,
  8,
  103,
  0,
  8,
  39,
  0,
  9,
  174,
  0,
  8,
  7,
  0,
  8,
  135,
  0,
  8,
  71,
  0,
  9,
  238,
  80,
  7,
  9,
  0,
  8,
  95,
  0,
  8,
  31,
  0,
  9,
  158,
  84,
  7,
  99,
  0,
  8,
  127,
  0,
  8,
  63,
  0,
  9,
  222,
  82,
  7,
  27,
  0,
  8,
  111,
  0,
  8,
  47,
  0,
  9,
  190,
  0,
  8,
  15,
  0,
  8,
  143,
  0,
  8,
  79,
  0,
  9,
  254,
  96,
  7,
  256,
  0,
  8,
  80,
  0,
  8,
  16,
  84,
  8,
  115,
  82,
  7,
  31,
  0,
  8,
  112,
  0,
  8,
  48,
  0,
  9,
  193,
  80,
  7,
  10,
  0,
  8,
  96,
  0,
  8,
  32,
  0,
  9,
  161,
  0,
  8,
  0,
  0,
  8,
  128,
  0,
  8,
  64,
  0,
  9,
  225,
  80,
  7,
  6,
  0,
  8,
  88,
  0,
  8,
  24,
  0,
  9,
  145,
  83,
  7,
  59,
  0,
  8,
  120,
  0,
  8,
  56,
  0,
  9,
  209,
  81,
  7,
  17,
  0,
  8,
  104,
  0,
  8,
  40,
  0,
  9,
  177,
  0,
  8,
  8,
  0,
  8,
  136,
  0,
  8,
  72,
  0,
  9,
  241,
  80,
  7,
  4,
  0,
  8,
  84,
  0,
  8,
  20,
  85,
  8,
  227,
  83,
  7,
  43,
  0,
  8,
  116,
  0,
  8,
  52,
  0,
  9,
  201,
  81,
  7,
  13,
  0,
  8,
  100,
  0,
  8,
  36,
  0,
  9,
  169,
  0,
  8,
  4,
  0,
  8,
  132,
  0,
  8,
  68,
  0,
  9,
  233,
  80,
  7,
  8,
  0,
  8,
  92,
  0,
  8,
  28,
  0,
  9,
  153,
  84,
  7,
  83,
  0,
  8,
  124,
  0,
  8,
  60,
  0,
  9,
  217,
  82,
  7,
  23,
  0,
  8,
  108,
  0,
  8,
  44,
  0,
  9,
  185,
  0,
  8,
  12,
  0,
  8,
  140,
  0,
  8,
  76,
  0,
  9,
  249,
  80,
  7,
  3,
  0,
  8,
  82,
  0,
  8,
  18,
  85,
  8,
  163,
  83,
  7,
  35,
  0,
  8,
  114,
  0,
  8,
  50,
  0,
  9,
  197,
  81,
  7,
  11,
  0,
  8,
  98,
  0,
  8,
  34,
  0,
  9,
  165,
  0,
  8,
  2,
  0,
  8,
  130,
  0,
  8,
  66,
  0,
  9,
  229,
  80,
  7,
  7,
  0,
  8,
  90,
  0,
  8,
  26,
  0,
  9,
  149,
  84,
  7,
  67,
  0,
  8,
  122,
  0,
  8,
  58,
  0,
  9,
  213,
  82,
  7,
  19,
  0,
  8,
  106,
  0,
  8,
  42,
  0,
  9,
  181,
  0,
  8,
  10,
  0,
  8,
  138,
  0,
  8,
  74,
  0,
  9,
  245,
  80,
  7,
  5,
  0,
  8,
  86,
  0,
  8,
  22,
  192,
  8,
  0,
  83,
  7,
  51,
  0,
  8,
  118,
  0,
  8,
  54,
  0,
  9,
  205,
  81,
  7,
  15,
  0,
  8,
  102,
  0,
  8,
  38,
  0,
  9,
  173,
  0,
  8,
  6,
  0,
  8,
  134,
  0,
  8,
  70,
  0,
  9,
  237,
  80,
  7,
  9,
  0,
  8,
  94,
  0,
  8,
  30,
  0,
  9,
  157,
  84,
  7,
  99,
  0,
  8,
  126,
  0,
  8,
  62,
  0,
  9,
  221,
  82,
  7,
  27,
  0,
  8,
  110,
  0,
  8,
  46,
  0,
  9,
  189,
  0,
  8,
  14,
  0,
  8,
  142,
  0,
  8,
  78,
  0,
  9,
  253,
  96,
  7,
  256,
  0,
  8,
  81,
  0,
  8,
  17,
  85,
  8,
  131,
  82,
  7,
  31,
  0,
  8,
  113,
  0,
  8,
  49,
  0,
  9,
  195,
  80,
  7,
  10,
  0,
  8,
  97,
  0,
  8,
  33,
  0,
  9,
  163,
  0,
  8,
  1,
  0,
  8,
  129,
  0,
  8,
  65,
  0,
  9,
  227,
  80,
  7,
  6,
  0,
  8,
  89,
  0,
  8,
  25,
  0,
  9,
  147,
  83,
  7,
  59,
  0,
  8,
  121,
  0,
  8,
  57,
  0,
  9,
  211,
  81,
  7,
  17,
  0,
  8,
  105,
  0,
  8,
  41,
  0,
  9,
  179,
  0,
  8,
  9,
  0,
  8,
  137,
  0,
  8,
  73,
  0,
  9,
  243,
  80,
  7,
  4,
  0,
  8,
  85,
  0,
  8,
  21,
  80,
  8,
  258,
  83,
  7,
  43,
  0,
  8,
  117,
  0,
  8,
  53,
  0,
  9,
  203,
  81,
  7,
  13,
  0,
  8,
  101,
  0,
  8,
  37,
  0,
  9,
  171,
  0,
  8,
  5,
  0,
  8,
  133,
  0,
  8,
  69,
  0,
  9,
  235,
  80,
  7,
  8,
  0,
  8,
  93,
  0,
  8,
  29,
  0,
  9,
  155,
  84,
  7,
  83,
  0,
  8,
  125,
  0,
  8,
  61,
  0,
  9,
  219,
  82,
  7,
  23,
  0,
  8,
  109,
  0,
  8,
  45,
  0,
  9,
  187,
  0,
  8,
  13,
  0,
  8,
  141,
  0,
  8,
  77,
  0,
  9,
  251,
  80,
  7,
  3,
  0,
  8,
  83,
  0,
  8,
  19,
  85,
  8,
  195,
  83,
  7,
  35,
  0,
  8,
  115,
  0,
  8,
  51,
  0,
  9,
  199,
  81,
  7,
  11,
  0,
  8,
  99,
  0,
  8,
  35,
  0,
  9,
  167,
  0,
  8,
  3,
  0,
  8,
  131,
  0,
  8,
  67,
  0,
  9,
  231,
  80,
  7,
  7,
  0,
  8,
  91,
  0,
  8,
  27,
  0,
  9,
  151,
  84,
  7,
  67,
  0,
  8,
  123,
  0,
  8,
  59,
  0,
  9,
  215,
  82,
  7,
  19,
  0,
  8,
  107,
  0,
  8,
  43,
  0,
  9,
  183,
  0,
  8,
  11,
  0,
  8,
  139,
  0,
  8,
  75,
  0,
  9,
  247,
  80,
  7,
  5,
  0,
  8,
  87,
  0,
  8,
  23,
  192,
  8,
  0,
  83,
  7,
  51,
  0,
  8,
  119,
  0,
  8,
  55,
  0,
  9,
  207,
  81,
  7,
  15,
  0,
  8,
  103,
  0,
  8,
  39,
  0,
  9,
  175,
  0,
  8,
  7,
  0,
  8,
  135,
  0,
  8,
  71,
  0,
  9,
  239,
  80,
  7,
  9,
  0,
  8,
  95,
  0,
  8,
  31,
  0,
  9,
  159,
  84,
  7,
  99,
  0,
  8,
  127,
  0,
  8,
  63,
  0,
  9,
  223,
  82,
  7,
  27,
  0,
  8,
  111,
  0,
  8,
  47,
  0,
  9,
  191,
  0,
  8,
  15,
  0,
  8,
  143,
  0,
  8,
  79,
  0,
  9,
  255
];
var fixed_td = [
  80,
  5,
  1,
  87,
  5,
  257,
  83,
  5,
  17,
  91,
  5,
  4097,
  81,
  5,
  5,
  89,
  5,
  1025,
  85,
  5,
  65,
  93,
  5,
  16385,
  80,
  5,
  3,
  88,
  5,
  513,
  84,
  5,
  33,
  92,
  5,
  8193,
  82,
  5,
  9,
  90,
  5,
  2049,
  86,
  5,
  129,
  192,
  5,
  24577,
  80,
  5,
  2,
  87,
  5,
  385,
  83,
  5,
  25,
  91,
  5,
  6145,
  81,
  5,
  7,
  89,
  5,
  1537,
  85,
  5,
  97,
  93,
  5,
  24577,
  80,
  5,
  4,
  88,
  5,
  769,
  84,
  5,
  49,
  92,
  5,
  12289,
  82,
  5,
  13,
  90,
  5,
  3073,
  86,
  5,
  193,
  192,
  5,
  24577
];
var cplens = [
  // Copy lengths for literal codes 257..285
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  13,
  15,
  17,
  19,
  23,
  27,
  31,
  35,
  43,
  51,
  59,
  67,
  83,
  99,
  115,
  131,
  163,
  195,
  227,
  258,
  0,
  0
];
var cplext = [
  // Extra bits for literal codes 257..285
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  112,
  112
  // 112==invalid
];
var cpdist = [
  // Copy offsets for distance codes 0..29
  1,
  2,
  3,
  4,
  5,
  7,
  9,
  13,
  17,
  25,
  33,
  49,
  65,
  97,
  129,
  193,
  257,
  385,
  513,
  769,
  1025,
  1537,
  2049,
  3073,
  4097,
  6145,
  8193,
  12289,
  16385,
  24577
];
var cpdext = [
  // Extra bits for distance codes
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13
];
var BMAX = 15;
function InfTree() {
  const that = this;
  let hn;
  let v2;
  let c;
  let r2;
  let u2;
  let x;
  function huft_build(b2, bindex, n2, s2, d2, e3, t2, m, hp, hn2, v3) {
    let a2;
    let f2;
    let g2;
    let h2;
    let i2;
    let j;
    let k;
    let l2;
    let mask;
    let p2;
    let q;
    let w2;
    let xp;
    let y2;
    let z;
    p2 = 0;
    i2 = n2;
    do {
      c[b2[bindex + p2]]++;
      p2++;
      i2--;
    } while (i2 !== 0);
    if (c[0] == n2) {
      t2[0] = -1;
      m[0] = 0;
      return Z_OK2;
    }
    l2 = m[0];
    for (j = 1; j <= BMAX; j++)
      if (c[j] !== 0)
        break;
    k = j;
    if (l2 < j) {
      l2 = j;
    }
    for (i2 = BMAX; i2 !== 0; i2--) {
      if (c[i2] !== 0)
        break;
    }
    g2 = i2;
    if (l2 > i2) {
      l2 = i2;
    }
    m[0] = l2;
    for (y2 = 1 << j; j < i2; j++, y2 <<= 1) {
      if ((y2 -= c[j]) < 0) {
        return Z_DATA_ERROR2;
      }
    }
    if ((y2 -= c[i2]) < 0) {
      return Z_DATA_ERROR2;
    }
    c[i2] += y2;
    x[1] = j = 0;
    p2 = 1;
    xp = 2;
    while (--i2 !== 0) {
      x[xp] = j += c[p2];
      xp++;
      p2++;
    }
    i2 = 0;
    p2 = 0;
    do {
      if ((j = b2[bindex + p2]) !== 0) {
        v3[x[j]++] = i2;
      }
      p2++;
    } while (++i2 < n2);
    n2 = x[g2];
    x[0] = i2 = 0;
    p2 = 0;
    h2 = -1;
    w2 = -l2;
    u2[0] = 0;
    q = 0;
    z = 0;
    for (; k <= g2; k++) {
      a2 = c[k];
      while (a2-- !== 0) {
        while (k > w2 + l2) {
          h2++;
          w2 += l2;
          z = g2 - w2;
          z = z > l2 ? l2 : z;
          if ((f2 = 1 << (j = k - w2)) > a2 + 1) {
            f2 -= a2 + 1;
            xp = k;
            if (j < z) {
              while (++j < z) {
                if ((f2 <<= 1) <= c[++xp])
                  break;
                f2 -= c[xp];
              }
            }
          }
          z = 1 << j;
          if (hn2[0] + z > MANY) {
            return Z_DATA_ERROR2;
          }
          u2[h2] = q = /* hp+ */
          hn2[0];
          hn2[0] += z;
          if (h2 !== 0) {
            x[h2] = i2;
            r2[0] = /* (byte) */
            j;
            r2[1] = /* (byte) */
            l2;
            j = i2 >>> w2 - l2;
            r2[2] = /* (int) */
            q - u2[h2 - 1] - j;
            hp.set(r2, (u2[h2 - 1] + j) * 3);
          } else {
            t2[0] = q;
          }
        }
        r2[1] = /* (byte) */
        k - w2;
        if (p2 >= n2) {
          r2[0] = 128 + 64;
        } else if (v3[p2] < s2) {
          r2[0] = /* (byte) */
          v3[p2] < 256 ? 0 : 32 + 64;
          r2[2] = v3[p2++];
        } else {
          r2[0] = /* (byte) */
          e3[v3[p2] - s2] + 16 + 64;
          r2[2] = d2[v3[p2++] - s2];
        }
        f2 = 1 << k - w2;
        for (j = i2 >>> w2; j < z; j += f2) {
          hp.set(r2, (q + j) * 3);
        }
        for (j = 1 << k - 1; (i2 & j) !== 0; j >>>= 1) {
          i2 ^= j;
        }
        i2 ^= j;
        mask = (1 << w2) - 1;
        while ((i2 & mask) != x[h2]) {
          h2--;
          w2 -= l2;
          mask = (1 << w2) - 1;
        }
      }
    }
    return y2 !== 0 && g2 != 1 ? Z_BUF_ERROR2 : Z_OK2;
  }
  function initWorkArea(vsize) {
    let i2;
    if (!hn) {
      hn = [];
      v2 = [];
      c = new Int32Array(BMAX + 1);
      r2 = [];
      u2 = new Int32Array(BMAX);
      x = new Int32Array(BMAX + 1);
    }
    if (v2.length < vsize) {
      v2 = [];
    }
    for (i2 = 0; i2 < vsize; i2++) {
      v2[i2] = 0;
    }
    for (i2 = 0; i2 < BMAX + 1; i2++) {
      c[i2] = 0;
    }
    for (i2 = 0; i2 < 3; i2++) {
      r2[i2] = 0;
    }
    u2.set(c.subarray(0, BMAX), 0);
    x.set(c.subarray(0, BMAX + 1), 0);
  }
  that.inflate_trees_bits = function(c2, bb, tb, hp, z) {
    let result;
    initWorkArea(19);
    hn[0] = 0;
    result = huft_build(c2, 0, 19, 19, null, null, tb, bb, hp, hn, v2);
    if (result == Z_DATA_ERROR2) {
      z.msg = "oversubscribed dynamic bit lengths tree";
    } else if (result == Z_BUF_ERROR2 || bb[0] === 0) {
      z.msg = "incomplete dynamic bit lengths tree";
      result = Z_DATA_ERROR2;
    }
    return result;
  };
  that.inflate_trees_dynamic = function(nl, nd, c2, bl, bd, tl, td, hp, z) {
    let result;
    initWorkArea(288);
    hn[0] = 0;
    result = huft_build(c2, 0, nl, 257, cplens, cplext, tl, bl, hp, hn, v2);
    if (result != Z_OK2 || bl[0] === 0) {
      if (result == Z_DATA_ERROR2) {
        z.msg = "oversubscribed literal/length tree";
      } else if (result != Z_MEM_ERROR) {
        z.msg = "incomplete literal/length tree";
        result = Z_DATA_ERROR2;
      }
      return result;
    }
    initWorkArea(288);
    result = huft_build(c2, nl, nd, 0, cpdist, cpdext, td, bd, hp, hn, v2);
    if (result != Z_OK2 || bd[0] === 0 && nl > 257) {
      if (result == Z_DATA_ERROR2) {
        z.msg = "oversubscribed distance tree";
      } else if (result == Z_BUF_ERROR2) {
        z.msg = "incomplete distance tree";
        result = Z_DATA_ERROR2;
      } else if (result != Z_MEM_ERROR) {
        z.msg = "empty distance tree with lengths";
        result = Z_DATA_ERROR2;
      }
      return result;
    }
    return Z_OK2;
  };
}
InfTree.inflate_trees_fixed = function(bl, bd, tl, td) {
  bl[0] = fixed_bl;
  bd[0] = fixed_bd;
  tl[0] = fixed_tl;
  td[0] = fixed_td;
  return Z_OK2;
};
var START = 0;
var LEN = 1;
var LENEXT = 2;
var DIST = 3;
var DISTEXT = 4;
var COPY = 5;
var LIT = 6;
var WASH = 7;
var END = 8;
var BADCODE = 9;
function InfCodes() {
  const that = this;
  let mode2;
  let len = 0;
  let tree;
  let tree_index = 0;
  let need = 0;
  let lit = 0;
  let get = 0;
  let dist = 0;
  let lbits = 0;
  let dbits = 0;
  let ltree;
  let ltree_index = 0;
  let dtree;
  let dtree_index = 0;
  function inflate_fast(bl, bd, tl, tl_index, td, td_index, s2, z) {
    let t2;
    let tp;
    let tp_index;
    let e3;
    let b2;
    let k;
    let p2;
    let n2;
    let q;
    let m;
    let ml;
    let md;
    let c;
    let d2;
    let r2;
    let tp_index_t_3;
    p2 = z.next_in_index;
    n2 = z.avail_in;
    b2 = s2.bitb;
    k = s2.bitk;
    q = s2.write;
    m = q < s2.read ? s2.read - q - 1 : s2.end - q;
    ml = inflate_mask[bl];
    md = inflate_mask[bd];
    do {
      while (k < 20) {
        n2--;
        b2 |= (z.read_byte(p2++) & 255) << k;
        k += 8;
      }
      t2 = b2 & ml;
      tp = tl;
      tp_index = tl_index;
      tp_index_t_3 = (tp_index + t2) * 3;
      if ((e3 = tp[tp_index_t_3]) === 0) {
        b2 >>= tp[tp_index_t_3 + 1];
        k -= tp[tp_index_t_3 + 1];
        s2.win[q++] = /* (byte) */
        tp[tp_index_t_3 + 2];
        m--;
        continue;
      }
      do {
        b2 >>= tp[tp_index_t_3 + 1];
        k -= tp[tp_index_t_3 + 1];
        if ((e3 & 16) !== 0) {
          e3 &= 15;
          c = tp[tp_index_t_3 + 2] + /* (int) */
          (b2 & inflate_mask[e3]);
          b2 >>= e3;
          k -= e3;
          while (k < 15) {
            n2--;
            b2 |= (z.read_byte(p2++) & 255) << k;
            k += 8;
          }
          t2 = b2 & md;
          tp = td;
          tp_index = td_index;
          tp_index_t_3 = (tp_index + t2) * 3;
          e3 = tp[tp_index_t_3];
          do {
            b2 >>= tp[tp_index_t_3 + 1];
            k -= tp[tp_index_t_3 + 1];
            if ((e3 & 16) !== 0) {
              e3 &= 15;
              while (k < e3) {
                n2--;
                b2 |= (z.read_byte(p2++) & 255) << k;
                k += 8;
              }
              d2 = tp[tp_index_t_3 + 2] + (b2 & inflate_mask[e3]);
              b2 >>= e3;
              k -= e3;
              m -= c;
              if (q >= d2) {
                r2 = q - d2;
                if (q - r2 > 0 && 2 > q - r2) {
                  s2.win[q++] = s2.win[r2++];
                  s2.win[q++] = s2.win[r2++];
                  c -= 2;
                } else {
                  s2.win.set(s2.win.subarray(r2, r2 + 2), q);
                  q += 2;
                  r2 += 2;
                  c -= 2;
                }
              } else {
                r2 = q - d2;
                do {
                  r2 += s2.end;
                } while (r2 < 0);
                e3 = s2.end - r2;
                if (c > e3) {
                  c -= e3;
                  if (q - r2 > 0 && e3 > q - r2) {
                    do {
                      s2.win[q++] = s2.win[r2++];
                    } while (--e3 !== 0);
                  } else {
                    s2.win.set(s2.win.subarray(r2, r2 + e3), q);
                    q += e3;
                    r2 += e3;
                    e3 = 0;
                  }
                  r2 = 0;
                }
              }
              if (q - r2 > 0 && c > q - r2) {
                do {
                  s2.win[q++] = s2.win[r2++];
                } while (--c !== 0);
              } else {
                s2.win.set(s2.win.subarray(r2, r2 + c), q);
                q += c;
                r2 += c;
                c = 0;
              }
              break;
            } else if ((e3 & 64) === 0) {
              t2 += tp[tp_index_t_3 + 2];
              t2 += b2 & inflate_mask[e3];
              tp_index_t_3 = (tp_index + t2) * 3;
              e3 = tp[tp_index_t_3];
            } else {
              z.msg = "invalid distance code";
              c = z.avail_in - n2;
              c = k >> 3 < c ? k >> 3 : c;
              n2 += c;
              p2 -= c;
              k -= c << 3;
              s2.bitb = b2;
              s2.bitk = k;
              z.avail_in = n2;
              z.total_in += p2 - z.next_in_index;
              z.next_in_index = p2;
              s2.write = q;
              return Z_DATA_ERROR2;
            }
          } while (true);
          break;
        }
        if ((e3 & 64) === 0) {
          t2 += tp[tp_index_t_3 + 2];
          t2 += b2 & inflate_mask[e3];
          tp_index_t_3 = (tp_index + t2) * 3;
          if ((e3 = tp[tp_index_t_3]) === 0) {
            b2 >>= tp[tp_index_t_3 + 1];
            k -= tp[tp_index_t_3 + 1];
            s2.win[q++] = /* (byte) */
            tp[tp_index_t_3 + 2];
            m--;
            break;
          }
        } else if ((e3 & 32) !== 0) {
          c = z.avail_in - n2;
          c = k >> 3 < c ? k >> 3 : c;
          n2 += c;
          p2 -= c;
          k -= c << 3;
          s2.bitb = b2;
          s2.bitk = k;
          z.avail_in = n2;
          z.total_in += p2 - z.next_in_index;
          z.next_in_index = p2;
          s2.write = q;
          return Z_STREAM_END2;
        } else {
          z.msg = "invalid literal/length code";
          c = z.avail_in - n2;
          c = k >> 3 < c ? k >> 3 : c;
          n2 += c;
          p2 -= c;
          k -= c << 3;
          s2.bitb = b2;
          s2.bitk = k;
          z.avail_in = n2;
          z.total_in += p2 - z.next_in_index;
          z.next_in_index = p2;
          s2.write = q;
          return Z_DATA_ERROR2;
        }
      } while (true);
    } while (m >= 258 && n2 >= 10);
    c = z.avail_in - n2;
    c = k >> 3 < c ? k >> 3 : c;
    n2 += c;
    p2 -= c;
    k -= c << 3;
    s2.bitb = b2;
    s2.bitk = k;
    z.avail_in = n2;
    z.total_in += p2 - z.next_in_index;
    z.next_in_index = p2;
    s2.write = q;
    return Z_OK2;
  }
  that.init = function(bl, bd, tl, tl_index, td, td_index) {
    mode2 = START;
    lbits = /* (byte) */
    bl;
    dbits = /* (byte) */
    bd;
    ltree = tl;
    ltree_index = tl_index;
    dtree = td;
    dtree_index = td_index;
    tree = null;
  };
  that.proc = function(s2, z, r2) {
    let j;
    let tindex;
    let e3;
    let b2 = 0;
    let k = 0;
    let p2 = 0;
    let n2;
    let q;
    let m;
    let f2;
    p2 = z.next_in_index;
    n2 = z.avail_in;
    b2 = s2.bitb;
    k = s2.bitk;
    q = s2.write;
    m = q < s2.read ? s2.read - q - 1 : s2.end - q;
    while (true) {
      switch (mode2) {
        case START:
          if (m >= 258 && n2 >= 10) {
            s2.bitb = b2;
            s2.bitk = k;
            z.avail_in = n2;
            z.total_in += p2 - z.next_in_index;
            z.next_in_index = p2;
            s2.write = q;
            r2 = inflate_fast(lbits, dbits, ltree, ltree_index, dtree, dtree_index, s2, z);
            p2 = z.next_in_index;
            n2 = z.avail_in;
            b2 = s2.bitb;
            k = s2.bitk;
            q = s2.write;
            m = q < s2.read ? s2.read - q - 1 : s2.end - q;
            if (r2 != Z_OK2) {
              mode2 = r2 == Z_STREAM_END2 ? WASH : BADCODE;
              break;
            }
          }
          need = lbits;
          tree = ltree;
          tree_index = ltree_index;
          mode2 = LEN;
        case LEN:
          j = need;
          while (k < j) {
            if (n2 !== 0)
              r2 = Z_OK2;
            else {
              s2.bitb = b2;
              s2.bitk = k;
              z.avail_in = n2;
              z.total_in += p2 - z.next_in_index;
              z.next_in_index = p2;
              s2.write = q;
              return s2.inflate_flush(z, r2);
            }
            n2--;
            b2 |= (z.read_byte(p2++) & 255) << k;
            k += 8;
          }
          tindex = (tree_index + (b2 & inflate_mask[j])) * 3;
          b2 >>>= tree[tindex + 1];
          k -= tree[tindex + 1];
          e3 = tree[tindex];
          if (e3 === 0) {
            lit = tree[tindex + 2];
            mode2 = LIT;
            break;
          }
          if ((e3 & 16) !== 0) {
            get = e3 & 15;
            len = tree[tindex + 2];
            mode2 = LENEXT;
            break;
          }
          if ((e3 & 64) === 0) {
            need = e3;
            tree_index = tindex / 3 + tree[tindex + 2];
            break;
          }
          if ((e3 & 32) !== 0) {
            mode2 = WASH;
            break;
          }
          mode2 = BADCODE;
          z.msg = "invalid literal/length code";
          r2 = Z_DATA_ERROR2;
          s2.bitb = b2;
          s2.bitk = k;
          z.avail_in = n2;
          z.total_in += p2 - z.next_in_index;
          z.next_in_index = p2;
          s2.write = q;
          return s2.inflate_flush(z, r2);
        case LENEXT:
          j = get;
          while (k < j) {
            if (n2 !== 0)
              r2 = Z_OK2;
            else {
              s2.bitb = b2;
              s2.bitk = k;
              z.avail_in = n2;
              z.total_in += p2 - z.next_in_index;
              z.next_in_index = p2;
              s2.write = q;
              return s2.inflate_flush(z, r2);
            }
            n2--;
            b2 |= (z.read_byte(p2++) & 255) << k;
            k += 8;
          }
          len += b2 & inflate_mask[j];
          b2 >>= j;
          k -= j;
          need = dbits;
          tree = dtree;
          tree_index = dtree_index;
          mode2 = DIST;
        case DIST:
          j = need;
          while (k < j) {
            if (n2 !== 0)
              r2 = Z_OK2;
            else {
              s2.bitb = b2;
              s2.bitk = k;
              z.avail_in = n2;
              z.total_in += p2 - z.next_in_index;
              z.next_in_index = p2;
              s2.write = q;
              return s2.inflate_flush(z, r2);
            }
            n2--;
            b2 |= (z.read_byte(p2++) & 255) << k;
            k += 8;
          }
          tindex = (tree_index + (b2 & inflate_mask[j])) * 3;
          b2 >>= tree[tindex + 1];
          k -= tree[tindex + 1];
          e3 = tree[tindex];
          if ((e3 & 16) !== 0) {
            get = e3 & 15;
            dist = tree[tindex + 2];
            mode2 = DISTEXT;
            break;
          }
          if ((e3 & 64) === 0) {
            need = e3;
            tree_index = tindex / 3 + tree[tindex + 2];
            break;
          }
          mode2 = BADCODE;
          z.msg = "invalid distance code";
          r2 = Z_DATA_ERROR2;
          s2.bitb = b2;
          s2.bitk = k;
          z.avail_in = n2;
          z.total_in += p2 - z.next_in_index;
          z.next_in_index = p2;
          s2.write = q;
          return s2.inflate_flush(z, r2);
        case DISTEXT:
          j = get;
          while (k < j) {
            if (n2 !== 0)
              r2 = Z_OK2;
            else {
              s2.bitb = b2;
              s2.bitk = k;
              z.avail_in = n2;
              z.total_in += p2 - z.next_in_index;
              z.next_in_index = p2;
              s2.write = q;
              return s2.inflate_flush(z, r2);
            }
            n2--;
            b2 |= (z.read_byte(p2++) & 255) << k;
            k += 8;
          }
          dist += b2 & inflate_mask[j];
          b2 >>= j;
          k -= j;
          mode2 = COPY;
        case COPY:
          f2 = q - dist;
          while (f2 < 0) {
            f2 += s2.end;
          }
          while (len !== 0) {
            if (m === 0) {
              if (q == s2.end && s2.read !== 0) {
                q = 0;
                m = q < s2.read ? s2.read - q - 1 : s2.end - q;
              }
              if (m === 0) {
                s2.write = q;
                r2 = s2.inflate_flush(z, r2);
                q = s2.write;
                m = q < s2.read ? s2.read - q - 1 : s2.end - q;
                if (q == s2.end && s2.read !== 0) {
                  q = 0;
                  m = q < s2.read ? s2.read - q - 1 : s2.end - q;
                }
                if (m === 0) {
                  s2.bitb = b2;
                  s2.bitk = k;
                  z.avail_in = n2;
                  z.total_in += p2 - z.next_in_index;
                  z.next_in_index = p2;
                  s2.write = q;
                  return s2.inflate_flush(z, r2);
                }
              }
            }
            s2.win[q++] = s2.win[f2++];
            m--;
            if (f2 == s2.end)
              f2 = 0;
            len--;
          }
          mode2 = START;
          break;
        case LIT:
          if (m === 0) {
            if (q == s2.end && s2.read !== 0) {
              q = 0;
              m = q < s2.read ? s2.read - q - 1 : s2.end - q;
            }
            if (m === 0) {
              s2.write = q;
              r2 = s2.inflate_flush(z, r2);
              q = s2.write;
              m = q < s2.read ? s2.read - q - 1 : s2.end - q;
              if (q == s2.end && s2.read !== 0) {
                q = 0;
                m = q < s2.read ? s2.read - q - 1 : s2.end - q;
              }
              if (m === 0) {
                s2.bitb = b2;
                s2.bitk = k;
                z.avail_in = n2;
                z.total_in += p2 - z.next_in_index;
                z.next_in_index = p2;
                s2.write = q;
                return s2.inflate_flush(z, r2);
              }
            }
          }
          r2 = Z_OK2;
          s2.win[q++] = /* (byte) */
          lit;
          m--;
          mode2 = START;
          break;
        case WASH:
          if (k > 7) {
            k -= 8;
            n2++;
            p2--;
          }
          s2.write = q;
          r2 = s2.inflate_flush(z, r2);
          q = s2.write;
          m = q < s2.read ? s2.read - q - 1 : s2.end - q;
          if (s2.read != s2.write) {
            s2.bitb = b2;
            s2.bitk = k;
            z.avail_in = n2;
            z.total_in += p2 - z.next_in_index;
            z.next_in_index = p2;
            s2.write = q;
            return s2.inflate_flush(z, r2);
          }
          mode2 = END;
        case END:
          r2 = Z_STREAM_END2;
          s2.bitb = b2;
          s2.bitk = k;
          z.avail_in = n2;
          z.total_in += p2 - z.next_in_index;
          z.next_in_index = p2;
          s2.write = q;
          return s2.inflate_flush(z, r2);
        case BADCODE:
          r2 = Z_DATA_ERROR2;
          s2.bitb = b2;
          s2.bitk = k;
          z.avail_in = n2;
          z.total_in += p2 - z.next_in_index;
          z.next_in_index = p2;
          s2.write = q;
          return s2.inflate_flush(z, r2);
        default:
          r2 = Z_STREAM_ERROR2;
          s2.bitb = b2;
          s2.bitk = k;
          z.avail_in = n2;
          z.total_in += p2 - z.next_in_index;
          z.next_in_index = p2;
          s2.write = q;
          return s2.inflate_flush(z, r2);
      }
    }
  };
  that.free = function() {
  };
}
var border = [
  // Order of the bit length code lengths
  16,
  17,
  18,
  0,
  8,
  7,
  9,
  6,
  10,
  5,
  11,
  4,
  12,
  3,
  13,
  2,
  14,
  1,
  15
];
var TYPE = 0;
var LENS = 1;
var STORED2 = 2;
var TABLE = 3;
var BTREE = 4;
var DTREE = 5;
var CODES = 6;
var DRY = 7;
var DONELOCKS = 8;
var BADBLOCKS = 9;
function InfBlocks(z, w2) {
  const that = this;
  let mode2 = TYPE;
  let left = 0;
  let table3 = 0;
  let index = 0;
  let blens;
  const bb = [0];
  const tb = [0];
  const codes = new InfCodes();
  let last = 0;
  let hufts = new Int32Array(MANY * 3);
  const check = 0;
  const inftree = new InfTree();
  that.bitk = 0;
  that.bitb = 0;
  that.win = new Uint8Array(w2);
  that.end = w2;
  that.read = 0;
  that.write = 0;
  that.reset = function(z2, c) {
    if (c)
      c[0] = check;
    if (mode2 == CODES) {
      codes.free(z2);
    }
    mode2 = TYPE;
    that.bitk = 0;
    that.bitb = 0;
    that.read = that.write = 0;
  };
  that.reset(z, null);
  that.inflate_flush = function(z2, r2) {
    let n2;
    let p2;
    let q;
    p2 = z2.next_out_index;
    q = that.read;
    n2 = /* (int) */
    (q <= that.write ? that.write : that.end) - q;
    if (n2 > z2.avail_out)
      n2 = z2.avail_out;
    if (n2 !== 0 && r2 == Z_BUF_ERROR2)
      r2 = Z_OK2;
    z2.avail_out -= n2;
    z2.total_out += n2;
    z2.next_out.set(that.win.subarray(q, q + n2), p2);
    p2 += n2;
    q += n2;
    if (q == that.end) {
      q = 0;
      if (that.write == that.end)
        that.write = 0;
      n2 = that.write - q;
      if (n2 > z2.avail_out)
        n2 = z2.avail_out;
      if (n2 !== 0 && r2 == Z_BUF_ERROR2)
        r2 = Z_OK2;
      z2.avail_out -= n2;
      z2.total_out += n2;
      z2.next_out.set(that.win.subarray(q, q + n2), p2);
      p2 += n2;
      q += n2;
    }
    z2.next_out_index = p2;
    that.read = q;
    return r2;
  };
  that.proc = function(z2, r2) {
    let t2;
    let b2;
    let k;
    let p2;
    let n2;
    let q;
    let m;
    let i2;
    p2 = z2.next_in_index;
    n2 = z2.avail_in;
    b2 = that.bitb;
    k = that.bitk;
    q = that.write;
    m = /* (int) */
    q < that.read ? that.read - q - 1 : that.end - q;
    while (true) {
      let bl, bd, tl, td, bl_, bd_, tl_, td_;
      switch (mode2) {
        case TYPE:
          while (k < 3) {
            if (n2 !== 0) {
              r2 = Z_OK2;
            } else {
              that.bitb = b2;
              that.bitk = k;
              z2.avail_in = n2;
              z2.total_in += p2 - z2.next_in_index;
              z2.next_in_index = p2;
              that.write = q;
              return that.inflate_flush(z2, r2);
            }
            n2--;
            b2 |= (z2.read_byte(p2++) & 255) << k;
            k += 8;
          }
          t2 = /* (int) */
          b2 & 7;
          last = t2 & 1;
          switch (t2 >>> 1) {
            case 0:
              b2 >>>= 3;
              k -= 3;
              t2 = k & 7;
              b2 >>>= t2;
              k -= t2;
              mode2 = LENS;
              break;
            case 1:
              bl = [];
              bd = [];
              tl = [[]];
              td = [[]];
              InfTree.inflate_trees_fixed(bl, bd, tl, td);
              codes.init(bl[0], bd[0], tl[0], 0, td[0], 0);
              b2 >>>= 3;
              k -= 3;
              mode2 = CODES;
              break;
            case 2:
              b2 >>>= 3;
              k -= 3;
              mode2 = TABLE;
              break;
            case 3:
              b2 >>>= 3;
              k -= 3;
              mode2 = BADBLOCKS;
              z2.msg = "invalid block type";
              r2 = Z_DATA_ERROR2;
              that.bitb = b2;
              that.bitk = k;
              z2.avail_in = n2;
              z2.total_in += p2 - z2.next_in_index;
              z2.next_in_index = p2;
              that.write = q;
              return that.inflate_flush(z2, r2);
          }
          break;
        case LENS:
          while (k < 32) {
            if (n2 !== 0) {
              r2 = Z_OK2;
            } else {
              that.bitb = b2;
              that.bitk = k;
              z2.avail_in = n2;
              z2.total_in += p2 - z2.next_in_index;
              z2.next_in_index = p2;
              that.write = q;
              return that.inflate_flush(z2, r2);
            }
            n2--;
            b2 |= (z2.read_byte(p2++) & 255) << k;
            k += 8;
          }
          if ((~b2 >>> 16 & 65535) != (b2 & 65535)) {
            mode2 = BADBLOCKS;
            z2.msg = "invalid stored block lengths";
            r2 = Z_DATA_ERROR2;
            that.bitb = b2;
            that.bitk = k;
            z2.avail_in = n2;
            z2.total_in += p2 - z2.next_in_index;
            z2.next_in_index = p2;
            that.write = q;
            return that.inflate_flush(z2, r2);
          }
          left = b2 & 65535;
          b2 = k = 0;
          mode2 = left !== 0 ? STORED2 : last !== 0 ? DRY : TYPE;
          break;
        case STORED2:
          if (n2 === 0) {
            that.bitb = b2;
            that.bitk = k;
            z2.avail_in = n2;
            z2.total_in += p2 - z2.next_in_index;
            z2.next_in_index = p2;
            that.write = q;
            return that.inflate_flush(z2, r2);
          }
          if (m === 0) {
            if (q == that.end && that.read !== 0) {
              q = 0;
              m = /* (int) */
              q < that.read ? that.read - q - 1 : that.end - q;
            }
            if (m === 0) {
              that.write = q;
              r2 = that.inflate_flush(z2, r2);
              q = that.write;
              m = /* (int) */
              q < that.read ? that.read - q - 1 : that.end - q;
              if (q == that.end && that.read !== 0) {
                q = 0;
                m = /* (int) */
                q < that.read ? that.read - q - 1 : that.end - q;
              }
              if (m === 0) {
                that.bitb = b2;
                that.bitk = k;
                z2.avail_in = n2;
                z2.total_in += p2 - z2.next_in_index;
                z2.next_in_index = p2;
                that.write = q;
                return that.inflate_flush(z2, r2);
              }
            }
          }
          r2 = Z_OK2;
          t2 = left;
          if (t2 > n2)
            t2 = n2;
          if (t2 > m)
            t2 = m;
          that.win.set(z2.read_buf(p2, t2), q);
          p2 += t2;
          n2 -= t2;
          q += t2;
          m -= t2;
          if ((left -= t2) !== 0)
            break;
          mode2 = last !== 0 ? DRY : TYPE;
          break;
        case TABLE:
          while (k < 14) {
            if (n2 !== 0) {
              r2 = Z_OK2;
            } else {
              that.bitb = b2;
              that.bitk = k;
              z2.avail_in = n2;
              z2.total_in += p2 - z2.next_in_index;
              z2.next_in_index = p2;
              that.write = q;
              return that.inflate_flush(z2, r2);
            }
            n2--;
            b2 |= (z2.read_byte(p2++) & 255) << k;
            k += 8;
          }
          table3 = t2 = b2 & 16383;
          if ((t2 & 31) > 29 || (t2 >> 5 & 31) > 29) {
            mode2 = BADBLOCKS;
            z2.msg = "too many length or distance symbols";
            r2 = Z_DATA_ERROR2;
            that.bitb = b2;
            that.bitk = k;
            z2.avail_in = n2;
            z2.total_in += p2 - z2.next_in_index;
            z2.next_in_index = p2;
            that.write = q;
            return that.inflate_flush(z2, r2);
          }
          t2 = 258 + (t2 & 31) + (t2 >> 5 & 31);
          if (!blens || blens.length < t2) {
            blens = [];
          } else {
            for (i2 = 0; i2 < t2; i2++) {
              blens[i2] = 0;
            }
          }
          b2 >>>= 14;
          k -= 14;
          index = 0;
          mode2 = BTREE;
        case BTREE:
          while (index < 4 + (table3 >>> 10)) {
            while (k < 3) {
              if (n2 !== 0) {
                r2 = Z_OK2;
              } else {
                that.bitb = b2;
                that.bitk = k;
                z2.avail_in = n2;
                z2.total_in += p2 - z2.next_in_index;
                z2.next_in_index = p2;
                that.write = q;
                return that.inflate_flush(z2, r2);
              }
              n2--;
              b2 |= (z2.read_byte(p2++) & 255) << k;
              k += 8;
            }
            blens[border[index++]] = b2 & 7;
            b2 >>>= 3;
            k -= 3;
          }
          while (index < 19) {
            blens[border[index++]] = 0;
          }
          bb[0] = 7;
          t2 = inftree.inflate_trees_bits(blens, bb, tb, hufts, z2);
          if (t2 != Z_OK2) {
            r2 = t2;
            if (r2 == Z_DATA_ERROR2) {
              blens = null;
              mode2 = BADBLOCKS;
            }
            that.bitb = b2;
            that.bitk = k;
            z2.avail_in = n2;
            z2.total_in += p2 - z2.next_in_index;
            z2.next_in_index = p2;
            that.write = q;
            return that.inflate_flush(z2, r2);
          }
          index = 0;
          mode2 = DTREE;
        case DTREE:
          while (true) {
            t2 = table3;
            if (index >= 258 + (t2 & 31) + (t2 >> 5 & 31)) {
              break;
            }
            let j, c;
            t2 = bb[0];
            while (k < t2) {
              if (n2 !== 0) {
                r2 = Z_OK2;
              } else {
                that.bitb = b2;
                that.bitk = k;
                z2.avail_in = n2;
                z2.total_in += p2 - z2.next_in_index;
                z2.next_in_index = p2;
                that.write = q;
                return that.inflate_flush(z2, r2);
              }
              n2--;
              b2 |= (z2.read_byte(p2++) & 255) << k;
              k += 8;
            }
            t2 = hufts[(tb[0] + (b2 & inflate_mask[t2])) * 3 + 1];
            c = hufts[(tb[0] + (b2 & inflate_mask[t2])) * 3 + 2];
            if (c < 16) {
              b2 >>>= t2;
              k -= t2;
              blens[index++] = c;
            } else {
              i2 = c == 18 ? 7 : c - 14;
              j = c == 18 ? 11 : 3;
              while (k < t2 + i2) {
                if (n2 !== 0) {
                  r2 = Z_OK2;
                } else {
                  that.bitb = b2;
                  that.bitk = k;
                  z2.avail_in = n2;
                  z2.total_in += p2 - z2.next_in_index;
                  z2.next_in_index = p2;
                  that.write = q;
                  return that.inflate_flush(z2, r2);
                }
                n2--;
                b2 |= (z2.read_byte(p2++) & 255) << k;
                k += 8;
              }
              b2 >>>= t2;
              k -= t2;
              j += b2 & inflate_mask[i2];
              b2 >>>= i2;
              k -= i2;
              i2 = index;
              t2 = table3;
              if (i2 + j > 258 + (t2 & 31) + (t2 >> 5 & 31) || c == 16 && i2 < 1) {
                blens = null;
                mode2 = BADBLOCKS;
                z2.msg = "invalid bit length repeat";
                r2 = Z_DATA_ERROR2;
                that.bitb = b2;
                that.bitk = k;
                z2.avail_in = n2;
                z2.total_in += p2 - z2.next_in_index;
                z2.next_in_index = p2;
                that.write = q;
                return that.inflate_flush(z2, r2);
              }
              c = c == 16 ? blens[i2 - 1] : 0;
              do {
                blens[i2++] = c;
              } while (--j !== 0);
              index = i2;
            }
          }
          tb[0] = -1;
          bl_ = [];
          bd_ = [];
          tl_ = [];
          td_ = [];
          bl_[0] = 9;
          bd_[0] = 6;
          t2 = table3;
          t2 = inftree.inflate_trees_dynamic(257 + (t2 & 31), 1 + (t2 >> 5 & 31), blens, bl_, bd_, tl_, td_, hufts, z2);
          if (t2 != Z_OK2) {
            if (t2 == Z_DATA_ERROR2) {
              blens = null;
              mode2 = BADBLOCKS;
            }
            r2 = t2;
            that.bitb = b2;
            that.bitk = k;
            z2.avail_in = n2;
            z2.total_in += p2 - z2.next_in_index;
            z2.next_in_index = p2;
            that.write = q;
            return that.inflate_flush(z2, r2);
          }
          codes.init(bl_[0], bd_[0], hufts, tl_[0], hufts, td_[0]);
          mode2 = CODES;
        case CODES:
          that.bitb = b2;
          that.bitk = k;
          z2.avail_in = n2;
          z2.total_in += p2 - z2.next_in_index;
          z2.next_in_index = p2;
          that.write = q;
          if ((r2 = codes.proc(that, z2, r2)) != Z_STREAM_END2) {
            return that.inflate_flush(z2, r2);
          }
          r2 = Z_OK2;
          codes.free(z2);
          p2 = z2.next_in_index;
          n2 = z2.avail_in;
          b2 = that.bitb;
          k = that.bitk;
          q = that.write;
          m = /* (int) */
          q < that.read ? that.read - q - 1 : that.end - q;
          if (last === 0) {
            mode2 = TYPE;
            break;
          }
          mode2 = DRY;
        case DRY:
          that.write = q;
          r2 = that.inflate_flush(z2, r2);
          q = that.write;
          m = /* (int) */
          q < that.read ? that.read - q - 1 : that.end - q;
          if (that.read != that.write) {
            that.bitb = b2;
            that.bitk = k;
            z2.avail_in = n2;
            z2.total_in += p2 - z2.next_in_index;
            z2.next_in_index = p2;
            that.write = q;
            return that.inflate_flush(z2, r2);
          }
          mode2 = DONELOCKS;
        case DONELOCKS:
          r2 = Z_STREAM_END2;
          that.bitb = b2;
          that.bitk = k;
          z2.avail_in = n2;
          z2.total_in += p2 - z2.next_in_index;
          z2.next_in_index = p2;
          that.write = q;
          return that.inflate_flush(z2, r2);
        case BADBLOCKS:
          r2 = Z_DATA_ERROR2;
          that.bitb = b2;
          that.bitk = k;
          z2.avail_in = n2;
          z2.total_in += p2 - z2.next_in_index;
          z2.next_in_index = p2;
          that.write = q;
          return that.inflate_flush(z2, r2);
        default:
          r2 = Z_STREAM_ERROR2;
          that.bitb = b2;
          that.bitk = k;
          z2.avail_in = n2;
          z2.total_in += p2 - z2.next_in_index;
          z2.next_in_index = p2;
          that.write = q;
          return that.inflate_flush(z2, r2);
      }
    }
  };
  that.free = function(z2) {
    that.reset(z2, null);
    that.win = null;
    hufts = null;
  };
  that.set_dictionary = function(d2, start, n2) {
    that.win.set(d2.subarray(start, start + n2), 0);
    that.read = that.write = n2;
  };
  that.sync_point = function() {
    return mode2 == LENS ? 1 : 0;
  };
}
var PRESET_DICT2 = 32;
var Z_DEFLATED2 = 8;
var METHOD = 0;
var FLAG = 1;
var DICT4 = 2;
var DICT3 = 3;
var DICT2 = 4;
var DICT1 = 5;
var DICT0 = 6;
var BLOCKS = 7;
var DONE = 12;
var BAD = 13;
var mark = [0, 0, 255, 255];
function Inflate() {
  const that = this;
  that.mode = 0;
  that.method = 0;
  that.was = [0];
  that.need = 0;
  that.marker = 0;
  that.wbits = 0;
  function inflateReset(z) {
    if (!z || !z.istate)
      return Z_STREAM_ERROR2;
    z.total_in = z.total_out = 0;
    z.msg = null;
    z.istate.mode = BLOCKS;
    z.istate.blocks.reset(z, null);
    return Z_OK2;
  }
  that.inflateEnd = function(z) {
    if (that.blocks)
      that.blocks.free(z);
    that.blocks = null;
    return Z_OK2;
  };
  that.inflateInit = function(z, w2) {
    z.msg = null;
    that.blocks = null;
    if (w2 < 8 || w2 > 15) {
      that.inflateEnd(z);
      return Z_STREAM_ERROR2;
    }
    that.wbits = w2;
    z.istate.blocks = new InfBlocks(z, 1 << w2);
    inflateReset(z);
    return Z_OK2;
  };
  that.inflate = function(z, f2) {
    let r2;
    let b2;
    if (!z || !z.istate || !z.next_in)
      return Z_STREAM_ERROR2;
    const istate = z.istate;
    f2 = f2 == Z_FINISH2 ? Z_BUF_ERROR2 : Z_OK2;
    r2 = Z_BUF_ERROR2;
    while (true) {
      switch (istate.mode) {
        case METHOD:
          if (z.avail_in === 0)
            return r2;
          r2 = f2;
          z.avail_in--;
          z.total_in++;
          if (((istate.method = z.read_byte(z.next_in_index++)) & 15) != Z_DEFLATED2) {
            istate.mode = BAD;
            z.msg = "unknown compression method";
            istate.marker = 5;
            break;
          }
          if ((istate.method >> 4) + 8 > istate.wbits) {
            istate.mode = BAD;
            z.msg = "invalid win size";
            istate.marker = 5;
            break;
          }
          istate.mode = FLAG;
        case FLAG:
          if (z.avail_in === 0)
            return r2;
          r2 = f2;
          z.avail_in--;
          z.total_in++;
          b2 = z.read_byte(z.next_in_index++) & 255;
          if (((istate.method << 8) + b2) % 31 !== 0) {
            istate.mode = BAD;
            z.msg = "incorrect header check";
            istate.marker = 5;
            break;
          }
          if ((b2 & PRESET_DICT2) === 0) {
            istate.mode = BLOCKS;
            break;
          }
          istate.mode = DICT4;
        case DICT4:
          if (z.avail_in === 0)
            return r2;
          r2 = f2;
          z.avail_in--;
          z.total_in++;
          istate.need = (z.read_byte(z.next_in_index++) & 255) << 24 & 4278190080;
          istate.mode = DICT3;
        case DICT3:
          if (z.avail_in === 0)
            return r2;
          r2 = f2;
          z.avail_in--;
          z.total_in++;
          istate.need += (z.read_byte(z.next_in_index++) & 255) << 16 & 16711680;
          istate.mode = DICT2;
        case DICT2:
          if (z.avail_in === 0)
            return r2;
          r2 = f2;
          z.avail_in--;
          z.total_in++;
          istate.need += (z.read_byte(z.next_in_index++) & 255) << 8 & 65280;
          istate.mode = DICT1;
        case DICT1:
          if (z.avail_in === 0)
            return r2;
          r2 = f2;
          z.avail_in--;
          z.total_in++;
          istate.need += z.read_byte(z.next_in_index++) & 255;
          istate.mode = DICT0;
          return Z_NEED_DICT2;
        case DICT0:
          istate.mode = BAD;
          z.msg = "need dictionary";
          istate.marker = 0;
          return Z_STREAM_ERROR2;
        case BLOCKS:
          r2 = istate.blocks.proc(z, r2);
          if (r2 == Z_DATA_ERROR2) {
            istate.mode = BAD;
            istate.marker = 0;
            break;
          }
          if (r2 == Z_OK2) {
            r2 = f2;
          }
          if (r2 != Z_STREAM_END2) {
            return r2;
          }
          r2 = f2;
          istate.blocks.reset(z, istate.was);
          istate.mode = DONE;
        case DONE:
          z.avail_in = 0;
          return Z_STREAM_END2;
        case BAD:
          return Z_DATA_ERROR2;
        default:
          return Z_STREAM_ERROR2;
      }
    }
  };
  that.inflateSetDictionary = function(z, dictionary, dictLength) {
    let index = 0, length = dictLength;
    if (!z || !z.istate || z.istate.mode != DICT0)
      return Z_STREAM_ERROR2;
    const istate = z.istate;
    if (length >= 1 << istate.wbits) {
      length = (1 << istate.wbits) - 1;
      index = dictLength - length;
    }
    istate.blocks.set_dictionary(dictionary, index, length);
    istate.mode = BLOCKS;
    return Z_OK2;
  };
  that.inflateSync = function(z) {
    let n2;
    let p2;
    let m;
    let r2, w2;
    if (!z || !z.istate)
      return Z_STREAM_ERROR2;
    const istate = z.istate;
    if (istate.mode != BAD) {
      istate.mode = BAD;
      istate.marker = 0;
    }
    if ((n2 = z.avail_in) === 0)
      return Z_BUF_ERROR2;
    p2 = z.next_in_index;
    m = istate.marker;
    while (n2 !== 0 && m < 4) {
      if (z.read_byte(p2) == mark[m]) {
        m++;
      } else if (z.read_byte(p2) !== 0) {
        m = 0;
      } else {
        m = 4 - m;
      }
      p2++;
      n2--;
    }
    z.total_in += p2 - z.next_in_index;
    z.next_in_index = p2;
    z.avail_in = n2;
    istate.marker = m;
    if (m != 4) {
      return Z_DATA_ERROR2;
    }
    r2 = z.total_in;
    w2 = z.total_out;
    inflateReset(z);
    z.total_in = r2;
    z.total_out = w2;
    istate.mode = BLOCKS;
    return Z_OK2;
  };
  that.inflateSyncPoint = function(z) {
    if (!z || !z.istate || !z.istate.blocks)
      return Z_STREAM_ERROR2;
    return z.istate.blocks.sync_point();
  };
}
function ZStream2() {
}
ZStream2.prototype = {
  inflateInit(bits) {
    const that = this;
    that.istate = new Inflate();
    if (!bits)
      bits = MAX_BITS2;
    return that.istate.inflateInit(that, bits);
  },
  inflate(f2) {
    const that = this;
    if (!that.istate)
      return Z_STREAM_ERROR2;
    return that.istate.inflate(that, f2);
  },
  inflateEnd() {
    const that = this;
    if (!that.istate)
      return Z_STREAM_ERROR2;
    const ret = that.istate.inflateEnd(that);
    that.istate = null;
    return ret;
  },
  inflateSync() {
    const that = this;
    if (!that.istate)
      return Z_STREAM_ERROR2;
    return that.istate.inflateSync(that);
  },
  inflateSetDictionary(dictionary, dictLength) {
    const that = this;
    if (!that.istate)
      return Z_STREAM_ERROR2;
    return that.istate.inflateSetDictionary(that, dictionary, dictLength);
  },
  read_byte(start) {
    const that = this;
    return that.next_in[start];
  },
  read_buf(start, size) {
    const that = this;
    return that.next_in.subarray(start, start + size);
  }
};
function ZipInflate(options) {
  const that = this;
  const z = new ZStream2();
  const bufsize = options && options.chunkSize ? Math.floor(options.chunkSize * 2) : 128 * 1024;
  const flush = Z_NO_FLUSH2;
  const buf = new Uint8Array(bufsize);
  let nomoreinput = false;
  z.inflateInit();
  z.next_out = buf;
  that.append = function(data, onprogress) {
    const buffers = [];
    let err, array, lastIndex = 0, bufferIndex = 0, bufferSize = 0;
    if (data.length === 0)
      return;
    z.next_in_index = 0;
    z.next_in = data;
    z.avail_in = data.length;
    do {
      z.next_out_index = 0;
      z.avail_out = bufsize;
      if (z.avail_in === 0 && !nomoreinput) {
        z.next_in_index = 0;
        nomoreinput = true;
      }
      err = z.inflate(flush);
      if (nomoreinput && err === Z_BUF_ERROR2) {
        if (z.avail_in !== 0)
          throw new Error("inflating: bad input");
      } else if (err !== Z_OK2 && err !== Z_STREAM_END2)
        throw new Error("inflating: " + z.msg);
      if ((nomoreinput || err === Z_STREAM_END2) && z.avail_in === data.length)
        throw new Error("inflating: bad input");
      if (z.next_out_index)
        if (z.next_out_index === bufsize)
          buffers.push(new Uint8Array(buf));
        else
          buffers.push(buf.subarray(0, z.next_out_index));
      bufferSize += z.next_out_index;
      if (onprogress && z.next_in_index > 0 && z.next_in_index != lastIndex) {
        onprogress(z.next_in_index);
        lastIndex = z.next_in_index;
      }
    } while (z.avail_in > 0 || z.avail_out === 0);
    if (buffers.length > 1) {
      array = new Uint8Array(bufferSize);
      buffers.forEach(function(chunk) {
        array.set(chunk, bufferIndex);
        bufferIndex += chunk.length;
      });
    } else {
      array = buffers[0] ? new Uint8Array(buffers[0]) : new Uint8Array();
    }
    return array;
  };
  that.flush = function() {
    z.inflateEnd();
  };
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/constants.js
var MAX_32_BITS = 4294967295;
var MAX_16_BITS = 65535;
var COMPRESSION_METHOD_DEFLATE = 8;
var COMPRESSION_METHOD_STORE = 0;
var COMPRESSION_METHOD_AES = 99;
var LOCAL_FILE_HEADER_SIGNATURE = 67324752;
var SPLIT_ZIP_FILE_SIGNATURE = 134695760;
var DATA_DESCRIPTOR_RECORD_SIGNATURE = SPLIT_ZIP_FILE_SIGNATURE;
var CENTRAL_FILE_HEADER_SIGNATURE = 33639248;
var END_OF_CENTRAL_DIR_SIGNATURE = 101010256;
var ZIP64_END_OF_CENTRAL_DIR_SIGNATURE = 101075792;
var ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIGNATURE = 117853008;
var END_OF_CENTRAL_DIR_LENGTH = 22;
var ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH = 20;
var ZIP64_END_OF_CENTRAL_DIR_LENGTH = 56;
var ZIP64_END_OF_CENTRAL_DIR_TOTAL_LENGTH = END_OF_CENTRAL_DIR_LENGTH + ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH + ZIP64_END_OF_CENTRAL_DIR_LENGTH;
var EXTRAFIELD_TYPE_ZIP64 = 1;
var EXTRAFIELD_TYPE_AES = 39169;
var EXTRAFIELD_TYPE_NTFS = 10;
var EXTRAFIELD_TYPE_NTFS_TAG1 = 1;
var EXTRAFIELD_TYPE_EXTENDED_TIMESTAMP = 21589;
var EXTRAFIELD_TYPE_UNICODE_PATH = 28789;
var EXTRAFIELD_TYPE_UNICODE_COMMENT = 25461;
var EXTRAFIELD_TYPE_USDZ = 6534;
var BITFLAG_ENCRYPTED = 1;
var BITFLAG_LEVEL = 6;
var BITFLAG_DATA_DESCRIPTOR = 8;
var BITFLAG_LANG_ENCODING_FLAG = 2048;
var FILE_ATTR_MSDOS_DIR_MASK = 16;
var VERSION_DEFLATE = 20;
var VERSION_ZIP64 = 45;
var VERSION_AES = 51;
var DIRECTORY_SIGNATURE = "/";
var MAX_DATE = new Date(2107, 11, 31);
var MIN_DATE = new Date(1980, 0, 1);
var UNDEFINED_VALUE = void 0;
var UNDEFINED_TYPE = "undefined";
var FUNCTION_TYPE = "function";

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/streams/stream-adapter.js
var StreamAdapter = class {
  constructor(Codec) {
    return class extends TransformStream {
      constructor(_format, options) {
        const codec2 = new Codec(options);
        super({
          transform(chunk, controller) {
            controller.enqueue(codec2.append(chunk));
          },
          flush(controller) {
            const chunk = codec2.flush();
            if (chunk) {
              controller.enqueue(chunk);
            }
          }
        });
      }
    };
  }
};

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/configuration.js
var MINIMUM_CHUNK_SIZE = 64;
var maxWorkers = 2;
try {
  if (typeof navigator != UNDEFINED_TYPE && navigator.hardwareConcurrency) {
    maxWorkers = navigator.hardwareConcurrency;
  }
} catch (_error) {
}
var DEFAULT_CONFIGURATION = {
  chunkSize: 512 * 1024,
  maxWorkers,
  terminateWorkerTimeout: 5e3,
  useWebWorkers: true,
  useCompressionStream: true,
  workerScripts: UNDEFINED_VALUE,
  CompressionStreamNative: typeof CompressionStream != UNDEFINED_TYPE && CompressionStream,
  DecompressionStreamNative: typeof DecompressionStream != UNDEFINED_TYPE && DecompressionStream
};
var config = Object.assign({}, DEFAULT_CONFIGURATION);
function getConfiguration() {
  return config;
}
function getChunkSize(config2) {
  return Math.max(config2.chunkSize, MINIMUM_CHUNK_SIZE);
}
function configure(configuration) {
  const {
    baseURL: baseURL2,
    chunkSize,
    maxWorkers: maxWorkers2,
    terminateWorkerTimeout,
    useCompressionStream,
    useWebWorkers,
    Deflate: Deflate2,
    Inflate: Inflate2,
    CompressionStream: CompressionStream2,
    DecompressionStream: DecompressionStream2,
    workerScripts
  } = configuration;
  setIfDefined("baseURL", baseURL2);
  setIfDefined("chunkSize", chunkSize);
  setIfDefined("maxWorkers", maxWorkers2);
  setIfDefined("terminateWorkerTimeout", terminateWorkerTimeout);
  setIfDefined("useCompressionStream", useCompressionStream);
  setIfDefined("useWebWorkers", useWebWorkers);
  if (Deflate2) {
    config.CompressionStream = new StreamAdapter(Deflate2);
  }
  if (Inflate2) {
    config.DecompressionStream = new StreamAdapter(Inflate2);
  }
  setIfDefined("CompressionStream", CompressionStream2);
  setIfDefined("DecompressionStream", DecompressionStream2);
  if (workerScripts !== UNDEFINED_VALUE) {
    const { deflate, inflate } = workerScripts;
    if (deflate || inflate) {
      if (!config.workerScripts) {
        config.workerScripts = {};
      }
    }
    if (deflate) {
      if (!Array.isArray(deflate)) {
        throw new Error("workerScripts.deflate must be an array");
      }
      config.workerScripts.deflate = deflate;
    }
    if (inflate) {
      if (!Array.isArray(inflate)) {
        throw new Error("workerScripts.inflate must be an array");
      }
      config.workerScripts.inflate = inflate;
    }
  }
}
function setIfDefined(propertyName, propertyValue) {
  if (propertyValue !== UNDEFINED_VALUE) {
    config[propertyName] = propertyValue;
  }
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/util/mime-type.js
var table = {
  "application": {
    "andrew-inset": "ez",
    "annodex": "anx",
    "atom+xml": "atom",
    "atomcat+xml": "atomcat",
    "atomserv+xml": "atomsrv",
    "bbolin": "lin",
    "cu-seeme": "cu",
    "davmount+xml": "davmount",
    "dsptype": "tsp",
    "ecmascript": [
      "es",
      "ecma"
    ],
    "futuresplash": "spl",
    "hta": "hta",
    "java-archive": "jar",
    "java-serialized-object": "ser",
    "java-vm": "class",
    "m3g": "m3g",
    "mac-binhex40": "hqx",
    "mathematica": [
      "nb",
      "ma",
      "mb"
    ],
    "msaccess": "mdb",
    "msword": [
      "doc",
      "dot",
      "wiz"
    ],
    "mxf": "mxf",
    "oda": "oda",
    "ogg": "ogx",
    "pdf": "pdf",
    "pgp-keys": "key",
    "pgp-signature": [
      "asc",
      "sig"
    ],
    "pics-rules": "prf",
    "postscript": [
      "ps",
      "ai",
      "eps",
      "epsi",
      "epsf",
      "eps2",
      "eps3"
    ],
    "rar": "rar",
    "rdf+xml": "rdf",
    "rss+xml": "rss",
    "rtf": "rtf",
    "xhtml+xml": [
      "xhtml",
      "xht"
    ],
    "xml": [
      "xml",
      "xsl",
      "xsd",
      "xpdl"
    ],
    "xspf+xml": "xspf",
    "zip": "zip",
    "vnd.android.package-archive": "apk",
    "vnd.cinderella": "cdy",
    "vnd.google-earth.kml+xml": "kml",
    "vnd.google-earth.kmz": "kmz",
    "vnd.mozilla.xul+xml": "xul",
    "vnd.ms-excel": [
      "xls",
      "xlb",
      "xlt",
      "xlm",
      "xla",
      "xlc",
      "xlw"
    ],
    "vnd.ms-pki.seccat": "cat",
    "vnd.ms-pki.stl": "stl",
    "vnd.ms-powerpoint": [
      "ppt",
      "pps",
      "pot",
      "ppa",
      "pwz"
    ],
    "vnd.oasis.opendocument.chart": "odc",
    "vnd.oasis.opendocument.database": "odb",
    "vnd.oasis.opendocument.formula": "odf",
    "vnd.oasis.opendocument.graphics": "odg",
    "vnd.oasis.opendocument.graphics-template": "otg",
    "vnd.oasis.opendocument.image": "odi",
    "vnd.oasis.opendocument.presentation": "odp",
    "vnd.oasis.opendocument.presentation-template": "otp",
    "vnd.oasis.opendocument.spreadsheet": "ods",
    "vnd.oasis.opendocument.spreadsheet-template": "ots",
    "vnd.oasis.opendocument.text": "odt",
    "vnd.oasis.opendocument.text-master": [
      "odm",
      "otm"
    ],
    "vnd.oasis.opendocument.text-template": "ott",
    "vnd.oasis.opendocument.text-web": "oth",
    "vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "vnd.openxmlformats-officedocument.spreadsheetml.template": "xltx",
    "vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "vnd.openxmlformats-officedocument.presentationml.slideshow": "ppsx",
    "vnd.openxmlformats-officedocument.presentationml.template": "potx",
    "vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "vnd.openxmlformats-officedocument.wordprocessingml.template": "dotx",
    "vnd.smaf": "mmf",
    "vnd.stardivision.calc": "sdc",
    "vnd.stardivision.chart": "sds",
    "vnd.stardivision.draw": "sda",
    "vnd.stardivision.impress": "sdd",
    "vnd.stardivision.math": [
      "sdf",
      "smf"
    ],
    "vnd.stardivision.writer": [
      "sdw",
      "vor"
    ],
    "vnd.stardivision.writer-global": "sgl",
    "vnd.sun.xml.calc": "sxc",
    "vnd.sun.xml.calc.template": "stc",
    "vnd.sun.xml.draw": "sxd",
    "vnd.sun.xml.draw.template": "std",
    "vnd.sun.xml.impress": "sxi",
    "vnd.sun.xml.impress.template": "sti",
    "vnd.sun.xml.math": "sxm",
    "vnd.sun.xml.writer": "sxw",
    "vnd.sun.xml.writer.global": "sxg",
    "vnd.sun.xml.writer.template": "stw",
    "vnd.symbian.install": [
      "sis",
      "sisx"
    ],
    "vnd.visio": [
      "vsd",
      "vst",
      "vss",
      "vsw",
      "vsdx",
      "vssx",
      "vstx",
      "vssm",
      "vstm"
    ],
    "vnd.wap.wbxml": "wbxml",
    "vnd.wap.wmlc": "wmlc",
    "vnd.wap.wmlscriptc": "wmlsc",
    "vnd.wordperfect": "wpd",
    "vnd.wordperfect5.1": "wp5",
    "x-123": "wk",
    "x-7z-compressed": "7z",
    "x-abiword": "abw",
    "x-apple-diskimage": "dmg",
    "x-bcpio": "bcpio",
    "x-bittorrent": "torrent",
    "x-cbr": [
      "cbr",
      "cba",
      "cbt",
      "cb7"
    ],
    "x-cbz": "cbz",
    "x-cdf": [
      "cdf",
      "cda"
    ],
    "x-cdlink": "vcd",
    "x-chess-pgn": "pgn",
    "x-cpio": "cpio",
    "x-csh": "csh",
    "x-director": [
      "dir",
      "dxr",
      "cst",
      "cct",
      "cxt",
      "w3d",
      "fgd",
      "swa"
    ],
    "x-dms": "dms",
    "x-doom": "wad",
    "x-dvi": "dvi",
    "x-httpd-eruby": "rhtml",
    "x-font": "pcf.Z",
    "x-freemind": "mm",
    "x-gnumeric": "gnumeric",
    "x-go-sgf": "sgf",
    "x-graphing-calculator": "gcf",
    "x-gtar": [
      "gtar",
      "taz"
    ],
    "x-hdf": "hdf",
    "x-httpd-php": [
      "phtml",
      "pht",
      "php"
    ],
    "x-httpd-php-source": "phps",
    "x-httpd-php3": "php3",
    "x-httpd-php3-preprocessed": "php3p",
    "x-httpd-php4": "php4",
    "x-httpd-php5": "php5",
    "x-ica": "ica",
    "x-info": "info",
    "x-internet-signup": [
      "ins",
      "isp"
    ],
    "x-iphone": "iii",
    "x-iso9660-image": "iso",
    "x-java-jnlp-file": "jnlp",
    "x-jmol": "jmz",
    "x-killustrator": "kil",
    "x-latex": "latex",
    "x-lyx": "lyx",
    "x-lzx": "lzx",
    "x-maker": [
      "frm",
      "fb",
      "fbdoc"
    ],
    "x-ms-wmd": "wmd",
    "x-msdos-program": [
      "com",
      "exe",
      "bat",
      "dll"
    ],
    "x-netcdf": [
      "nc"
    ],
    "x-ns-proxy-autoconfig": [
      "pac",
      "dat"
    ],
    "x-nwc": "nwc",
    "x-object": "o",
    "x-oz-application": "oza",
    "x-pkcs7-certreqresp": "p7r",
    "x-python-code": [
      "pyc",
      "pyo"
    ],
    "x-qgis": [
      "qgs",
      "shp",
      "shx"
    ],
    "x-quicktimeplayer": "qtl",
    "x-redhat-package-manager": [
      "rpm",
      "rpa"
    ],
    "x-ruby": "rb",
    "x-sh": "sh",
    "x-shar": "shar",
    "x-shockwave-flash": [
      "swf",
      "swfl"
    ],
    "x-silverlight": "scr",
    "x-stuffit": "sit",
    "x-sv4cpio": "sv4cpio",
    "x-sv4crc": "sv4crc",
    "x-tar": "tar",
    "x-tex-gf": "gf",
    "x-tex-pk": "pk",
    "x-texinfo": [
      "texinfo",
      "texi"
    ],
    "x-trash": [
      "~",
      "%",
      "bak",
      "old",
      "sik"
    ],
    "x-ustar": "ustar",
    "x-wais-source": "src",
    "x-wingz": "wz",
    "x-x509-ca-cert": [
      "crt",
      "der",
      "cer"
    ],
    "x-xcf": "xcf",
    "x-xfig": "fig",
    "x-xpinstall": "xpi",
    "applixware": "aw",
    "atomsvc+xml": "atomsvc",
    "ccxml+xml": "ccxml",
    "cdmi-capability": "cdmia",
    "cdmi-container": "cdmic",
    "cdmi-domain": "cdmid",
    "cdmi-object": "cdmio",
    "cdmi-queue": "cdmiq",
    "docbook+xml": "dbk",
    "dssc+der": "dssc",
    "dssc+xml": "xdssc",
    "emma+xml": "emma",
    "epub+zip": "epub",
    "exi": "exi",
    "font-tdpfr": "pfr",
    "gml+xml": "gml",
    "gpx+xml": "gpx",
    "gxf": "gxf",
    "hyperstudio": "stk",
    "inkml+xml": [
      "ink",
      "inkml"
    ],
    "ipfix": "ipfix",
    "jsonml+json": "jsonml",
    "lost+xml": "lostxml",
    "mads+xml": "mads",
    "marc": "mrc",
    "marcxml+xml": "mrcx",
    "mathml+xml": [
      "mathml",
      "mml"
    ],
    "mbox": "mbox",
    "mediaservercontrol+xml": "mscml",
    "metalink+xml": "metalink",
    "metalink4+xml": "meta4",
    "mets+xml": "mets",
    "mods+xml": "mods",
    "mp21": [
      "m21",
      "mp21"
    ],
    "mp4": "mp4s",
    "oebps-package+xml": "opf",
    "omdoc+xml": "omdoc",
    "onenote": [
      "onetoc",
      "onetoc2",
      "onetmp",
      "onepkg"
    ],
    "oxps": "oxps",
    "patch-ops-error+xml": "xer",
    "pgp-encrypted": "pgp",
    "pkcs10": "p10",
    "pkcs7-mime": [
      "p7m",
      "p7c"
    ],
    "pkcs7-signature": "p7s",
    "pkcs8": "p8",
    "pkix-attr-cert": "ac",
    "pkix-crl": "crl",
    "pkix-pkipath": "pkipath",
    "pkixcmp": "pki",
    "pls+xml": "pls",
    "prs.cww": "cww",
    "pskc+xml": "pskcxml",
    "reginfo+xml": "rif",
    "relax-ng-compact-syntax": "rnc",
    "resource-lists+xml": "rl",
    "resource-lists-diff+xml": "rld",
    "rls-services+xml": "rs",
    "rpki-ghostbusters": "gbr",
    "rpki-manifest": "mft",
    "rpki-roa": "roa",
    "rsd+xml": "rsd",
    "sbml+xml": "sbml",
    "scvp-cv-request": "scq",
    "scvp-cv-response": "scs",
    "scvp-vp-request": "spq",
    "scvp-vp-response": "spp",
    "sdp": "sdp",
    "set-payment-initiation": "setpay",
    "set-registration-initiation": "setreg",
    "shf+xml": "shf",
    "sparql-query": "rq",
    "sparql-results+xml": "srx",
    "srgs": "gram",
    "srgs+xml": "grxml",
    "sru+xml": "sru",
    "ssdl+xml": "ssdl",
    "ssml+xml": "ssml",
    "tei+xml": [
      "tei",
      "teicorpus"
    ],
    "thraud+xml": "tfi",
    "timestamped-data": "tsd",
    "vnd.3gpp.pic-bw-large": "plb",
    "vnd.3gpp.pic-bw-small": "psb",
    "vnd.3gpp.pic-bw-var": "pvb",
    "vnd.3gpp2.tcap": "tcap",
    "vnd.3m.post-it-notes": "pwn",
    "vnd.accpac.simply.aso": "aso",
    "vnd.accpac.simply.imp": "imp",
    "vnd.acucobol": "acu",
    "vnd.acucorp": [
      "atc",
      "acutc"
    ],
    "vnd.adobe.air-application-installer-package+zip": "air",
    "vnd.adobe.formscentral.fcdt": "fcdt",
    "vnd.adobe.fxp": [
      "fxp",
      "fxpl"
    ],
    "vnd.adobe.xdp+xml": "xdp",
    "vnd.adobe.xfdf": "xfdf",
    "vnd.ahead.space": "ahead",
    "vnd.airzip.filesecure.azf": "azf",
    "vnd.airzip.filesecure.azs": "azs",
    "vnd.amazon.ebook": "azw",
    "vnd.americandynamics.acc": "acc",
    "vnd.amiga.ami": "ami",
    "vnd.anser-web-certificate-issue-initiation": "cii",
    "vnd.anser-web-funds-transfer-initiation": "fti",
    "vnd.antix.game-component": "atx",
    "vnd.apple.installer+xml": "mpkg",
    "vnd.apple.mpegurl": "m3u8",
    "vnd.aristanetworks.swi": "swi",
    "vnd.astraea-software.iota": "iota",
    "vnd.audiograph": "aep",
    "vnd.blueice.multipass": "mpm",
    "vnd.bmi": "bmi",
    "vnd.businessobjects": "rep",
    "vnd.chemdraw+xml": "cdxml",
    "vnd.chipnuts.karaoke-mmd": "mmd",
    "vnd.claymore": "cla",
    "vnd.cloanto.rp9": "rp9",
    "vnd.clonk.c4group": [
      "c4g",
      "c4d",
      "c4f",
      "c4p",
      "c4u"
    ],
    "vnd.cluetrust.cartomobile-config": "c11amc",
    "vnd.cluetrust.cartomobile-config-pkg": "c11amz",
    "vnd.commonspace": "csp",
    "vnd.contact.cmsg": "cdbcmsg",
    "vnd.cosmocaller": "cmc",
    "vnd.crick.clicker": "clkx",
    "vnd.crick.clicker.keyboard": "clkk",
    "vnd.crick.clicker.palette": "clkp",
    "vnd.crick.clicker.template": "clkt",
    "vnd.crick.clicker.wordbank": "clkw",
    "vnd.criticaltools.wbs+xml": "wbs",
    "vnd.ctc-posml": "pml",
    "vnd.cups-ppd": "ppd",
    "vnd.curl.car": "car",
    "vnd.curl.pcurl": "pcurl",
    "vnd.dart": "dart",
    "vnd.data-vision.rdz": "rdz",
    "vnd.dece.data": [
      "uvf",
      "uvvf",
      "uvd",
      "uvvd"
    ],
    "vnd.dece.ttml+xml": [
      "uvt",
      "uvvt"
    ],
    "vnd.dece.unspecified": [
      "uvx",
      "uvvx"
    ],
    "vnd.dece.zip": [
      "uvz",
      "uvvz"
    ],
    "vnd.denovo.fcselayout-link": "fe_launch",
    "vnd.dna": "dna",
    "vnd.dolby.mlp": "mlp",
    "vnd.dpgraph": "dpg",
    "vnd.dreamfactory": "dfac",
    "vnd.ds-keypoint": "kpxx",
    "vnd.dvb.ait": "ait",
    "vnd.dvb.service": "svc",
    "vnd.dynageo": "geo",
    "vnd.ecowin.chart": "mag",
    "vnd.enliven": "nml",
    "vnd.epson.esf": "esf",
    "vnd.epson.msf": "msf",
    "vnd.epson.quickanime": "qam",
    "vnd.epson.salt": "slt",
    "vnd.epson.ssf": "ssf",
    "vnd.eszigno3+xml": [
      "es3",
      "et3"
    ],
    "vnd.ezpix-album": "ez2",
    "vnd.ezpix-package": "ez3",
    "vnd.fdf": "fdf",
    "vnd.fdsn.mseed": "mseed",
    "vnd.fdsn.seed": [
      "seed",
      "dataless"
    ],
    "vnd.flographit": "gph",
    "vnd.fluxtime.clip": "ftc",
    "vnd.framemaker": [
      "fm",
      "frame",
      "maker",
      "book"
    ],
    "vnd.frogans.fnc": "fnc",
    "vnd.frogans.ltf": "ltf",
    "vnd.fsc.weblaunch": "fsc",
    "vnd.fujitsu.oasys": "oas",
    "vnd.fujitsu.oasys2": "oa2",
    "vnd.fujitsu.oasys3": "oa3",
    "vnd.fujitsu.oasysgp": "fg5",
    "vnd.fujitsu.oasysprs": "bh2",
    "vnd.fujixerox.ddd": "ddd",
    "vnd.fujixerox.docuworks": "xdw",
    "vnd.fujixerox.docuworks.binder": "xbd",
    "vnd.fuzzysheet": "fzs",
    "vnd.genomatix.tuxedo": "txd",
    "vnd.geogebra.file": "ggb",
    "vnd.geogebra.tool": "ggt",
    "vnd.geometry-explorer": [
      "gex",
      "gre"
    ],
    "vnd.geonext": "gxt",
    "vnd.geoplan": "g2w",
    "vnd.geospace": "g3w",
    "vnd.gmx": "gmx",
    "vnd.grafeq": [
      "gqf",
      "gqs"
    ],
    "vnd.groove-account": "gac",
    "vnd.groove-help": "ghf",
    "vnd.groove-identity-message": "gim",
    "vnd.groove-injector": "grv",
    "vnd.groove-tool-message": "gtm",
    "vnd.groove-tool-template": "tpl",
    "vnd.groove-vcard": "vcg",
    "vnd.hal+xml": "hal",
    "vnd.handheld-entertainment+xml": "zmm",
    "vnd.hbci": "hbci",
    "vnd.hhe.lesson-player": "les",
    "vnd.hp-hpgl": "hpgl",
    "vnd.hp-hpid": "hpid",
    "vnd.hp-hps": "hps",
    "vnd.hp-jlyt": "jlt",
    "vnd.hp-pcl": "pcl",
    "vnd.hp-pclxl": "pclxl",
    "vnd.hydrostatix.sof-data": "sfd-hdstx",
    "vnd.ibm.minipay": "mpy",
    "vnd.ibm.modcap": [
      "afp",
      "listafp",
      "list3820"
    ],
    "vnd.ibm.rights-management": "irm",
    "vnd.ibm.secure-container": "sc",
    "vnd.iccprofile": [
      "icc",
      "icm"
    ],
    "vnd.igloader": "igl",
    "vnd.immervision-ivp": "ivp",
    "vnd.immervision-ivu": "ivu",
    "vnd.insors.igm": "igm",
    "vnd.intercon.formnet": [
      "xpw",
      "xpx"
    ],
    "vnd.intergeo": "i2g",
    "vnd.intu.qbo": "qbo",
    "vnd.intu.qfx": "qfx",
    "vnd.ipunplugged.rcprofile": "rcprofile",
    "vnd.irepository.package+xml": "irp",
    "vnd.is-xpr": "xpr",
    "vnd.isac.fcs": "fcs",
    "vnd.jam": "jam",
    "vnd.jcp.javame.midlet-rms": "rms",
    "vnd.jisp": "jisp",
    "vnd.joost.joda-archive": "joda",
    "vnd.kahootz": [
      "ktz",
      "ktr"
    ],
    "vnd.kde.karbon": "karbon",
    "vnd.kde.kchart": "chrt",
    "vnd.kde.kformula": "kfo",
    "vnd.kde.kivio": "flw",
    "vnd.kde.kontour": "kon",
    "vnd.kde.kpresenter": [
      "kpr",
      "kpt"
    ],
    "vnd.kde.kspread": "ksp",
    "vnd.kde.kword": [
      "kwd",
      "kwt"
    ],
    "vnd.kenameaapp": "htke",
    "vnd.kidspiration": "kia",
    "vnd.kinar": [
      "kne",
      "knp"
    ],
    "vnd.koan": [
      "skp",
      "skd",
      "skt",
      "skm"
    ],
    "vnd.kodak-descriptor": "sse",
    "vnd.las.las+xml": "lasxml",
    "vnd.llamagraphics.life-balance.desktop": "lbd",
    "vnd.llamagraphics.life-balance.exchange+xml": "lbe",
    "vnd.lotus-1-2-3": "123",
    "vnd.lotus-approach": "apr",
    "vnd.lotus-freelance": "pre",
    "vnd.lotus-notes": "nsf",
    "vnd.lotus-organizer": "org",
    "vnd.lotus-screencam": "scm",
    "vnd.lotus-wordpro": "lwp",
    "vnd.macports.portpkg": "portpkg",
    "vnd.mcd": "mcd",
    "vnd.medcalcdata": "mc1",
    "vnd.mediastation.cdkey": "cdkey",
    "vnd.mfer": "mwf",
    "vnd.mfmp": "mfm",
    "vnd.micrografx.flo": "flo",
    "vnd.micrografx.igx": "igx",
    "vnd.mif": "mif",
    "vnd.mobius.daf": "daf",
    "vnd.mobius.dis": "dis",
    "vnd.mobius.mbk": "mbk",
    "vnd.mobius.mqy": "mqy",
    "vnd.mobius.msl": "msl",
    "vnd.mobius.plc": "plc",
    "vnd.mobius.txf": "txf",
    "vnd.mophun.application": "mpn",
    "vnd.mophun.certificate": "mpc",
    "vnd.ms-artgalry": "cil",
    "vnd.ms-cab-compressed": "cab",
    "vnd.ms-excel.addin.macroenabled.12": "xlam",
    "vnd.ms-excel.sheet.binary.macroenabled.12": "xlsb",
    "vnd.ms-excel.sheet.macroenabled.12": "xlsm",
    "vnd.ms-excel.template.macroenabled.12": "xltm",
    "vnd.ms-fontobject": "eot",
    "vnd.ms-htmlhelp": "chm",
    "vnd.ms-ims": "ims",
    "vnd.ms-lrm": "lrm",
    "vnd.ms-officetheme": "thmx",
    "vnd.ms-powerpoint.addin.macroenabled.12": "ppam",
    "vnd.ms-powerpoint.presentation.macroenabled.12": "pptm",
    "vnd.ms-powerpoint.slide.macroenabled.12": "sldm",
    "vnd.ms-powerpoint.slideshow.macroenabled.12": "ppsm",
    "vnd.ms-powerpoint.template.macroenabled.12": "potm",
    "vnd.ms-project": [
      "mpp",
      "mpt"
    ],
    "vnd.ms-word.document.macroenabled.12": "docm",
    "vnd.ms-word.template.macroenabled.12": "dotm",
    "vnd.ms-works": [
      "wps",
      "wks",
      "wcm",
      "wdb"
    ],
    "vnd.ms-wpl": "wpl",
    "vnd.ms-xpsdocument": "xps",
    "vnd.mseq": "mseq",
    "vnd.musician": "mus",
    "vnd.muvee.style": "msty",
    "vnd.mynfc": "taglet",
    "vnd.neurolanguage.nlu": "nlu",
    "vnd.nitf": [
      "ntf",
      "nitf"
    ],
    "vnd.noblenet-directory": "nnd",
    "vnd.noblenet-sealer": "nns",
    "vnd.noblenet-web": "nnw",
    "vnd.nokia.n-gage.data": "ngdat",
    "vnd.nokia.n-gage.symbian.install": "n-gage",
    "vnd.nokia.radio-preset": "rpst",
    "vnd.nokia.radio-presets": "rpss",
    "vnd.novadigm.edm": "edm",
    "vnd.novadigm.edx": "edx",
    "vnd.novadigm.ext": "ext",
    "vnd.oasis.opendocument.chart-template": "otc",
    "vnd.oasis.opendocument.formula-template": "odft",
    "vnd.oasis.opendocument.image-template": "oti",
    "vnd.olpc-sugar": "xo",
    "vnd.oma.dd2+xml": "dd2",
    "vnd.openofficeorg.extension": "oxt",
    "vnd.openxmlformats-officedocument.presentationml.slide": "sldx",
    "vnd.osgeo.mapguide.package": "mgp",
    "vnd.osgi.dp": "dp",
    "vnd.osgi.subsystem": "esa",
    "vnd.palm": [
      "pdb",
      "pqa",
      "oprc"
    ],
    "vnd.pawaafile": "paw",
    "vnd.pg.format": "str",
    "vnd.pg.osasli": "ei6",
    "vnd.picsel": "efif",
    "vnd.pmi.widget": "wg",
    "vnd.pocketlearn": "plf",
    "vnd.powerbuilder6": "pbd",
    "vnd.previewsystems.box": "box",
    "vnd.proteus.magazine": "mgz",
    "vnd.publishare-delta-tree": "qps",
    "vnd.pvi.ptid1": "ptid",
    "vnd.quark.quarkxpress": [
      "qxd",
      "qxt",
      "qwd",
      "qwt",
      "qxl",
      "qxb"
    ],
    "vnd.realvnc.bed": "bed",
    "vnd.recordare.musicxml": "mxl",
    "vnd.recordare.musicxml+xml": "musicxml",
    "vnd.rig.cryptonote": "cryptonote",
    "vnd.rn-realmedia": "rm",
    "vnd.rn-realmedia-vbr": "rmvb",
    "vnd.route66.link66+xml": "link66",
    "vnd.sailingtracker.track": "st",
    "vnd.seemail": "see",
    "vnd.sema": "sema",
    "vnd.semd": "semd",
    "vnd.semf": "semf",
    "vnd.shana.informed.formdata": "ifm",
    "vnd.shana.informed.formtemplate": "itp",
    "vnd.shana.informed.interchange": "iif",
    "vnd.shana.informed.package": "ipk",
    "vnd.simtech-mindmapper": [
      "twd",
      "twds"
    ],
    "vnd.smart.teacher": "teacher",
    "vnd.solent.sdkm+xml": [
      "sdkm",
      "sdkd"
    ],
    "vnd.spotfire.dxp": "dxp",
    "vnd.spotfire.sfs": "sfs",
    "vnd.stepmania.package": "smzip",
    "vnd.stepmania.stepchart": "sm",
    "vnd.sus-calendar": [
      "sus",
      "susp"
    ],
    "vnd.svd": "svd",
    "vnd.syncml+xml": "xsm",
    "vnd.syncml.dm+wbxml": "bdm",
    "vnd.syncml.dm+xml": "xdm",
    "vnd.tao.intent-module-archive": "tao",
    "vnd.tcpdump.pcap": [
      "pcap",
      "cap",
      "dmp"
    ],
    "vnd.tmobile-livetv": "tmo",
    "vnd.trid.tpt": "tpt",
    "vnd.triscape.mxs": "mxs",
    "vnd.trueapp": "tra",
    "vnd.ufdl": [
      "ufd",
      "ufdl"
    ],
    "vnd.uiq.theme": "utz",
    "vnd.umajin": "umj",
    "vnd.unity": "unityweb",
    "vnd.uoml+xml": "uoml",
    "vnd.vcx": "vcx",
    "vnd.visionary": "vis",
    "vnd.vsf": "vsf",
    "vnd.webturbo": "wtb",
    "vnd.wolfram.player": "nbp",
    "vnd.wqd": "wqd",
    "vnd.wt.stf": "stf",
    "vnd.xara": "xar",
    "vnd.xfdl": "xfdl",
    "vnd.yamaha.hv-dic": "hvd",
    "vnd.yamaha.hv-script": "hvs",
    "vnd.yamaha.hv-voice": "hvp",
    "vnd.yamaha.openscoreformat": "osf",
    "vnd.yamaha.openscoreformat.osfpvg+xml": "osfpvg",
    "vnd.yamaha.smaf-audio": "saf",
    "vnd.yamaha.smaf-phrase": "spf",
    "vnd.yellowriver-custom-menu": "cmp",
    "vnd.zul": [
      "zir",
      "zirz"
    ],
    "vnd.zzazz.deck+xml": "zaz",
    "voicexml+xml": "vxml",
    "widget": "wgt",
    "winhlp": "hlp",
    "wsdl+xml": "wsdl",
    "wspolicy+xml": "wspolicy",
    "x-ace-compressed": "ace",
    "x-authorware-bin": [
      "aab",
      "x32",
      "u32",
      "vox"
    ],
    "x-authorware-map": "aam",
    "x-authorware-seg": "aas",
    "x-blorb": [
      "blb",
      "blorb"
    ],
    "x-bzip": "bz",
    "x-bzip2": [
      "bz2",
      "boz"
    ],
    "x-cfs-compressed": "cfs",
    "x-chat": "chat",
    "x-conference": "nsc",
    "x-dgc-compressed": "dgc",
    "x-dtbncx+xml": "ncx",
    "x-dtbook+xml": "dtb",
    "x-dtbresource+xml": "res",
    "x-eva": "eva",
    "x-font-bdf": "bdf",
    "x-font-ghostscript": "gsf",
    "x-font-linux-psf": "psf",
    "x-font-pcf": "pcf",
    "x-font-snf": "snf",
    "x-font-ttf": [
      "ttf",
      "ttc"
    ],
    "x-font-type1": [
      "pfa",
      "pfb",
      "pfm",
      "afm"
    ],
    "x-freearc": "arc",
    "x-gca-compressed": "gca",
    "x-glulx": "ulx",
    "x-gramps-xml": "gramps",
    "x-install-instructions": "install",
    "x-lzh-compressed": [
      "lzh",
      "lha"
    ],
    "x-mie": "mie",
    "x-mobipocket-ebook": [
      "prc",
      "mobi"
    ],
    "x-ms-application": "application",
    "x-ms-shortcut": "lnk",
    "x-ms-xbap": "xbap",
    "x-msbinder": "obd",
    "x-mscardfile": "crd",
    "x-msclip": "clp",
    "application/x-ms-installer": "msi",
    "x-msmediaview": [
      "mvb",
      "m13",
      "m14"
    ],
    "x-msmetafile": [
      "wmf",
      "wmz",
      "emf",
      "emz"
    ],
    "x-msmoney": "mny",
    "x-mspublisher": "pub",
    "x-msschedule": "scd",
    "x-msterminal": "trm",
    "x-mswrite": "wri",
    "x-nzb": "nzb",
    "x-pkcs12": [
      "p12",
      "pfx"
    ],
    "x-pkcs7-certificates": [
      "p7b",
      "spc"
    ],
    "x-research-info-systems": "ris",
    "x-silverlight-app": "xap",
    "x-sql": "sql",
    "x-stuffitx": "sitx",
    "x-subrip": "srt",
    "x-t3vm-image": "t3",
    "x-tex-tfm": "tfm",
    "x-tgif": "obj",
    "x-xliff+xml": "xlf",
    "x-xz": "xz",
    "x-zmachine": [
      "z1",
      "z2",
      "z3",
      "z4",
      "z5",
      "z6",
      "z7",
      "z8"
    ],
    "xaml+xml": "xaml",
    "xcap-diff+xml": "xdf",
    "xenc+xml": "xenc",
    "xml-dtd": "dtd",
    "xop+xml": "xop",
    "xproc+xml": "xpl",
    "xslt+xml": "xslt",
    "xv+xml": [
      "mxml",
      "xhvml",
      "xvml",
      "xvm"
    ],
    "yang": "yang",
    "yin+xml": "yin",
    "envoy": "evy",
    "fractals": "fif",
    "internet-property-stream": "acx",
    "olescript": "axs",
    "vnd.ms-outlook": "msg",
    "vnd.ms-pkicertstore": "sst",
    "x-compress": "z",
    "x-perfmon": [
      "pma",
      "pmc",
      "pmr",
      "pmw"
    ],
    "ynd.ms-pkipko": "pko",
    "gzip": [
      "gz",
      "tgz"
    ],
    "smil+xml": [
      "smi",
      "smil"
    ],
    "vnd.debian.binary-package": [
      "deb",
      "udeb"
    ],
    "vnd.hzn-3d-crossword": "x3d",
    "vnd.sqlite3": [
      "db",
      "sqlite",
      "sqlite3",
      "db-wal",
      "sqlite-wal",
      "db-shm",
      "sqlite-shm"
    ],
    "vnd.wap.sic": "sic",
    "vnd.wap.slc": "slc",
    "x-krita": [
      "kra",
      "krz"
    ],
    "x-perl": [
      "pm",
      "pl"
    ],
    "yaml": [
      "yaml",
      "yml"
    ]
  },
  "audio": {
    "amr": "amr",
    "amr-wb": "awb",
    "annodex": "axa",
    "basic": [
      "au",
      "snd"
    ],
    "flac": "flac",
    "midi": [
      "mid",
      "midi",
      "kar",
      "rmi"
    ],
    "mpeg": [
      "mpga",
      "mpega",
      "mp3",
      "m4a",
      "mp2a",
      "m2a",
      "m3a"
    ],
    "mpegurl": "m3u",
    "ogg": [
      "oga",
      "ogg",
      "spx"
    ],
    "prs.sid": "sid",
    "x-aiff": "aifc",
    "x-gsm": "gsm",
    "x-ms-wma": "wma",
    "x-ms-wax": "wax",
    "x-pn-realaudio": "ram",
    "x-realaudio": "ra",
    "x-sd2": "sd2",
    "adpcm": "adp",
    "mp4": "mp4a",
    "s3m": "s3m",
    "silk": "sil",
    "vnd.dece.audio": [
      "uva",
      "uvva"
    ],
    "vnd.digital-winds": "eol",
    "vnd.dra": "dra",
    "vnd.dts": "dts",
    "vnd.dts.hd": "dtshd",
    "vnd.lucent.voice": "lvp",
    "vnd.ms-playready.media.pya": "pya",
    "vnd.nuera.ecelp4800": "ecelp4800",
    "vnd.nuera.ecelp7470": "ecelp7470",
    "vnd.nuera.ecelp9600": "ecelp9600",
    "vnd.rip": "rip",
    "webm": "weba",
    "x-caf": "caf",
    "x-matroska": "mka",
    "x-pn-realaudio-plugin": "rmp",
    "xm": "xm",
    "aac": "aac",
    "aiff": [
      "aiff",
      "aif",
      "aff"
    ],
    "opus": "opus",
    "wav": "wav"
  },
  "chemical": {
    "x-alchemy": "alc",
    "x-cache": [
      "cac",
      "cache"
    ],
    "x-cache-csf": "csf",
    "x-cactvs-binary": [
      "cbin",
      "cascii",
      "ctab"
    ],
    "x-cdx": "cdx",
    "x-chem3d": "c3d",
    "x-cif": "cif",
    "x-cmdf": "cmdf",
    "x-cml": "cml",
    "x-compass": "cpa",
    "x-crossfire": "bsd",
    "x-csml": [
      "csml",
      "csm"
    ],
    "x-ctx": "ctx",
    "x-cxf": [
      "cxf",
      "cef"
    ],
    "x-embl-dl-nucleotide": [
      "emb",
      "embl"
    ],
    "x-gamess-input": [
      "inp",
      "gam",
      "gamin"
    ],
    "x-gaussian-checkpoint": [
      "fch",
      "fchk"
    ],
    "x-gaussian-cube": "cub",
    "x-gaussian-input": [
      "gau",
      "gjc",
      "gjf"
    ],
    "x-gaussian-log": "gal",
    "x-gcg8-sequence": "gcg",
    "x-genbank": "gen",
    "x-hin": "hin",
    "x-isostar": [
      "istr",
      "ist"
    ],
    "x-jcamp-dx": [
      "jdx",
      "dx"
    ],
    "x-kinemage": "kin",
    "x-macmolecule": "mcm",
    "x-macromodel-input": "mmod",
    "x-mdl-molfile": "mol",
    "x-mdl-rdfile": "rd",
    "x-mdl-rxnfile": "rxn",
    "x-mdl-sdfile": "sd",
    "x-mdl-tgf": "tgf",
    "x-mmcif": "mcif",
    "x-mol2": "mol2",
    "x-molconn-Z": "b",
    "x-mopac-graph": "gpt",
    "x-mopac-input": [
      "mop",
      "mopcrt",
      "zmt"
    ],
    "x-mopac-out": "moo",
    "x-ncbi-asn1": "asn",
    "x-ncbi-asn1-ascii": [
      "prt",
      "ent"
    ],
    "x-ncbi-asn1-binary": "val",
    "x-rosdal": "ros",
    "x-swissprot": "sw",
    "x-vamas-iso14976": "vms",
    "x-vmd": "vmd",
    "x-xtel": "xtel",
    "x-xyz": "xyz"
  },
  "font": {
    "otf": "otf",
    "woff": "woff",
    "woff2": "woff2"
  },
  "image": {
    "gif": "gif",
    "ief": "ief",
    "jpeg": [
      "jpeg",
      "jpg",
      "jpe",
      "jfif",
      "jfif-tbnl",
      "jif"
    ],
    "pcx": "pcx",
    "png": "png",
    "svg+xml": [
      "svg",
      "svgz"
    ],
    "tiff": [
      "tiff",
      "tif"
    ],
    "vnd.djvu": [
      "djvu",
      "djv"
    ],
    "vnd.wap.wbmp": "wbmp",
    "x-canon-cr2": "cr2",
    "x-canon-crw": "crw",
    "x-cmu-raster": "ras",
    "x-coreldraw": "cdr",
    "x-coreldrawpattern": "pat",
    "x-coreldrawtemplate": "cdt",
    "x-corelphotopaint": "cpt",
    "x-epson-erf": "erf",
    "x-icon": "ico",
    "x-jg": "art",
    "x-jng": "jng",
    "x-nikon-nef": "nef",
    "x-olympus-orf": "orf",
    "x-portable-anymap": "pnm",
    "x-portable-bitmap": "pbm",
    "x-portable-graymap": "pgm",
    "x-portable-pixmap": "ppm",
    "x-rgb": "rgb",
    "x-xbitmap": "xbm",
    "x-xpixmap": "xpm",
    "x-xwindowdump": "xwd",
    "bmp": "bmp",
    "cgm": "cgm",
    "g3fax": "g3",
    "ktx": "ktx",
    "prs.btif": "btif",
    "sgi": "sgi",
    "vnd.dece.graphic": [
      "uvi",
      "uvvi",
      "uvg",
      "uvvg"
    ],
    "vnd.dwg": "dwg",
    "vnd.dxf": "dxf",
    "vnd.fastbidsheet": "fbs",
    "vnd.fpx": "fpx",
    "vnd.fst": "fst",
    "vnd.fujixerox.edmics-mmr": "mmr",
    "vnd.fujixerox.edmics-rlc": "rlc",
    "vnd.ms-modi": "mdi",
    "vnd.ms-photo": "wdp",
    "vnd.net-fpx": "npx",
    "vnd.xiff": "xif",
    "webp": "webp",
    "x-3ds": "3ds",
    "x-cmx": "cmx",
    "x-freehand": [
      "fh",
      "fhc",
      "fh4",
      "fh5",
      "fh7"
    ],
    "x-pict": [
      "pic",
      "pct"
    ],
    "x-tga": "tga",
    "cis-cod": "cod",
    "avif": "avifs",
    "heic": [
      "heif",
      "heic"
    ],
    "pjpeg": [
      "pjpg"
    ],
    "vnd.adobe.photoshop": "psd",
    "x-adobe-dng": "dng",
    "x-fuji-raf": "raf",
    "x-icns": "icns",
    "x-kodak-dcr": "dcr",
    "x-kodak-k25": "k25",
    "x-kodak-kdc": "kdc",
    "x-minolta-mrw": "mrw",
    "x-panasonic-raw": [
      "raw",
      "rw2",
      "rwl"
    ],
    "x-pentax-pef": [
      "pef",
      "ptx"
    ],
    "x-sigma-x3f": "x3f",
    "x-sony-arw": "arw",
    "x-sony-sr2": "sr2",
    "x-sony-srf": "srf"
  },
  "message": {
    "rfc822": [
      "eml",
      "mime",
      "mht",
      "mhtml",
      "nws"
    ]
  },
  "model": {
    "iges": [
      "igs",
      "iges"
    ],
    "mesh": [
      "msh",
      "mesh",
      "silo"
    ],
    "vrml": [
      "wrl",
      "vrml"
    ],
    "x3d+vrml": [
      "x3dv",
      "x3dvz"
    ],
    "x3d+xml": "x3dz",
    "x3d+binary": [
      "x3db",
      "x3dbz"
    ],
    "vnd.collada+xml": "dae",
    "vnd.dwf": "dwf",
    "vnd.gdl": "gdl",
    "vnd.gtw": "gtw",
    "vnd.mts": "mts",
    "vnd.usdz+zip": "usdz",
    "vnd.vtu": "vtu"
  },
  "text": {
    "cache-manifest": [
      "manifest",
      "appcache"
    ],
    "calendar": [
      "ics",
      "icz",
      "ifb"
    ],
    "css": "css",
    "csv": "csv",
    "h323": "323",
    "html": [
      "html",
      "htm",
      "shtml",
      "stm"
    ],
    "iuls": "uls",
    "plain": [
      "txt",
      "text",
      "brf",
      "conf",
      "def",
      "list",
      "log",
      "in",
      "bas",
      "diff",
      "ksh"
    ],
    "richtext": "rtx",
    "scriptlet": [
      "sct",
      "wsc"
    ],
    "texmacs": "tm",
    "tab-separated-values": "tsv",
    "vnd.sun.j2me.app-descriptor": "jad",
    "vnd.wap.wml": "wml",
    "vnd.wap.wmlscript": "wmls",
    "x-bibtex": "bib",
    "x-boo": "boo",
    "x-c++hdr": [
      "h++",
      "hpp",
      "hxx",
      "hh"
    ],
    "x-c++src": [
      "c++",
      "cpp",
      "cxx",
      "cc"
    ],
    "x-component": "htc",
    "x-dsrc": "d",
    "x-diff": "patch",
    "x-haskell": "hs",
    "x-java": "java",
    "x-literate-haskell": "lhs",
    "x-moc": "moc",
    "x-pascal": [
      "p",
      "pas",
      "pp",
      "inc"
    ],
    "x-pcs-gcd": "gcd",
    "x-python": "py",
    "x-scala": "scala",
    "x-setext": "etx",
    "x-tcl": [
      "tcl",
      "tk"
    ],
    "x-tex": [
      "tex",
      "ltx",
      "sty",
      "cls"
    ],
    "x-vcalendar": "vcs",
    "x-vcard": "vcf",
    "n3": "n3",
    "prs.lines.tag": "dsc",
    "sgml": [
      "sgml",
      "sgm"
    ],
    "troff": [
      "t",
      "tr",
      "roff",
      "man",
      "me",
      "ms"
    ],
    "turtle": "ttl",
    "uri-list": [
      "uri",
      "uris",
      "urls"
    ],
    "vcard": "vcard",
    "vnd.curl": "curl",
    "vnd.curl.dcurl": "dcurl",
    "vnd.curl.scurl": "scurl",
    "vnd.curl.mcurl": "mcurl",
    "vnd.dvb.subtitle": "sub",
    "vnd.fly": "fly",
    "vnd.fmi.flexstor": "flx",
    "vnd.graphviz": "gv",
    "vnd.in3d.3dml": "3dml",
    "vnd.in3d.spot": "spot",
    "x-asm": [
      "s",
      "asm"
    ],
    "x-c": [
      "c",
      "h",
      "dic"
    ],
    "x-fortran": [
      "f",
      "for",
      "f77",
      "f90"
    ],
    "x-opml": "opml",
    "x-nfo": "nfo",
    "x-sfv": "sfv",
    "x-uuencode": "uu",
    "webviewhtml": "htt",
    "javascript": "js",
    "json": "json",
    "markdown": [
      "md",
      "markdown",
      "mdown",
      "markdn"
    ],
    "vnd.wap.si": "si",
    "vnd.wap.sl": "sl"
  },
  "video": {
    "avif": "avif",
    "3gpp": "3gp",
    "annodex": "axv",
    "dl": "dl",
    "dv": [
      "dif",
      "dv"
    ],
    "fli": "fli",
    "gl": "gl",
    "mpeg": [
      "mpeg",
      "mpg",
      "mpe",
      "m1v",
      "m2v",
      "mp2",
      "mpa",
      "mpv2"
    ],
    "mp4": [
      "mp4",
      "mp4v",
      "mpg4"
    ],
    "quicktime": [
      "qt",
      "mov"
    ],
    "ogg": "ogv",
    "vnd.mpegurl": [
      "mxu",
      "m4u"
    ],
    "x-flv": "flv",
    "x-la-asf": [
      "lsf",
      "lsx"
    ],
    "x-mng": "mng",
    "x-ms-asf": [
      "asf",
      "asx",
      "asr"
    ],
    "x-ms-wm": "wm",
    "x-ms-wmv": "wmv",
    "x-ms-wmx": "wmx",
    "x-ms-wvx": "wvx",
    "x-msvideo": "avi",
    "x-sgi-movie": "movie",
    "x-matroska": [
      "mpv",
      "mkv",
      "mk3d",
      "mks"
    ],
    "3gpp2": "3g2",
    "h261": "h261",
    "h263": "h263",
    "h264": "h264",
    "jpeg": "jpgv",
    "jpm": [
      "jpm",
      "jpgm"
    ],
    "mj2": [
      "mj2",
      "mjp2"
    ],
    "vnd.dece.hd": [
      "uvh",
      "uvvh"
    ],
    "vnd.dece.mobile": [
      "uvm",
      "uvvm"
    ],
    "vnd.dece.pd": [
      "uvp",
      "uvvp"
    ],
    "vnd.dece.sd": [
      "uvs",
      "uvvs"
    ],
    "vnd.dece.video": [
      "uvv",
      "uvvv"
    ],
    "vnd.dvb.file": "dvb",
    "vnd.fvt": "fvt",
    "vnd.ms-playready.media.pyv": "pyv",
    "vnd.uvvu.mp4": [
      "uvu",
      "uvvu"
    ],
    "vnd.vivo": "viv",
    "webm": "webm",
    "x-f4v": "f4v",
    "x-m4v": "m4v",
    "x-ms-vob": "vob",
    "x-smv": "smv",
    "mp2t": "ts"
  },
  "x-conference": {
    "x-cooltalk": "ice"
  },
  "x-world": {
    "x-vrml": [
      "vrm",
      "flr",
      "wrz",
      "xaf",
      "xof"
    ]
  }
};
var mimeTypes = (() => {
  const mimeTypes2 = {};
  for (const type of Object.keys(table)) {
    for (const subtype of Object.keys(table[type])) {
      const value = table[type][subtype];
      if (typeof value == "string") {
        mimeTypes2[value] = type + "/" + subtype;
      } else {
        for (let indexMimeType = 0; indexMimeType < value.length; indexMimeType++) {
          mimeTypes2[value[indexMimeType]] = type + "/" + subtype;
        }
      }
    }
  }
  return mimeTypes2;
})();

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/streams/codecs/crc32.js
var table2 = [];
for (let i2 = 0; i2 < 256; i2++) {
  let t2 = i2;
  for (let j = 0; j < 8; j++) {
    if (t2 & 1) {
      t2 = t2 >>> 1 ^ 3988292384;
    } else {
      t2 = t2 >>> 1;
    }
  }
  table2[i2] = t2;
}
var Crc32 = class {
  constructor(crc) {
    this.crc = crc || -1;
  }
  append(data) {
    let crc = this.crc | 0;
    for (let offset = 0, length = data.length | 0; offset < length; offset++) {
      crc = crc >>> 8 ^ table2[(crc ^ data[offset]) & 255];
    }
    this.crc = crc;
  }
  get() {
    return ~this.crc;
  }
};

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/streams/crc32-stream.js
var Crc32Stream = class extends TransformStream {
  constructor() {
    let stream;
    const crc32 = new Crc32();
    super({
      transform(chunk, controller) {
        crc32.append(chunk);
        controller.enqueue(chunk);
      },
      flush() {
        const value = new Uint8Array(4);
        const dataView = new DataView(value.buffer);
        dataView.setUint32(0, crc32.get());
        stream.value = value;
      }
    });
    stream = this;
  }
};

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/util/encode-text.js
function encodeText(value) {
  if (typeof TextEncoder == UNDEFINED_TYPE) {
    value = unescape(encodeURIComponent(value));
    const result = new Uint8Array(value.length);
    for (let i2 = 0; i2 < result.length; i2++) {
      result[i2] = value.charCodeAt(i2);
    }
    return result;
  } else {
    return new TextEncoder().encode(value);
  }
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/streams/codecs/sjcl.js
var bitArray = {
  /**
   * Concatenate two bit arrays.
   * @param {bitArray} a1 The first array.
   * @param {bitArray} a2 The second array.
   * @return {bitArray} The concatenation of a1 and a2.
   */
  concat(a1, a2) {
    if (a1.length === 0 || a2.length === 0) {
      return a1.concat(a2);
    }
    const last = a1[a1.length - 1], shift = bitArray.getPartial(last);
    if (shift === 32) {
      return a1.concat(a2);
    } else {
      return bitArray._shiftRight(a2, shift, last | 0, a1.slice(0, a1.length - 1));
    }
  },
  /**
   * Find the length of an array of bits.
   * @param {bitArray} a The array.
   * @return {Number} The length of a, in bits.
   */
  bitLength(a2) {
    const l2 = a2.length;
    if (l2 === 0) {
      return 0;
    }
    const x = a2[l2 - 1];
    return (l2 - 1) * 32 + bitArray.getPartial(x);
  },
  /**
   * Truncate an array.
   * @param {bitArray} a The array.
   * @param {Number} len The length to truncate to, in bits.
   * @return {bitArray} A new array, truncated to len bits.
   */
  clamp(a2, len) {
    if (a2.length * 32 < len) {
      return a2;
    }
    a2 = a2.slice(0, Math.ceil(len / 32));
    const l2 = a2.length;
    len = len & 31;
    if (l2 > 0 && len) {
      a2[l2 - 1] = bitArray.partial(len, a2[l2 - 1] & 2147483648 >> len - 1, 1);
    }
    return a2;
  },
  /**
   * Make a partial word for a bit array.
   * @param {Number} len The number of bits in the word.
   * @param {Number} x The bits.
   * @param {Number} [_end=0] Pass 1 if x has already been shifted to the high side.
   * @return {Number} The partial word.
   */
  partial(len, x, _end) {
    if (len === 32) {
      return x;
    }
    return (_end ? x | 0 : x << 32 - len) + len * 1099511627776;
  },
  /**
   * Get the number of bits used by a partial word.
   * @param {Number} x The partial word.
   * @return {Number} The number of bits used by the partial word.
   */
  getPartial(x) {
    return Math.round(x / 1099511627776) || 32;
  },
  /** Shift an array right.
   * @param {bitArray} a The array to shift.
   * @param {Number} shift The number of bits to shift.
   * @param {Number} [carry=0] A byte to carry in
   * @param {bitArray} [out=[]] An array to prepend to the output.
   * @private
   */
  _shiftRight(a2, shift, carry, out) {
    if (out === void 0) {
      out = [];
    }
    for (; shift >= 32; shift -= 32) {
      out.push(carry);
      carry = 0;
    }
    if (shift === 0) {
      return out.concat(a2);
    }
    for (let i2 = 0; i2 < a2.length; i2++) {
      out.push(carry | a2[i2] >>> shift);
      carry = a2[i2] << 32 - shift;
    }
    const last2 = a2.length ? a2[a2.length - 1] : 0;
    const shift2 = bitArray.getPartial(last2);
    out.push(bitArray.partial(shift + shift2 & 31, shift + shift2 > 32 ? carry : out.pop(), 1));
    return out;
  }
};
var codec = {
  bytes: {
    /** Convert from a bitArray to an array of bytes. */
    fromBits(arr) {
      const bl = bitArray.bitLength(arr);
      const byteLength = bl / 8;
      const out = new Uint8Array(byteLength);
      let tmp;
      for (let i2 = 0; i2 < byteLength; i2++) {
        if ((i2 & 3) === 0) {
          tmp = arr[i2 / 4];
        }
        out[i2] = tmp >>> 24;
        tmp <<= 8;
      }
      return out;
    },
    /** Convert from an array of bytes to a bitArray. */
    toBits(bytes) {
      const out = [];
      let i2;
      let tmp = 0;
      for (i2 = 0; i2 < bytes.length; i2++) {
        tmp = tmp << 8 | bytes[i2];
        if ((i2 & 3) === 3) {
          out.push(tmp);
          tmp = 0;
        }
      }
      if (i2 & 3) {
        out.push(bitArray.partial(8 * (i2 & 3), tmp));
      }
      return out;
    }
  }
};
var hash = {};
hash.sha1 = class {
  constructor(hash2) {
    const sha1 = this;
    sha1.blockSize = 512;
    sha1._init = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];
    sha1._key = [1518500249, 1859775393, 2400959708, 3395469782];
    if (hash2) {
      sha1._h = hash2._h.slice(0);
      sha1._buffer = hash2._buffer.slice(0);
      sha1._length = hash2._length;
    } else {
      sha1.reset();
    }
  }
  /**
   * Reset the hash state.
   * @return this
   */
  reset() {
    const sha1 = this;
    sha1._h = sha1._init.slice(0);
    sha1._buffer = [];
    sha1._length = 0;
    return sha1;
  }
  /**
   * Input several words to the hash.
   * @param {bitArray|String} data the data to hash.
   * @return this
   */
  update(data) {
    const sha1 = this;
    if (typeof data === "string") {
      data = codec.utf8String.toBits(data);
    }
    const b2 = sha1._buffer = bitArray.concat(sha1._buffer, data);
    const ol = sha1._length;
    const nl = sha1._length = ol + bitArray.bitLength(data);
    if (nl > 9007199254740991) {
      throw new Error("Cannot hash more than 2^53 - 1 bits");
    }
    const c = new Uint32Array(b2);
    let j = 0;
    for (let i2 = sha1.blockSize + ol - (sha1.blockSize + ol & sha1.blockSize - 1); i2 <= nl; i2 += sha1.blockSize) {
      sha1._block(c.subarray(16 * j, 16 * (j + 1)));
      j += 1;
    }
    b2.splice(0, 16 * j);
    return sha1;
  }
  /**
   * Complete hashing and output the hash value.
   * @return {bitArray} The hash value, an array of 5 big-endian words. TODO
   */
  finalize() {
    const sha1 = this;
    let b2 = sha1._buffer;
    const h2 = sha1._h;
    b2 = bitArray.concat(b2, [bitArray.partial(1, 1)]);
    for (let i2 = b2.length + 2; i2 & 15; i2++) {
      b2.push(0);
    }
    b2.push(Math.floor(sha1._length / 4294967296));
    b2.push(sha1._length | 0);
    while (b2.length) {
      sha1._block(b2.splice(0, 16));
    }
    sha1.reset();
    return h2;
  }
  /**
   * The SHA-1 logical functions f(0), f(1), ..., f(79).
   * @private
   */
  _f(t2, b2, c, d2) {
    if (t2 <= 19) {
      return b2 & c | ~b2 & d2;
    } else if (t2 <= 39) {
      return b2 ^ c ^ d2;
    } else if (t2 <= 59) {
      return b2 & c | b2 & d2 | c & d2;
    } else if (t2 <= 79) {
      return b2 ^ c ^ d2;
    }
  }
  /**
   * Circular left-shift operator.
   * @private
   */
  _S(n2, x) {
    return x << n2 | x >>> 32 - n2;
  }
  /**
   * Perform one cycle of SHA-1.
   * @param {Uint32Array|bitArray} words one block of words.
   * @private
   */
  _block(words) {
    const sha1 = this;
    const h2 = sha1._h;
    const w2 = Array(80);
    for (let j = 0; j < 16; j++) {
      w2[j] = words[j];
    }
    let a2 = h2[0];
    let b2 = h2[1];
    let c = h2[2];
    let d2 = h2[3];
    let e3 = h2[4];
    for (let t2 = 0; t2 <= 79; t2++) {
      if (t2 >= 16) {
        w2[t2] = sha1._S(1, w2[t2 - 3] ^ w2[t2 - 8] ^ w2[t2 - 14] ^ w2[t2 - 16]);
      }
      const tmp = sha1._S(5, a2) + sha1._f(t2, b2, c, d2) + e3 + w2[t2] + sha1._key[Math.floor(t2 / 20)] | 0;
      e3 = d2;
      d2 = c;
      c = sha1._S(30, b2);
      b2 = a2;
      a2 = tmp;
    }
    h2[0] = h2[0] + a2 | 0;
    h2[1] = h2[1] + b2 | 0;
    h2[2] = h2[2] + c | 0;
    h2[3] = h2[3] + d2 | 0;
    h2[4] = h2[4] + e3 | 0;
  }
};
var cipher = {};
cipher.aes = class {
  constructor(key) {
    const aes = this;
    aes._tables = [[[], [], [], [], []], [[], [], [], [], []]];
    if (!aes._tables[0][0][0]) {
      aes._precompute();
    }
    const sbox = aes._tables[0][4];
    const decTable = aes._tables[1];
    const keyLen = key.length;
    let i2, encKey, decKey, rcon = 1;
    if (keyLen !== 4 && keyLen !== 6 && keyLen !== 8) {
      throw new Error("invalid aes key size");
    }
    aes._key = [encKey = key.slice(0), decKey = []];
    for (i2 = keyLen; i2 < 4 * keyLen + 28; i2++) {
      let tmp = encKey[i2 - 1];
      if (i2 % keyLen === 0 || keyLen === 8 && i2 % keyLen === 4) {
        tmp = sbox[tmp >>> 24] << 24 ^ sbox[tmp >> 16 & 255] << 16 ^ sbox[tmp >> 8 & 255] << 8 ^ sbox[tmp & 255];
        if (i2 % keyLen === 0) {
          tmp = tmp << 8 ^ tmp >>> 24 ^ rcon << 24;
          rcon = rcon << 1 ^ (rcon >> 7) * 283;
        }
      }
      encKey[i2] = encKey[i2 - keyLen] ^ tmp;
    }
    for (let j = 0; i2; j++, i2--) {
      const tmp = encKey[j & 3 ? i2 : i2 - 4];
      if (i2 <= 4 || j < 4) {
        decKey[j] = tmp;
      } else {
        decKey[j] = decTable[0][sbox[tmp >>> 24]] ^ decTable[1][sbox[tmp >> 16 & 255]] ^ decTable[2][sbox[tmp >> 8 & 255]] ^ decTable[3][sbox[tmp & 255]];
      }
    }
  }
  // public
  /* Something like this might appear here eventually
  name: "AES",
  blockSize: 4,
  keySizes: [4,6,8],
  */
  /**
   * Encrypt an array of 4 big-endian words.
   * @param {Array} data The plaintext.
   * @return {Array} The ciphertext.
   */
  encrypt(data) {
    return this._crypt(data, 0);
  }
  /**
   * Decrypt an array of 4 big-endian words.
   * @param {Array} data The ciphertext.
   * @return {Array} The plaintext.
   */
  decrypt(data) {
    return this._crypt(data, 1);
  }
  /**
   * Expand the S-box tables.
   *
   * @private
   */
  _precompute() {
    const encTable = this._tables[0];
    const decTable = this._tables[1];
    const sbox = encTable[4];
    const sboxInv = decTable[4];
    const d2 = [];
    const th = [];
    let xInv, x2, x4, x8;
    for (let i2 = 0; i2 < 256; i2++) {
      th[(d2[i2] = i2 << 1 ^ (i2 >> 7) * 283) ^ i2] = i2;
    }
    for (let x = xInv = 0; !sbox[x]; x ^= x2 || 1, xInv = th[xInv] || 1) {
      let s2 = xInv ^ xInv << 1 ^ xInv << 2 ^ xInv << 3 ^ xInv << 4;
      s2 = s2 >> 8 ^ s2 & 255 ^ 99;
      sbox[x] = s2;
      sboxInv[s2] = x;
      x8 = d2[x4 = d2[x2 = d2[x]]];
      let tDec = x8 * 16843009 ^ x4 * 65537 ^ x2 * 257 ^ x * 16843008;
      let tEnc = d2[s2] * 257 ^ s2 * 16843008;
      for (let i2 = 0; i2 < 4; i2++) {
        encTable[i2][x] = tEnc = tEnc << 24 ^ tEnc >>> 8;
        decTable[i2][s2] = tDec = tDec << 24 ^ tDec >>> 8;
      }
    }
    for (let i2 = 0; i2 < 5; i2++) {
      encTable[i2] = encTable[i2].slice(0);
      decTable[i2] = decTable[i2].slice(0);
    }
  }
  /**
   * Encryption and decryption core.
   * @param {Array} input Four words to be encrypted or decrypted.
   * @param dir The direction, 0 for encrypt and 1 for decrypt.
   * @return {Array} The four encrypted or decrypted words.
   * @private
   */
  _crypt(input, dir) {
    if (input.length !== 4) {
      throw new Error("invalid aes block size");
    }
    const key = this._key[dir];
    const nInnerRounds = key.length / 4 - 2;
    const out = [0, 0, 0, 0];
    const table3 = this._tables[dir];
    const t0 = table3[0];
    const t1 = table3[1];
    const t2 = table3[2];
    const t3 = table3[3];
    const sbox = table3[4];
    let a2 = input[0] ^ key[0];
    let b2 = input[dir ? 3 : 1] ^ key[1];
    let c = input[2] ^ key[2];
    let d2 = input[dir ? 1 : 3] ^ key[3];
    let kIndex = 4;
    let a22, b22, c2;
    for (let i2 = 0; i2 < nInnerRounds; i2++) {
      a22 = t0[a2 >>> 24] ^ t1[b2 >> 16 & 255] ^ t2[c >> 8 & 255] ^ t3[d2 & 255] ^ key[kIndex];
      b22 = t0[b2 >>> 24] ^ t1[c >> 16 & 255] ^ t2[d2 >> 8 & 255] ^ t3[a2 & 255] ^ key[kIndex + 1];
      c2 = t0[c >>> 24] ^ t1[d2 >> 16 & 255] ^ t2[a2 >> 8 & 255] ^ t3[b2 & 255] ^ key[kIndex + 2];
      d2 = t0[d2 >>> 24] ^ t1[a2 >> 16 & 255] ^ t2[b2 >> 8 & 255] ^ t3[c & 255] ^ key[kIndex + 3];
      kIndex += 4;
      a2 = a22;
      b2 = b22;
      c = c2;
    }
    for (let i2 = 0; i2 < 4; i2++) {
      out[dir ? 3 & -i2 : i2] = sbox[a2 >>> 24] << 24 ^ sbox[b2 >> 16 & 255] << 16 ^ sbox[c >> 8 & 255] << 8 ^ sbox[d2 & 255] ^ key[kIndex++];
      a22 = a2;
      a2 = b2;
      b2 = c;
      c = d2;
      d2 = a22;
    }
    return out;
  }
};
var random = {
  /** 
   * Generate random words with pure js, cryptographically not as strong & safe as native implementation.
   * @param {TypedArray} typedArray The array to fill.
   * @return {TypedArray} The random values.
   */
  getRandomValues(typedArray) {
    const words = new Uint32Array(typedArray.buffer);
    const r2 = (m_w) => {
      let m_z = 987654321;
      const mask = 4294967295;
      return function() {
        m_z = 36969 * (m_z & 65535) + (m_z >> 16) & mask;
        m_w = 18e3 * (m_w & 65535) + (m_w >> 16) & mask;
        const result = ((m_z << 16) + m_w & mask) / 4294967296 + 0.5;
        return result * (Math.random() > 0.5 ? 1 : -1);
      };
    };
    for (let i2 = 0, rcache; i2 < typedArray.length; i2 += 4) {
      const _r = r2((rcache || Math.random()) * 4294967296);
      rcache = _r() * 987654071;
      words[i2 / 4] = _r() * 4294967296 | 0;
    }
    return typedArray;
  }
};
var mode = {};
mode.ctrGladman = class {
  constructor(prf, iv) {
    this._prf = prf;
    this._initIv = iv;
    this._iv = iv;
  }
  reset() {
    this._iv = this._initIv;
  }
  /** Input some data to calculate.
   * @param {bitArray} data the data to process, it must be intergral multiple of 128 bits unless it's the last.
   */
  update(data) {
    return this.calculate(this._prf, data, this._iv);
  }
  incWord(word) {
    if ((word >> 24 & 255) === 255) {
      let b1 = word >> 16 & 255;
      let b2 = word >> 8 & 255;
      let b3 = word & 255;
      if (b1 === 255) {
        b1 = 0;
        if (b2 === 255) {
          b2 = 0;
          if (b3 === 255) {
            b3 = 0;
          } else {
            ++b3;
          }
        } else {
          ++b2;
        }
      } else {
        ++b1;
      }
      word = 0;
      word += b1 << 16;
      word += b2 << 8;
      word += b3;
    } else {
      word += 1 << 24;
    }
    return word;
  }
  incCounter(counter) {
    if ((counter[0] = this.incWord(counter[0])) === 0) {
      counter[1] = this.incWord(counter[1]);
    }
  }
  calculate(prf, data, iv) {
    let l2;
    if (!(l2 = data.length)) {
      return [];
    }
    const bl = bitArray.bitLength(data);
    for (let i2 = 0; i2 < l2; i2 += 4) {
      this.incCounter(iv);
      const e3 = prf.encrypt(iv);
      data[i2] ^= e3[0];
      data[i2 + 1] ^= e3[1];
      data[i2 + 2] ^= e3[2];
      data[i2 + 3] ^= e3[3];
    }
    return bitArray.clamp(data, bl);
  }
};
var misc = {
  importKey(password) {
    return new misc.hmacSha1(codec.bytes.toBits(password));
  },
  pbkdf2(prf, salt, count, length) {
    count = count || 1e4;
    if (length < 0 || count < 0) {
      throw new Error("invalid params to pbkdf2");
    }
    const byteLength = (length >> 5) + 1 << 2;
    let u2, ui, i2, j, k;
    const arrayBuffer = new ArrayBuffer(byteLength);
    const out = new DataView(arrayBuffer);
    let outLength = 0;
    const b2 = bitArray;
    salt = codec.bytes.toBits(salt);
    for (k = 1; outLength < (byteLength || 1); k++) {
      u2 = ui = prf.encrypt(b2.concat(salt, [k]));
      for (i2 = 1; i2 < count; i2++) {
        ui = prf.encrypt(ui);
        for (j = 0; j < ui.length; j++) {
          u2[j] ^= ui[j];
        }
      }
      for (i2 = 0; outLength < (byteLength || 1) && i2 < u2.length; i2++) {
        out.setInt32(outLength, u2[i2]);
        outLength += 4;
      }
    }
    return arrayBuffer.slice(0, length / 8);
  }
};
misc.hmacSha1 = class {
  constructor(key) {
    const hmac = this;
    const Hash = hmac._hash = hash.sha1;
    const exKey = [[], []];
    hmac._baseHash = [new Hash(), new Hash()];
    const bs = hmac._baseHash[0].blockSize / 32;
    if (key.length > bs) {
      key = new Hash().update(key).finalize();
    }
    for (let i2 = 0; i2 < bs; i2++) {
      exKey[0][i2] = key[i2] ^ 909522486;
      exKey[1][i2] = key[i2] ^ 1549556828;
    }
    hmac._baseHash[0].update(exKey[0]);
    hmac._baseHash[1].update(exKey[1]);
    hmac._resultHash = new Hash(hmac._baseHash[0]);
  }
  reset() {
    const hmac = this;
    hmac._resultHash = new hmac._hash(hmac._baseHash[0]);
    hmac._updated = false;
  }
  update(data) {
    const hmac = this;
    hmac._updated = true;
    hmac._resultHash.update(data);
  }
  digest() {
    const hmac = this;
    const w2 = hmac._resultHash.finalize();
    const result = new hmac._hash(hmac._baseHash[1]).update(w2).finalize();
    hmac.reset();
    return result;
  }
  encrypt(data) {
    if (!this._updated) {
      this.update(data);
      return this.digest(data);
    } else {
      throw new Error("encrypt on already updated hmac called!");
    }
  }
};

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/streams/common-crypto.js
var GET_RANDOM_VALUES_SUPPORTED = typeof crypto != UNDEFINED_TYPE && typeof crypto.getRandomValues == FUNCTION_TYPE;
var ERR_INVALID_PASSWORD = "Invalid password";
var ERR_INVALID_SIGNATURE = "Invalid signature";
var ERR_ABORT_CHECK_PASSWORD = "zipjs-abort-check-password";
function getRandomValues(array) {
  if (GET_RANDOM_VALUES_SUPPORTED) {
    return crypto.getRandomValues(array);
  } else {
    return random.getRandomValues(array);
  }
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/streams/aes-crypto-stream.js
var BLOCK_LENGTH = 16;
var RAW_FORMAT = "raw";
var PBKDF2_ALGORITHM = { name: "PBKDF2" };
var HASH_ALGORITHM = { name: "HMAC" };
var HASH_FUNCTION = "SHA-1";
var BASE_KEY_ALGORITHM = Object.assign({ hash: HASH_ALGORITHM }, PBKDF2_ALGORITHM);
var DERIVED_BITS_ALGORITHM = Object.assign({ iterations: 1e3, hash: { name: HASH_FUNCTION } }, PBKDF2_ALGORITHM);
var DERIVED_BITS_USAGE = ["deriveBits"];
var SALT_LENGTH = [8, 12, 16];
var KEY_LENGTH = [16, 24, 32];
var SIGNATURE_LENGTH = 10;
var COUNTER_DEFAULT_VALUE = [0, 0, 0, 0];
var CRYPTO_API_SUPPORTED = typeof crypto != UNDEFINED_TYPE;
var subtle = CRYPTO_API_SUPPORTED && crypto.subtle;
var SUBTLE_API_SUPPORTED = CRYPTO_API_SUPPORTED && typeof subtle != UNDEFINED_TYPE;
var codecBytes = codec.bytes;
var Aes = cipher.aes;
var CtrGladman = mode.ctrGladman;
var HmacSha1 = misc.hmacSha1;
var IMPORT_KEY_SUPPORTED = CRYPTO_API_SUPPORTED && SUBTLE_API_SUPPORTED && typeof subtle.importKey == FUNCTION_TYPE;
var DERIVE_BITS_SUPPORTED = CRYPTO_API_SUPPORTED && SUBTLE_API_SUPPORTED && typeof subtle.deriveBits == FUNCTION_TYPE;
var AESDecryptionStream = class extends TransformStream {
  constructor({ password, rawPassword, signed, encryptionStrength, checkPasswordOnly }) {
    super({
      start() {
        Object.assign(this, {
          ready: new Promise((resolve) => this.resolveReady = resolve),
          password: encodePassword(password, rawPassword),
          signed,
          strength: encryptionStrength - 1,
          pending: new Uint8Array()
        });
      },
      async transform(chunk, controller) {
        const aesCrypto = this;
        const {
          password: password2,
          strength,
          resolveReady,
          ready
        } = aesCrypto;
        if (password2) {
          await createDecryptionKeys(aesCrypto, strength, password2, subarray(chunk, 0, SALT_LENGTH[strength] + 2));
          chunk = subarray(chunk, SALT_LENGTH[strength] + 2);
          if (checkPasswordOnly) {
            controller.error(new Error(ERR_ABORT_CHECK_PASSWORD));
          } else {
            resolveReady();
          }
        } else {
          await ready;
        }
        const output = new Uint8Array(chunk.length - SIGNATURE_LENGTH - (chunk.length - SIGNATURE_LENGTH) % BLOCK_LENGTH);
        controller.enqueue(append(aesCrypto, chunk, output, 0, SIGNATURE_LENGTH, true));
      },
      async flush(controller) {
        const {
          signed: signed2,
          ctr,
          hmac,
          pending,
          ready
        } = this;
        if (hmac && ctr) {
          await ready;
          const chunkToDecrypt = subarray(pending, 0, pending.length - SIGNATURE_LENGTH);
          const originalSignature = subarray(pending, pending.length - SIGNATURE_LENGTH);
          let decryptedChunkArray = new Uint8Array();
          if (chunkToDecrypt.length) {
            const encryptedChunk = toBits(codecBytes, chunkToDecrypt);
            hmac.update(encryptedChunk);
            const decryptedChunk = ctr.update(encryptedChunk);
            decryptedChunkArray = fromBits(codecBytes, decryptedChunk);
          }
          if (signed2) {
            const signature = subarray(fromBits(codecBytes, hmac.digest()), 0, SIGNATURE_LENGTH);
            for (let indexSignature = 0; indexSignature < SIGNATURE_LENGTH; indexSignature++) {
              if (signature[indexSignature] != originalSignature[indexSignature]) {
                throw new Error(ERR_INVALID_SIGNATURE);
              }
            }
          }
          controller.enqueue(decryptedChunkArray);
        }
      }
    });
  }
};
var AESEncryptionStream = class extends TransformStream {
  constructor({ password, rawPassword, encryptionStrength }) {
    let stream;
    super({
      start() {
        Object.assign(this, {
          ready: new Promise((resolve) => this.resolveReady = resolve),
          password: encodePassword(password, rawPassword),
          strength: encryptionStrength - 1,
          pending: new Uint8Array()
        });
      },
      async transform(chunk, controller) {
        const aesCrypto = this;
        const {
          password: password2,
          strength,
          resolveReady,
          ready
        } = aesCrypto;
        let preamble = new Uint8Array();
        if (password2) {
          preamble = await createEncryptionKeys(aesCrypto, strength, password2);
          resolveReady();
        } else {
          await ready;
        }
        const output = new Uint8Array(preamble.length + chunk.length - chunk.length % BLOCK_LENGTH);
        output.set(preamble, 0);
        controller.enqueue(append(aesCrypto, chunk, output, preamble.length, 0));
      },
      async flush(controller) {
        const {
          ctr,
          hmac,
          pending,
          ready
        } = this;
        if (hmac && ctr) {
          await ready;
          let encryptedChunkArray = new Uint8Array();
          if (pending.length) {
            const encryptedChunk = ctr.update(toBits(codecBytes, pending));
            hmac.update(encryptedChunk);
            encryptedChunkArray = fromBits(codecBytes, encryptedChunk);
          }
          stream.signature = fromBits(codecBytes, hmac.digest()).slice(0, SIGNATURE_LENGTH);
          controller.enqueue(concat(encryptedChunkArray, stream.signature));
        }
      }
    });
    stream = this;
  }
};
function append(aesCrypto, input, output, paddingStart, paddingEnd, verifySignature) {
  const {
    ctr,
    hmac,
    pending
  } = aesCrypto;
  const inputLength = input.length - paddingEnd;
  if (pending.length) {
    input = concat(pending, input);
    output = expand(output, inputLength - inputLength % BLOCK_LENGTH);
  }
  let offset;
  for (offset = 0; offset <= inputLength - BLOCK_LENGTH; offset += BLOCK_LENGTH) {
    const inputChunk = toBits(codecBytes, subarray(input, offset, offset + BLOCK_LENGTH));
    if (verifySignature) {
      hmac.update(inputChunk);
    }
    const outputChunk = ctr.update(inputChunk);
    if (!verifySignature) {
      hmac.update(outputChunk);
    }
    output.set(fromBits(codecBytes, outputChunk), offset + paddingStart);
  }
  aesCrypto.pending = subarray(input, offset);
  return output;
}
async function createDecryptionKeys(decrypt2, strength, password, preamble) {
  const passwordVerificationKey = await createKeys(decrypt2, strength, password, subarray(preamble, 0, SALT_LENGTH[strength]));
  const passwordVerification = subarray(preamble, SALT_LENGTH[strength]);
  if (passwordVerificationKey[0] != passwordVerification[0] || passwordVerificationKey[1] != passwordVerification[1]) {
    throw new Error(ERR_INVALID_PASSWORD);
  }
}
async function createEncryptionKeys(encrypt2, strength, password) {
  const salt = getRandomValues(new Uint8Array(SALT_LENGTH[strength]));
  const passwordVerification = await createKeys(encrypt2, strength, password, salt);
  return concat(salt, passwordVerification);
}
async function createKeys(aesCrypto, strength, password, salt) {
  aesCrypto.password = null;
  const baseKey = await importKey(RAW_FORMAT, password, BASE_KEY_ALGORITHM, false, DERIVED_BITS_USAGE);
  const derivedBits = await deriveBits(Object.assign({ salt }, DERIVED_BITS_ALGORITHM), baseKey, 8 * (KEY_LENGTH[strength] * 2 + 2));
  const compositeKey = new Uint8Array(derivedBits);
  const key = toBits(codecBytes, subarray(compositeKey, 0, KEY_LENGTH[strength]));
  const authentication = toBits(codecBytes, subarray(compositeKey, KEY_LENGTH[strength], KEY_LENGTH[strength] * 2));
  const passwordVerification = subarray(compositeKey, KEY_LENGTH[strength] * 2);
  Object.assign(aesCrypto, {
    keys: {
      key,
      authentication,
      passwordVerification
    },
    ctr: new CtrGladman(new Aes(key), Array.from(COUNTER_DEFAULT_VALUE)),
    hmac: new HmacSha1(authentication)
  });
  return passwordVerification;
}
async function importKey(format, password, algorithm, extractable, keyUsages) {
  if (IMPORT_KEY_SUPPORTED) {
    try {
      return await subtle.importKey(format, password, algorithm, extractable, keyUsages);
    } catch (_error) {
      IMPORT_KEY_SUPPORTED = false;
      return misc.importKey(password);
    }
  } else {
    return misc.importKey(password);
  }
}
async function deriveBits(algorithm, baseKey, length) {
  if (DERIVE_BITS_SUPPORTED) {
    try {
      return await subtle.deriveBits(algorithm, baseKey, length);
    } catch (_error) {
      DERIVE_BITS_SUPPORTED = false;
      return misc.pbkdf2(baseKey, algorithm.salt, DERIVED_BITS_ALGORITHM.iterations, length);
    }
  } else {
    return misc.pbkdf2(baseKey, algorithm.salt, DERIVED_BITS_ALGORITHM.iterations, length);
  }
}
function encodePassword(password, rawPassword) {
  if (rawPassword === UNDEFINED_VALUE) {
    return encodeText(password);
  } else {
    return rawPassword;
  }
}
function concat(leftArray, rightArray) {
  let array = leftArray;
  if (leftArray.length + rightArray.length) {
    array = new Uint8Array(leftArray.length + rightArray.length);
    array.set(leftArray, 0);
    array.set(rightArray, leftArray.length);
  }
  return array;
}
function expand(inputArray, length) {
  if (length && length > inputArray.length) {
    const array = inputArray;
    inputArray = new Uint8Array(length);
    inputArray.set(array, 0);
  }
  return inputArray;
}
function subarray(array, begin, end) {
  return array.subarray(begin, end);
}
function fromBits(codecBytes2, chunk) {
  return codecBytes2.fromBits(chunk);
}
function toBits(codecBytes2, chunk) {
  return codecBytes2.toBits(chunk);
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/streams/zip-crypto-stream.js
var HEADER_LENGTH = 12;
var ZipCryptoDecryptionStream = class extends TransformStream {
  constructor({ password, passwordVerification, checkPasswordOnly }) {
    super({
      start() {
        Object.assign(this, {
          password,
          passwordVerification
        });
        createKeys2(this, password);
      },
      transform(chunk, controller) {
        const zipCrypto = this;
        if (zipCrypto.password) {
          const decryptedHeader = decrypt(zipCrypto, chunk.subarray(0, HEADER_LENGTH));
          zipCrypto.password = null;
          if (decryptedHeader[HEADER_LENGTH - 1] != zipCrypto.passwordVerification) {
            throw new Error(ERR_INVALID_PASSWORD);
          }
          chunk = chunk.subarray(HEADER_LENGTH);
        }
        if (checkPasswordOnly) {
          controller.error(new Error(ERR_ABORT_CHECK_PASSWORD));
        } else {
          controller.enqueue(decrypt(zipCrypto, chunk));
        }
      }
    });
  }
};
var ZipCryptoEncryptionStream = class extends TransformStream {
  constructor({ password, passwordVerification }) {
    super({
      start() {
        Object.assign(this, {
          password,
          passwordVerification
        });
        createKeys2(this, password);
      },
      transform(chunk, controller) {
        const zipCrypto = this;
        let output;
        let offset;
        if (zipCrypto.password) {
          zipCrypto.password = null;
          const header = getRandomValues(new Uint8Array(HEADER_LENGTH));
          header[HEADER_LENGTH - 1] = zipCrypto.passwordVerification;
          output = new Uint8Array(chunk.length + header.length);
          output.set(encrypt(zipCrypto, header), 0);
          offset = HEADER_LENGTH;
        } else {
          output = new Uint8Array(chunk.length);
          offset = 0;
        }
        output.set(encrypt(zipCrypto, chunk), offset);
        controller.enqueue(output);
      }
    });
  }
};
function decrypt(target, input) {
  const output = new Uint8Array(input.length);
  for (let index = 0; index < input.length; index++) {
    output[index] = getByte(target) ^ input[index];
    updateKeys(target, output[index]);
  }
  return output;
}
function encrypt(target, input) {
  const output = new Uint8Array(input.length);
  for (let index = 0; index < input.length; index++) {
    output[index] = getByte(target) ^ input[index];
    updateKeys(target, input[index]);
  }
  return output;
}
function createKeys2(target, password) {
  const keys = [305419896, 591751049, 878082192];
  Object.assign(target, {
    keys,
    crcKey0: new Crc32(keys[0]),
    crcKey2: new Crc32(keys[2])
  });
  for (let index = 0; index < password.length; index++) {
    updateKeys(target, password.charCodeAt(index));
  }
}
function updateKeys(target, byte) {
  let [key0, key1, key2] = target.keys;
  target.crcKey0.append([byte]);
  key0 = ~target.crcKey0.get();
  key1 = getInt32(Math.imul(getInt32(key1 + getInt8(key0)), 134775813) + 1);
  target.crcKey2.append([key1 >>> 24]);
  key2 = ~target.crcKey2.get();
  target.keys = [key0, key1, key2];
}
function getByte(target) {
  const temp = target.keys[2] | 2;
  return getInt8(Math.imul(temp, temp ^ 1) >>> 8);
}
function getInt8(number) {
  return number & 255;
}
function getInt32(number) {
  return number & 4294967295;
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/streams/zip-entry-stream.js
var COMPRESSION_FORMAT = "deflate-raw";
var DeflateStream = class extends TransformStream {
  constructor(options, { chunkSize, CompressionStream: CompressionStream2, CompressionStreamNative }) {
    super({});
    const { compressed, encrypted, useCompressionStream, zipCrypto, signed, level } = options;
    const stream = this;
    let crc32Stream, encryptionStream;
    let readable = filterEmptyChunks(super.readable);
    if ((!encrypted || zipCrypto) && signed) {
      crc32Stream = new Crc32Stream();
      readable = pipeThrough(readable, crc32Stream);
    }
    if (compressed) {
      readable = pipeThroughCommpressionStream(readable, useCompressionStream, { level, chunkSize }, CompressionStreamNative, CompressionStream2);
    }
    if (encrypted) {
      if (zipCrypto) {
        readable = pipeThrough(readable, new ZipCryptoEncryptionStream(options));
      } else {
        encryptionStream = new AESEncryptionStream(options);
        readable = pipeThrough(readable, encryptionStream);
      }
    }
    setReadable(stream, readable, () => {
      let signature;
      if (encrypted && !zipCrypto) {
        signature = encryptionStream.signature;
      }
      if ((!encrypted || zipCrypto) && signed) {
        signature = new DataView(crc32Stream.value.buffer).getUint32(0);
      }
      stream.signature = signature;
    });
  }
};
var InflateStream = class extends TransformStream {
  constructor(options, { chunkSize, DecompressionStream: DecompressionStream2, DecompressionStreamNative }) {
    super({});
    const { zipCrypto, encrypted, signed, signature, compressed, useCompressionStream } = options;
    let crc32Stream, decryptionStream;
    let readable = filterEmptyChunks(super.readable);
    if (encrypted) {
      if (zipCrypto) {
        readable = pipeThrough(readable, new ZipCryptoDecryptionStream(options));
      } else {
        decryptionStream = new AESDecryptionStream(options);
        readable = pipeThrough(readable, decryptionStream);
      }
    }
    if (compressed) {
      readable = pipeThroughCommpressionStream(readable, useCompressionStream, { chunkSize }, DecompressionStreamNative, DecompressionStream2);
    }
    if ((!encrypted || zipCrypto) && signed) {
      crc32Stream = new Crc32Stream();
      readable = pipeThrough(readable, crc32Stream);
    }
    setReadable(this, readable, () => {
      if ((!encrypted || zipCrypto) && signed) {
        const dataViewSignature = new DataView(crc32Stream.value.buffer);
        if (signature != dataViewSignature.getUint32(0, false)) {
          throw new Error(ERR_INVALID_SIGNATURE);
        }
      }
    });
  }
};
function filterEmptyChunks(readable) {
  return pipeThrough(readable, new TransformStream({
    transform(chunk, controller) {
      if (chunk && chunk.length) {
        controller.enqueue(chunk);
      }
    }
  }));
}
function setReadable(stream, readable, flush) {
  readable = pipeThrough(readable, new TransformStream({ flush }));
  Object.defineProperty(stream, "readable", {
    get() {
      return readable;
    }
  });
}
function pipeThroughCommpressionStream(readable, useCompressionStream, options, CodecStreamNative, CodecStream2) {
  try {
    const CompressionStream2 = useCompressionStream && CodecStreamNative ? CodecStreamNative : CodecStream2;
    readable = pipeThrough(readable, new CompressionStream2(COMPRESSION_FORMAT, options));
  } catch (error) {
    if (useCompressionStream) {
      try {
        readable = pipeThrough(readable, new CodecStream2(COMPRESSION_FORMAT, options));
      } catch (error2) {
        return readable;
      }
    } else {
      return readable;
    }
  }
  return readable;
}
function pipeThrough(readable, transformStream) {
  return readable.pipeThrough(transformStream);
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/streams/codec-stream.js
var MESSAGE_EVENT_TYPE = "message";
var MESSAGE_START = "start";
var MESSAGE_PULL = "pull";
var MESSAGE_DATA = "data";
var MESSAGE_ACK_DATA = "ack";
var MESSAGE_CLOSE = "close";
var CODEC_DEFLATE = "deflate";
var CODEC_INFLATE = "inflate";
var CodecStream = class extends TransformStream {
  constructor(options, config2) {
    super({});
    const codec2 = this;
    const { codecType } = options;
    let Stream2;
    if (codecType.startsWith(CODEC_DEFLATE)) {
      Stream2 = DeflateStream;
    } else if (codecType.startsWith(CODEC_INFLATE)) {
      Stream2 = InflateStream;
    }
    let outputSize = 0;
    let inputSize = 0;
    const stream = new Stream2(options, config2);
    const readable = super.readable;
    const inputSizeStream = new TransformStream({
      transform(chunk, controller) {
        if (chunk && chunk.length) {
          inputSize += chunk.length;
          controller.enqueue(chunk);
        }
      },
      flush() {
        Object.assign(codec2, {
          inputSize
        });
      }
    });
    const outputSizeStream = new TransformStream({
      transform(chunk, controller) {
        if (chunk && chunk.length) {
          outputSize += chunk.length;
          controller.enqueue(chunk);
        }
      },
      flush() {
        const { signature } = stream;
        Object.assign(codec2, {
          signature,
          outputSize,
          inputSize
        });
      }
    });
    Object.defineProperty(codec2, "readable", {
      get() {
        return readable.pipeThrough(inputSizeStream).pipeThrough(stream).pipeThrough(outputSizeStream);
      }
    });
  }
};
var ChunkStream = class extends TransformStream {
  constructor(chunkSize) {
    let pendingChunk;
    super({
      transform,
      flush(controller) {
        if (pendingChunk && pendingChunk.length) {
          controller.enqueue(pendingChunk);
        }
      }
    });
    function transform(chunk, controller) {
      if (pendingChunk) {
        const newChunk = new Uint8Array(pendingChunk.length + chunk.length);
        newChunk.set(pendingChunk);
        newChunk.set(chunk, pendingChunk.length);
        chunk = newChunk;
        pendingChunk = null;
      }
      if (chunk.length > chunkSize) {
        controller.enqueue(chunk.slice(0, chunkSize));
        transform(chunk.slice(chunkSize), controller);
      } else {
        pendingChunk = chunk;
      }
    }
  }
};

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/codec-worker.js
var WEB_WORKERS_SUPPORTED = typeof Worker != UNDEFINED_TYPE;
var CodecWorker = class {
  constructor(workerData, { readable, writable }, { options, config: config2, streamOptions, useWebWorkers, transferStreams, scripts }, onTaskFinished) {
    const { signal } = streamOptions;
    Object.assign(workerData, {
      busy: true,
      readable: readable.pipeThrough(new ChunkStream(config2.chunkSize)).pipeThrough(new ProgressWatcherStream(readable, streamOptions), { signal }),
      writable,
      options: Object.assign({}, options),
      scripts,
      transferStreams,
      terminate() {
        return new Promise((resolve) => {
          const { worker, busy } = workerData;
          if (worker) {
            if (busy) {
              workerData.resolveTerminated = resolve;
            } else {
              worker.terminate();
              resolve();
            }
            workerData.interface = null;
          } else {
            resolve();
          }
        });
      },
      onTaskFinished() {
        const { resolveTerminated } = workerData;
        if (resolveTerminated) {
          workerData.resolveTerminated = null;
          workerData.terminated = true;
          workerData.worker.terminate();
          resolveTerminated();
        }
        workerData.busy = false;
        onTaskFinished(workerData);
      }
    });
    return (useWebWorkers && WEB_WORKERS_SUPPORTED ? createWebWorkerInterface : createWorkerInterface)(workerData, config2);
  }
};
var ProgressWatcherStream = class extends TransformStream {
  constructor(readableSource, { onstart, onprogress, size, onend }) {
    let chunkOffset = 0;
    super({
      async start() {
        if (onstart) {
          await callHandler(onstart, size);
        }
      },
      async transform(chunk, controller) {
        chunkOffset += chunk.length;
        if (onprogress) {
          await callHandler(onprogress, chunkOffset, size);
        }
        controller.enqueue(chunk);
      },
      async flush() {
        readableSource.size = chunkOffset;
        if (onend) {
          await callHandler(onend, chunkOffset);
        }
      }
    });
  }
};
async function callHandler(handler, ...parameters) {
  try {
    await handler(...parameters);
  } catch (_error) {
  }
}
function createWorkerInterface(workerData, config2) {
  return {
    run: () => runWorker(workerData, config2)
  };
}
function createWebWorkerInterface(workerData, config2) {
  const { baseURL: baseURL2, chunkSize } = config2;
  if (!workerData.interface) {
    let worker;
    try {
      worker = getWebWorker(workerData.scripts[0], baseURL2, workerData);
    } catch (error) {
      WEB_WORKERS_SUPPORTED = false;
      return createWorkerInterface(workerData, config2);
    }
    Object.assign(workerData, {
      worker,
      interface: {
        run: () => runWebWorker(workerData, { chunkSize })
      }
    });
  }
  return workerData.interface;
}
async function runWorker({ options, readable, writable, onTaskFinished }, config2) {
  try {
    const codecStream = new CodecStream(options, config2);
    await readable.pipeThrough(codecStream).pipeTo(writable, { preventClose: true, preventAbort: true });
    const {
      signature,
      inputSize,
      outputSize
    } = codecStream;
    return {
      signature,
      inputSize,
      outputSize
    };
  } finally {
    onTaskFinished();
  }
}
async function runWebWorker(workerData, config2) {
  let resolveResult, rejectResult;
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  Object.assign(workerData, {
    reader: null,
    writer: null,
    resolveResult,
    rejectResult,
    result
  });
  const { readable, options, scripts } = workerData;
  const { writable, closed } = watchClosedStream(workerData.writable);
  const streamsTransferred = sendMessage({
    type: MESSAGE_START,
    scripts: scripts.slice(1),
    options,
    config: config2,
    readable,
    writable
  }, workerData);
  if (!streamsTransferred) {
    Object.assign(workerData, {
      reader: readable.getReader(),
      writer: writable.getWriter()
    });
  }
  const resultValue = await result;
  if (!streamsTransferred) {
    await writable.getWriter().close();
  }
  await closed;
  return resultValue;
}
function watchClosedStream(writableSource) {
  let resolveStreamClosed;
  const closed = new Promise((resolve) => resolveStreamClosed = resolve);
  const writable = new WritableStream({
    async write(chunk) {
      const writer = writableSource.getWriter();
      await writer.ready;
      await writer.write(chunk);
      writer.releaseLock();
    },
    close() {
      resolveStreamClosed();
    },
    abort(reason) {
      const writer = writableSource.getWriter();
      return writer.abort(reason);
    }
  });
  return { writable, closed };
}
var classicWorkersSupported = true;
var transferStreamsSupported = true;
function getWebWorker(url, baseURL2, workerData) {
  const workerOptions = { type: "module" };
  let scriptUrl, worker;
  if (typeof url == FUNCTION_TYPE) {
    url = url();
  }
  try {
    scriptUrl = new URL(url, baseURL2);
  } catch (_error) {
    scriptUrl = url;
  }
  if (classicWorkersSupported) {
    try {
      worker = new Worker(scriptUrl);
    } catch (_error) {
      classicWorkersSupported = false;
      worker = new Worker(scriptUrl, workerOptions);
    }
  } else {
    worker = new Worker(scriptUrl, workerOptions);
  }
  worker.addEventListener(MESSAGE_EVENT_TYPE, (event) => onMessage(event, workerData));
  return worker;
}
function sendMessage(message, { worker, writer, onTaskFinished, transferStreams }) {
  try {
    let { value, readable, writable } = message;
    const transferables = [];
    if (value) {
      if (value.byteLength < value.buffer.byteLength) {
        message.value = value.buffer.slice(0, value.byteLength);
      } else {
        message.value = value.buffer;
      }
      transferables.push(message.value);
    }
    if (transferStreams && transferStreamsSupported) {
      if (readable) {
        transferables.push(readable);
      }
      if (writable) {
        transferables.push(writable);
      }
    } else {
      message.readable = message.writable = null;
    }
    if (transferables.length) {
      try {
        worker.postMessage(message, transferables);
        return true;
      } catch (_error) {
        transferStreamsSupported = false;
        message.readable = message.writable = null;
        worker.postMessage(message);
      }
    } else {
      worker.postMessage(message);
    }
  } catch (error) {
    if (writer) {
      writer.releaseLock();
    }
    onTaskFinished();
    throw error;
  }
}
async function onMessage({ data }, workerData) {
  const { type, value, messageId, result, error } = data;
  const { reader, writer, resolveResult, rejectResult, onTaskFinished } = workerData;
  try {
    if (error) {
      const { message, stack, code, name } = error;
      const responseError = new Error(message);
      Object.assign(responseError, { stack, code, name });
      close(responseError);
    } else {
      if (type == MESSAGE_PULL) {
        const { value: value2, done } = await reader.read();
        sendMessage({ type: MESSAGE_DATA, value: value2, done, messageId }, workerData);
      }
      if (type == MESSAGE_DATA) {
        await writer.ready;
        await writer.write(new Uint8Array(value));
        sendMessage({ type: MESSAGE_ACK_DATA, messageId }, workerData);
      }
      if (type == MESSAGE_CLOSE) {
        close(null, result);
      }
    }
  } catch (error2) {
    sendMessage({ type: MESSAGE_CLOSE, messageId }, workerData);
    close(error2);
  }
  function close(error2, result2) {
    if (error2) {
      rejectResult(error2);
    } else {
      resolveResult(result2);
    }
    if (writer) {
      writer.releaseLock();
    }
    onTaskFinished();
  }
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/codec-pool.js
var pool = [];
var pendingRequests = [];
var indexWorker = 0;
async function runWorker2(stream, workerOptions) {
  const { options, config: config2 } = workerOptions;
  const { transferStreams, useWebWorkers, useCompressionStream, codecType, compressed, signed, encrypted } = options;
  const { workerScripts, maxWorkers: maxWorkers2 } = config2;
  workerOptions.transferStreams = transferStreams || transferStreams === UNDEFINED_VALUE;
  const streamCopy = !compressed && !signed && !encrypted && !workerOptions.transferStreams;
  workerOptions.useWebWorkers = !streamCopy && (useWebWorkers || useWebWorkers === UNDEFINED_VALUE && config2.useWebWorkers);
  workerOptions.scripts = workerOptions.useWebWorkers && workerScripts ? workerScripts[codecType] : [];
  options.useCompressionStream = useCompressionStream || useCompressionStream === UNDEFINED_VALUE && config2.useCompressionStream;
  return (await getWorker()).run();
  async function getWorker() {
    const workerData = pool.find((workerData2) => !workerData2.busy);
    if (workerData) {
      clearTerminateTimeout(workerData);
      return new CodecWorker(workerData, stream, workerOptions, onTaskFinished);
    } else if (pool.length < maxWorkers2) {
      const workerData2 = { indexWorker };
      indexWorker++;
      pool.push(workerData2);
      return new CodecWorker(workerData2, stream, workerOptions, onTaskFinished);
    } else {
      return new Promise((resolve) => pendingRequests.push({ resolve, stream, workerOptions }));
    }
  }
  function onTaskFinished(workerData) {
    if (pendingRequests.length) {
      const [{ resolve, stream: stream2, workerOptions: workerOptions2 }] = pendingRequests.splice(0, 1);
      resolve(new CodecWorker(workerData, stream2, workerOptions2, onTaskFinished));
    } else if (workerData.worker) {
      clearTerminateTimeout(workerData);
      terminateWorker(workerData, workerOptions);
    } else {
      pool = pool.filter((data) => data != workerData);
    }
  }
}
function terminateWorker(workerData, workerOptions) {
  const { config: config2 } = workerOptions;
  const { terminateWorkerTimeout } = config2;
  if (Number.isFinite(terminateWorkerTimeout) && terminateWorkerTimeout >= 0) {
    if (workerData.terminated) {
      workerData.terminated = false;
    } else {
      workerData.terminateTimeout = setTimeout(async () => {
        pool = pool.filter((data) => data != workerData);
        try {
          await workerData.terminate();
        } catch (_error) {
        }
      }, terminateWorkerTimeout);
    }
  }
}
function clearTerminateTimeout(workerData) {
  const { terminateTimeout } = workerData;
  if (terminateTimeout) {
    clearTimeout(terminateTimeout);
    workerData.terminateTimeout = null;
  }
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/z-worker-inline.js
function e2(e3, t2 = {}) {
  const n2 = 'const{Array:e,Object:t,Number:n,Math:r,Error:s,Uint8Array:i,Uint16Array:o,Uint32Array:c,Int32Array:f,Map:a,DataView:l,Promise:u,TextEncoder:w,crypto:h,postMessage:d,TransformStream:p,ReadableStream:y,WritableStream:m,CompressionStream:b,DecompressionStream:g}=self,k=void 0,v="undefined",S="function";class z{constructor(e){return class extends p{constructor(t,n){const r=new e(n);super({transform(e,t){t.enqueue(r.append(e))},flush(e){const t=r.flush();t&&e.enqueue(t)}})}}}}const C=[];for(let e=0;256>e;e++){let t=e;for(let e=0;8>e;e++)1&t?t=t>>>1^3988292384:t>>>=1;C[e]=t}class x{constructor(e){this.t=e||-1}append(e){let t=0|this.t;for(let n=0,r=0|e.length;r>n;n++)t=t>>>8^C[255&(t^e[n])];this.t=t}get(){return~this.t}}class A extends p{constructor(){let e;const t=new x;super({transform(e,n){t.append(e),n.enqueue(e)},flush(){const n=new i(4);new l(n.buffer).setUint32(0,t.get()),e.value=n}}),e=this}}const _={concat(e,t){if(0===e.length||0===t.length)return e.concat(t);const n=e[e.length-1],r=_.i(n);return 32===r?e.concat(t):_.o(t,r,0|n,e.slice(0,e.length-1))},l(e){const t=e.length;if(0===t)return 0;const n=e[t-1];return 32*(t-1)+_.i(n)},u(e,t){if(32*e.length<t)return e;const n=(e=e.slice(0,r.ceil(t/32))).length;return t&=31,n>0&&t&&(e[n-1]=_.h(t,e[n-1]&2147483648>>t-1,1)),e},h:(e,t,n)=>32===e?t:(n?0|t:t<<32-e)+1099511627776*e,i:e=>r.round(e/1099511627776)||32,o(e,t,n,r){for(void 0===r&&(r=[]);t>=32;t-=32)r.push(n),n=0;if(0===t)return r.concat(e);for(let s=0;s<e.length;s++)r.push(n|e[s]>>>t),n=e[s]<<32-t;const s=e.length?e[e.length-1]:0,i=_.i(s);return r.push(_.h(t+i&31,t+i>32?n:r.pop(),1)),r}},I={p:{m(e){const t=_.l(e)/8,n=new i(t);let r;for(let s=0;t>s;s++)3&s||(r=e[s/4]),n[s]=r>>>24,r<<=8;return n},k(e){const t=[];let n,r=0;for(n=0;n<e.length;n++)r=r<<8|e[n],3&~n||(t.push(r),r=0);return 3&n&&t.push(_.h(8*(3&n),r)),t}}},P=class{constructor(e){const t=this;t.blockSize=512,t.v=[1732584193,4023233417,2562383102,271733878,3285377520],t.S=[1518500249,1859775393,2400959708,3395469782],e?(t.C=e.C.slice(0),t.A=e.A.slice(0),t._=e._):t.reset()}reset(){const e=this;return e.C=e.v.slice(0),e.A=[],e._=0,e}update(e){const t=this;"string"==typeof e&&(e=I.I.k(e));const n=t.A=_.concat(t.A,e),r=t._,i=t._=r+_.l(e);if(i>9007199254740991)throw new s("Cannot hash more than 2^53 - 1 bits");const o=new c(n);let f=0;for(let e=t.blockSize+r-(t.blockSize+r&t.blockSize-1);i>=e;e+=t.blockSize)t.P(o.subarray(16*f,16*(f+1))),f+=1;return n.splice(0,16*f),t}D(){const e=this;let t=e.A;const n=e.C;t=_.concat(t,[_.h(1,1)]);for(let e=t.length+2;15&e;e++)t.push(0);for(t.push(r.floor(e._/4294967296)),t.push(0|e._);t.length;)e.P(t.splice(0,16));return e.reset(),n}V(e,t,n,r){return e>19?e>39?e>59?e>79?void 0:t^n^r:t&n|t&r|n&r:t^n^r:t&n|~t&r}R(e,t){return t<<e|t>>>32-e}P(t){const n=this,s=n.C,i=e(80);for(let e=0;16>e;e++)i[e]=t[e];let o=s[0],c=s[1],f=s[2],a=s[3],l=s[4];for(let e=0;79>=e;e++){16>e||(i[e]=n.R(1,i[e-3]^i[e-8]^i[e-14]^i[e-16]));const t=n.R(5,o)+n.V(e,c,f,a)+l+i[e]+n.S[r.floor(e/20)]|0;l=a,a=f,f=n.R(30,c),c=o,o=t}s[0]=s[0]+o|0,s[1]=s[1]+c|0,s[2]=s[2]+f|0,s[3]=s[3]+a|0,s[4]=s[4]+l|0}},D={getRandomValues(e){const t=new c(e.buffer),n=e=>{let t=987654321;const n=4294967295;return()=>(t=36969*(65535&t)+(t>>16)&n,(((t<<16)+(e=18e3*(65535&e)+(e>>16)&n)&n)/4294967296+.5)*(r.random()>.5?1:-1))};for(let s,i=0;i<e.length;i+=4){const e=n(4294967296*(s||r.random()));s=987654071*e(),t[i/4]=4294967296*e()|0}return e}},V={importKey:e=>new V.B(I.p.k(e)),M(e,t,n,r){if(n=n||1e4,0>r||0>n)throw new s("invalid params to pbkdf2");const i=1+(r>>5)<<2;let o,c,f,a,u;const w=new ArrayBuffer(i),h=new l(w);let d=0;const p=_;for(t=I.p.k(t),u=1;(i||1)>d;u++){for(o=c=e.encrypt(p.concat(t,[u])),f=1;n>f;f++)for(c=e.encrypt(c),a=0;a<c.length;a++)o[a]^=c[a];for(f=0;(i||1)>d&&f<o.length;f++)h.setInt32(d,o[f]),d+=4}return w.slice(0,r/8)},B:class{constructor(e){const t=this,n=t.U=P,r=[[],[]];t.K=[new n,new n];const s=t.K[0].blockSize/32;e.length>s&&(e=(new n).update(e).D());for(let t=0;s>t;t++)r[0][t]=909522486^e[t],r[1][t]=1549556828^e[t];t.K[0].update(r[0]),t.K[1].update(r[1]),t.N=new n(t.K[0])}reset(){const e=this;e.N=new e.U(e.K[0]),e.O=!1}update(e){this.O=!0,this.N.update(e)}digest(){const e=this,t=e.N.D(),n=new e.U(e.K[1]).update(t).D();return e.reset(),n}encrypt(e){if(this.O)throw new s("encrypt on already updated hmac called!");return this.update(e),this.digest(e)}}},R=typeof h!=v&&typeof h.getRandomValues==S,B="Invalid password",E="Invalid signature",M="zipjs-abort-check-password";function U(e){return R?h.getRandomValues(e):D.getRandomValues(e)}const K=16,N={name:"PBKDF2"},O=t.assign({hash:{name:"HMAC"}},N),T=t.assign({iterations:1e3,hash:{name:"SHA-1"}},N),W=["deriveBits"],j=[8,12,16],H=[16,24,32],L=10,F=[0,0,0,0],q=typeof h!=v,G=q&&h.subtle,J=q&&typeof G!=v,Q=I.p,X=class{constructor(e){const t=this;t.T=[[[],[],[],[],[]],[[],[],[],[],[]]],t.T[0][0][0]||t.W();const n=t.T[0][4],r=t.T[1],i=e.length;let o,c,f,a=1;if(4!==i&&6!==i&&8!==i)throw new s("invalid aes key size");for(t.S=[c=e.slice(0),f=[]],o=i;4*i+28>o;o++){let e=c[o-1];(o%i==0||8===i&&o%i==4)&&(e=n[e>>>24]<<24^n[e>>16&255]<<16^n[e>>8&255]<<8^n[255&e],o%i==0&&(e=e<<8^e>>>24^a<<24,a=a<<1^283*(a>>7))),c[o]=c[o-i]^e}for(let e=0;o;e++,o--){const t=c[3&e?o:o-4];f[e]=4>=o||4>e?t:r[0][n[t>>>24]]^r[1][n[t>>16&255]]^r[2][n[t>>8&255]]^r[3][n[255&t]]}}encrypt(e){return this.j(e,0)}decrypt(e){return this.j(e,1)}W(){const e=this.T[0],t=this.T[1],n=e[4],r=t[4],s=[],i=[];let o,c,f,a;for(let e=0;256>e;e++)i[(s[e]=e<<1^283*(e>>7))^e]=e;for(let l=o=0;!n[l];l^=c||1,o=i[o]||1){let i=o^o<<1^o<<2^o<<3^o<<4;i=i>>8^255&i^99,n[l]=i,r[i]=l,a=s[f=s[c=s[l]]];let u=16843009*a^65537*f^257*c^16843008*l,w=257*s[i]^16843008*i;for(let n=0;4>n;n++)e[n][l]=w=w<<24^w>>>8,t[n][i]=u=u<<24^u>>>8}for(let n=0;5>n;n++)e[n]=e[n].slice(0),t[n]=t[n].slice(0)}j(e,t){if(4!==e.length)throw new s("invalid aes block size");const n=this.S[t],r=n.length/4-2,i=[0,0,0,0],o=this.T[t],c=o[0],f=o[1],a=o[2],l=o[3],u=o[4];let w,h,d,p=e[0]^n[0],y=e[t?3:1]^n[1],m=e[2]^n[2],b=e[t?1:3]^n[3],g=4;for(let e=0;r>e;e++)w=c[p>>>24]^f[y>>16&255]^a[m>>8&255]^l[255&b]^n[g],h=c[y>>>24]^f[m>>16&255]^a[b>>8&255]^l[255&p]^n[g+1],d=c[m>>>24]^f[b>>16&255]^a[p>>8&255]^l[255&y]^n[g+2],b=c[b>>>24]^f[p>>16&255]^a[y>>8&255]^l[255&m]^n[g+3],g+=4,p=w,y=h,m=d;for(let e=0;4>e;e++)i[t?3&-e:e]=u[p>>>24]<<24^u[y>>16&255]<<16^u[m>>8&255]<<8^u[255&b]^n[g++],w=p,p=y,y=m,m=b,b=w;return i}},Y=class{constructor(e,t){this.H=e,this.L=t,this.F=t}reset(){this.F=this.L}update(e){return this.q(this.H,e,this.F)}G(e){if(255&~(e>>24))e+=1<<24;else{let t=e>>16&255,n=e>>8&255,r=255&e;255===t?(t=0,255===n?(n=0,255===r?r=0:++r):++n):++t,e=0,e+=t<<16,e+=n<<8,e+=r}return e}J(e){0===(e[0]=this.G(e[0]))&&(e[1]=this.G(e[1]))}q(e,t,n){let r;if(!(r=t.length))return[];const s=_.l(t);for(let s=0;r>s;s+=4){this.J(n);const r=e.encrypt(n);t[s]^=r[0],t[s+1]^=r[1],t[s+2]^=r[2],t[s+3]^=r[3]}return _.u(t,s)}},Z=V.B;let $=q&&J&&typeof G.importKey==S,ee=q&&J&&typeof G.deriveBits==S;class te extends p{constructor({password:e,rawPassword:n,signed:r,encryptionStrength:o,checkPasswordOnly:c}){super({start(){t.assign(this,{ready:new u((e=>this.X=e)),password:ie(e,n),signed:r,Y:o-1,pending:new i})},async transform(e,t){const n=this,{password:r,Y:o,X:f,ready:a}=n;r?(await(async(e,t,n,r)=>{const i=await se(e,t,n,ce(r,0,j[t])),o=ce(r,j[t]);if(i[0]!=o[0]||i[1]!=o[1])throw new s(B)})(n,o,r,ce(e,0,j[o]+2)),e=ce(e,j[o]+2),c?t.error(new s(M)):f()):await a;const l=new i(e.length-L-(e.length-L)%K);t.enqueue(re(n,e,l,0,L,!0))},async flush(e){const{signed:t,Z:n,$:r,pending:o,ready:c}=this;if(r&&n){await c;const f=ce(o,0,o.length-L),a=ce(o,o.length-L);let l=new i;if(f.length){const e=ae(Q,f);r.update(e);const t=n.update(e);l=fe(Q,t)}if(t){const e=ce(fe(Q,r.digest()),0,L);for(let t=0;L>t;t++)if(e[t]!=a[t])throw new s(E)}e.enqueue(l)}}})}}class ne extends p{constructor({password:e,rawPassword:n,encryptionStrength:r}){let s;super({start(){t.assign(this,{ready:new u((e=>this.X=e)),password:ie(e,n),Y:r-1,pending:new i})},async transform(e,t){const n=this,{password:r,Y:s,X:o,ready:c}=n;let f=new i;r?(f=await(async(e,t,n)=>{const r=U(new i(j[t]));return oe(r,await se(e,t,n,r))})(n,s,r),o()):await c;const a=new i(f.length+e.length-e.length%K);a.set(f,0),t.enqueue(re(n,e,a,f.length,0))},async flush(e){const{Z:t,$:n,pending:r,ready:o}=this;if(n&&t){await o;let c=new i;if(r.length){const e=t.update(ae(Q,r));n.update(e),c=fe(Q,e)}s.signature=fe(Q,n.digest()).slice(0,L),e.enqueue(oe(c,s.signature))}}}),s=this}}function re(e,t,n,r,s,o){const{Z:c,$:f,pending:a}=e,l=t.length-s;let u;for(a.length&&(t=oe(a,t),n=((e,t)=>{if(t&&t>e.length){const n=e;(e=new i(t)).set(n,0)}return e})(n,l-l%K)),u=0;l-K>=u;u+=K){const e=ae(Q,ce(t,u,u+K));o&&f.update(e);const s=c.update(e);o||f.update(s),n.set(fe(Q,s),u+r)}return e.pending=ce(t,u),n}async function se(n,r,s,o){n.password=null;const c=await(async(e,t,n,r,s)=>{if(!$)return V.importKey(t);try{return await G.importKey("raw",t,n,!1,s)}catch(e){return $=!1,V.importKey(t)}})(0,s,O,0,W),f=await(async(e,t,n)=>{if(!ee)return V.M(t,e.salt,T.iterations,n);try{return await G.deriveBits(e,t,n)}catch(r){return ee=!1,V.M(t,e.salt,T.iterations,n)}})(t.assign({salt:o},T),c,8*(2*H[r]+2)),a=new i(f),l=ae(Q,ce(a,0,H[r])),u=ae(Q,ce(a,H[r],2*H[r])),w=ce(a,2*H[r]);return t.assign(n,{keys:{key:l,ee:u,passwordVerification:w},Z:new Y(new X(l),e.from(F)),$:new Z(u)}),w}function ie(e,t){return t===k?(e=>{if(typeof w==v){const t=new i((e=unescape(encodeURIComponent(e))).length);for(let n=0;n<t.length;n++)t[n]=e.charCodeAt(n);return t}return(new w).encode(e)})(e):t}function oe(e,t){let n=e;return e.length+t.length&&(n=new i(e.length+t.length),n.set(e,0),n.set(t,e.length)),n}function ce(e,t,n){return e.subarray(t,n)}function fe(e,t){return e.m(t)}function ae(e,t){return e.k(t)}class le extends p{constructor({password:e,passwordVerification:n,checkPasswordOnly:r}){super({start(){t.assign(this,{password:e,passwordVerification:n}),de(this,e)},transform(e,t){const n=this;if(n.password){const t=we(n,e.subarray(0,12));if(n.password=null,t[11]!=n.passwordVerification)throw new s(B);e=e.subarray(12)}r?t.error(new s(M)):t.enqueue(we(n,e))}})}}class ue extends p{constructor({password:e,passwordVerification:n}){super({start(){t.assign(this,{password:e,passwordVerification:n}),de(this,e)},transform(e,t){const n=this;let r,s;if(n.password){n.password=null;const t=U(new i(12));t[11]=n.passwordVerification,r=new i(e.length+t.length),r.set(he(n,t),0),s=12}else r=new i(e.length),s=0;r.set(he(n,e),s),t.enqueue(r)}})}}function we(e,t){const n=new i(t.length);for(let r=0;r<t.length;r++)n[r]=ye(e)^t[r],pe(e,n[r]);return n}function he(e,t){const n=new i(t.length);for(let r=0;r<t.length;r++)n[r]=ye(e)^t[r],pe(e,t[r]);return n}function de(e,n){const r=[305419896,591751049,878082192];t.assign(e,{keys:r,te:new x(r[0]),ne:new x(r[2])});for(let t=0;t<n.length;t++)pe(e,n.charCodeAt(t))}function pe(e,t){let[n,s,i]=e.keys;e.te.append([t]),n=~e.te.get(),s=be(r.imul(be(s+me(n)),134775813)+1),e.ne.append([s>>>24]),i=~e.ne.get(),e.keys=[n,s,i]}function ye(e){const t=2|e.keys[2];return me(r.imul(t,1^t)>>>8)}function me(e){return 255&e}function be(e){return 4294967295&e}const ge="deflate-raw";class ke extends p{constructor(e,{chunkSize:t,CompressionStream:n,CompressionStreamNative:r}){super({});const{compressed:s,encrypted:i,useCompressionStream:o,zipCrypto:c,signed:f,level:a}=e,u=this;let w,h,d=Se(super.readable);i&&!c||!f||(w=new A,d=xe(d,w)),s&&(d=Ce(d,o,{level:a,chunkSize:t},r,n)),i&&(c?d=xe(d,new ue(e)):(h=new ne(e),d=xe(d,h))),ze(u,d,(()=>{let e;i&&!c&&(e=h.signature),i&&!c||!f||(e=new l(w.value.buffer).getUint32(0)),u.signature=e}))}}class ve extends p{constructor(e,{chunkSize:t,DecompressionStream:n,DecompressionStreamNative:r}){super({});const{zipCrypto:i,encrypted:o,signed:c,signature:f,compressed:a,useCompressionStream:u}=e;let w,h,d=Se(super.readable);o&&(i?d=xe(d,new le(e)):(h=new te(e),d=xe(d,h))),a&&(d=Ce(d,u,{chunkSize:t},r,n)),o&&!i||!c||(w=new A,d=xe(d,w)),ze(this,d,(()=>{if((!o||i)&&c){const e=new l(w.value.buffer);if(f!=e.getUint32(0,!1))throw new s(E)}}))}}function Se(e){return xe(e,new p({transform(e,t){e&&e.length&&t.enqueue(e)}}))}function ze(e,n,r){n=xe(n,new p({flush:r})),t.defineProperty(e,"readable",{get:()=>n})}function Ce(e,t,n,r,s){try{e=xe(e,new(t&&r?r:s)(ge,n))}catch(r){if(!t)return e;try{e=xe(e,new s(ge,n))}catch(t){return e}}return e}function xe(e,t){return e.pipeThrough(t)}const Ae="data",_e="close";class Ie extends p{constructor(e,n){super({});const r=this,{codecType:s}=e;let i;s.startsWith("deflate")?i=ke:s.startsWith("inflate")&&(i=ve);let o=0,c=0;const f=new i(e,n),a=super.readable,l=new p({transform(e,t){e&&e.length&&(c+=e.length,t.enqueue(e))},flush(){t.assign(r,{inputSize:c})}}),u=new p({transform(e,t){e&&e.length&&(o+=e.length,t.enqueue(e))},flush(){const{signature:e}=f;t.assign(r,{signature:e,outputSize:o,inputSize:c})}});t.defineProperty(r,"readable",{get:()=>a.pipeThrough(l).pipeThrough(f).pipeThrough(u)})}}class Pe extends p{constructor(e){let t;super({transform:function n(r,s){if(t){const e=new i(t.length+r.length);e.set(t),e.set(r,t.length),r=e,t=null}r.length>e?(s.enqueue(r.slice(0,e)),n(r.slice(e),s)):t=r},flush(e){t&&t.length&&e.enqueue(t)}})}}const De=new a,Ve=new a;let Re,Be=0,Ee=!0;async function Me(e){try{const{options:t,scripts:r,config:s}=e;if(r&&r.length)try{Ee?importScripts.apply(k,r):await Ue(r)}catch(e){Ee=!1,await Ue(r)}self.initCodec&&self.initCodec(),s.CompressionStreamNative=self.CompressionStream,s.DecompressionStreamNative=self.DecompressionStream,self.Deflate&&(s.CompressionStream=new z(self.Deflate)),self.Inflate&&(s.DecompressionStream=new z(self.Inflate));const i={highWaterMark:1},o=e.readable||new y({async pull(e){const t=new u((e=>De.set(Be,e)));Ke({type:"pull",messageId:Be}),Be=(Be+1)%n.MAX_SAFE_INTEGER;const{value:r,done:s}=await t;e.enqueue(r),s&&e.close()}},i),c=e.writable||new m({async write(e){let t;const r=new u((e=>t=e));Ve.set(Be,t),Ke({type:Ae,value:e,messageId:Be}),Be=(Be+1)%n.MAX_SAFE_INTEGER,await r}},i),f=new Ie(t,s);Re=new AbortController;const{signal:a}=Re;await o.pipeThrough(f).pipeThrough(new Pe(s.chunkSize)).pipeTo(c,{signal:a,preventClose:!0,preventAbort:!0}),await c.getWriter().close();const{signature:l,inputSize:w,outputSize:h}=f;Ke({type:_e,result:{signature:l,inputSize:w,outputSize:h}})}catch(e){Ne(e)}}async function Ue(e){for(const t of e)await import(t)}function Ke(e){let{value:t}=e;if(t)if(t.length)try{t=new i(t),e.value=t.buffer,d(e,[e.value])}catch(t){d(e)}else d(e);else d(e)}function Ne(e=new s("Unknown error")){const{message:t,stack:n,code:r,name:i}=e;d({error:{message:t,stack:n,code:r,name:i}})}addEventListener("message",(({data:e})=>{const{type:t,messageId:n,value:r,done:s}=e;try{if("start"==t&&Me(e),t==Ae){const e=De.get(n);De.delete(n),e({value:new i(r),done:s})}if("ack"==t){const e=Ve.get(n);Ve.delete(n),e()}t==_e&&Re.abort()}catch(e){Ne(e)}}));const Oe=15,Te=573,We=-2;function je(t){return He(t.map((([t,n])=>new e(t).fill(n,0,t))))}function He(t){return t.reduce(((t,n)=>t.concat(e.isArray(n)?He(n):n)),[])}const Le=[0,1,2,3].concat(...je([[2,4],[2,5],[4,6],[4,7],[8,8],[8,9],[16,10],[16,11],[32,12],[32,13],[64,14],[64,15],[2,0],[1,16],[1,17],[2,18],[2,19],[4,20],[4,21],[8,22],[8,23],[16,24],[16,25],[32,26],[32,27],[64,28],[64,29]]));function Fe(){const e=this;function t(e,t){let n=0;do{n|=1&e,e>>>=1,n<<=1}while(--t>0);return n>>>1}e.re=n=>{const s=e.se,i=e.oe.ie,o=e.oe.ce;let c,f,a,l=-1;for(n.fe=0,n.ae=Te,c=0;o>c;c++)0!==s[2*c]?(n.le[++n.fe]=l=c,n.ue[c]=0):s[2*c+1]=0;for(;2>n.fe;)a=n.le[++n.fe]=2>l?++l:0,s[2*a]=1,n.ue[a]=0,n.we--,i&&(n.he-=i[2*a+1]);for(e.de=l,c=r.floor(n.fe/2);c>=1;c--)n.pe(s,c);a=o;do{c=n.le[1],n.le[1]=n.le[n.fe--],n.pe(s,1),f=n.le[1],n.le[--n.ae]=c,n.le[--n.ae]=f,s[2*a]=s[2*c]+s[2*f],n.ue[a]=r.max(n.ue[c],n.ue[f])+1,s[2*c+1]=s[2*f+1]=a,n.le[1]=a++,n.pe(s,1)}while(n.fe>=2);n.le[--n.ae]=n.le[1],(t=>{const n=e.se,r=e.oe.ie,s=e.oe.ye,i=e.oe.me,o=e.oe.be;let c,f,a,l,u,w,h=0;for(l=0;Oe>=l;l++)t.ge[l]=0;for(n[2*t.le[t.ae]+1]=0,c=t.ae+1;Te>c;c++)f=t.le[c],l=n[2*n[2*f+1]+1]+1,l>o&&(l=o,h++),n[2*f+1]=l,f>e.de||(t.ge[l]++,u=0,i>f||(u=s[f-i]),w=n[2*f],t.we+=w*(l+u),r&&(t.he+=w*(r[2*f+1]+u)));if(0!==h){do{for(l=o-1;0===t.ge[l];)l--;t.ge[l]--,t.ge[l+1]+=2,t.ge[o]--,h-=2}while(h>0);for(l=o;0!==l;l--)for(f=t.ge[l];0!==f;)a=t.le[--c],a>e.de||(n[2*a+1]!=l&&(t.we+=(l-n[2*a+1])*n[2*a],n[2*a+1]=l),f--)}})(n),((e,n,r)=>{const s=[];let i,o,c,f=0;for(i=1;Oe>=i;i++)s[i]=f=f+r[i-1]<<1;for(o=0;n>=o;o++)c=e[2*o+1],0!==c&&(e[2*o]=t(s[c]++,c))})(s,e.de,n.ge)}}function qe(e,t,n,r,s){const i=this;i.ie=e,i.ye=t,i.me=n,i.ce=r,i.be=s}Fe.ke=[0,1,2,3,4,5,6,7].concat(...je([[2,8],[2,9],[2,10],[2,11],[4,12],[4,13],[4,14],[4,15],[8,16],[8,17],[8,18],[8,19],[16,20],[16,21],[16,22],[16,23],[32,24],[32,25],[32,26],[31,27],[1,28]])),Fe.ve=[0,1,2,3,4,5,6,7,8,10,12,14,16,20,24,28,32,40,48,56,64,80,96,112,128,160,192,224,0],Fe.Se=[0,1,2,3,4,6,8,12,16,24,32,48,64,96,128,192,256,384,512,768,1024,1536,2048,3072,4096,6144,8192,12288,16384,24576],Fe.ze=e=>256>e?Le[e]:Le[256+(e>>>7)],Fe.Ce=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],Fe.xe=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],Fe.Ae=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7],Fe._e=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];const Ge=je([[144,8],[112,9],[24,7],[8,8]]);qe.Ie=He([12,140,76,204,44,172,108,236,28,156,92,220,60,188,124,252,2,130,66,194,34,162,98,226,18,146,82,210,50,178,114,242,10,138,74,202,42,170,106,234,26,154,90,218,58,186,122,250,6,134,70,198,38,166,102,230,22,150,86,214,54,182,118,246,14,142,78,206,46,174,110,238,30,158,94,222,62,190,126,254,1,129,65,193,33,161,97,225,17,145,81,209,49,177,113,241,9,137,73,201,41,169,105,233,25,153,89,217,57,185,121,249,5,133,69,197,37,165,101,229,21,149,85,213,53,181,117,245,13,141,77,205,45,173,109,237,29,157,93,221,61,189,125,253,19,275,147,403,83,339,211,467,51,307,179,435,115,371,243,499,11,267,139,395,75,331,203,459,43,299,171,427,107,363,235,491,27,283,155,411,91,347,219,475,59,315,187,443,123,379,251,507,7,263,135,391,71,327,199,455,39,295,167,423,103,359,231,487,23,279,151,407,87,343,215,471,55,311,183,439,119,375,247,503,15,271,143,399,79,335,207,463,47,303,175,431,111,367,239,495,31,287,159,415,95,351,223,479,63,319,191,447,127,383,255,511,0,64,32,96,16,80,48,112,8,72,40,104,24,88,56,120,4,68,36,100,20,84,52,116,3,131,67,195,35,163,99,227].map(((e,t)=>[e,Ge[t]])));const Je=je([[30,5]]);function Qe(e,t,n,r,s){const i=this;i.Pe=e,i.De=t,i.Ve=n,i.Re=r,i.Be=s}qe.Ee=He([0,16,8,24,4,20,12,28,2,18,10,26,6,22,14,30,1,17,9,25,5,21,13,29,3,19,11,27,7,23].map(((e,t)=>[e,Je[t]]))),qe.Me=new qe(qe.Ie,Fe.Ce,257,286,Oe),qe.Ue=new qe(qe.Ee,Fe.xe,0,30,Oe),qe.Ke=new qe(null,Fe.Ae,0,19,7);const Xe=[new Qe(0,0,0,0,0),new Qe(4,4,8,4,1),new Qe(4,5,16,8,1),new Qe(4,6,32,32,1),new Qe(4,4,16,16,2),new Qe(8,16,32,32,2),new Qe(8,16,128,128,2),new Qe(8,32,128,256,2),new Qe(32,128,258,1024,2),new Qe(32,258,258,4096,2)],Ye=["need dictionary","stream end","","","stream error","data error","","buffer error","",""],Ze=113,$e=666,et=262;function tt(e,t,n,r){const s=e[2*t],i=e[2*n];return i>s||s==i&&r[t]<=r[n]}function nt(){const e=this;let t,n,s,c,f,a,l,u,w,h,d,p,y,m,b,g,k,v,S,z,C,x,A,_,I,P,D,V,R,B,E,M,U;const K=new Fe,N=new Fe,O=new Fe;let T,W,j,H,L,F;function q(){let t;for(t=0;286>t;t++)E[2*t]=0;for(t=0;30>t;t++)M[2*t]=0;for(t=0;19>t;t++)U[2*t]=0;E[512]=1,e.we=e.he=0,W=j=0}function G(e,t){let n,r=-1,s=e[1],i=0,o=7,c=4;0===s&&(o=138,c=3),e[2*(t+1)+1]=65535;for(let f=0;t>=f;f++)n=s,s=e[2*(f+1)+1],++i<o&&n==s||(c>i?U[2*n]+=i:0!==n?(n!=r&&U[2*n]++,U[32]++):i>10?U[36]++:U[34]++,i=0,r=n,0===s?(o=138,c=3):n==s?(o=6,c=3):(o=7,c=4))}function J(t){e.Ne[e.pending++]=t}function Q(e){J(255&e),J(e>>>8&255)}function X(e,t){let n;const r=t;F>16-r?(n=e,L|=n<<F&65535,Q(L),L=n>>>16-F,F+=r-16):(L|=e<<F&65535,F+=r)}function Y(e,t){const n=2*e;X(65535&t[n],65535&t[n+1])}function Z(e,t){let n,r,s=-1,i=e[1],o=0,c=7,f=4;for(0===i&&(c=138,f=3),n=0;t>=n;n++)if(r=i,i=e[2*(n+1)+1],++o>=c||r!=i){if(f>o)do{Y(r,U)}while(0!=--o);else 0!==r?(r!=s&&(Y(r,U),o--),Y(16,U),X(o-3,2)):o>10?(Y(18,U),X(o-11,7)):(Y(17,U),X(o-3,3));o=0,s=r,0===i?(c=138,f=3):r==i?(c=6,f=3):(c=7,f=4)}}function $(){16==F?(Q(L),L=0,F=0):8>F||(J(255&L),L>>>=8,F-=8)}function ee(t,n){let s,i,o;if(e.Oe[W]=t,e.Te[W]=255&n,W++,0===t?E[2*n]++:(j++,t--,E[2*(Fe.ke[n]+256+1)]++,M[2*Fe.ze(t)]++),!(8191&W)&&D>2){for(s=8*W,i=C-k,o=0;30>o;o++)s+=M[2*o]*(5+Fe.xe[o]);if(s>>>=3,j<r.floor(W/2)&&s<r.floor(i/2))return!0}return W==T-1}function te(t,n){let r,s,i,o,c=0;if(0!==W)do{r=e.Oe[c],s=e.Te[c],c++,0===r?Y(s,t):(i=Fe.ke[s],Y(i+256+1,t),o=Fe.Ce[i],0!==o&&(s-=Fe.ve[i],X(s,o)),r--,i=Fe.ze(r),Y(i,n),o=Fe.xe[i],0!==o&&(r-=Fe.Se[i],X(r,o)))}while(W>c);Y(256,t),H=t[513]}function ne(){F>8?Q(L):F>0&&J(255&L),L=0,F=0}function re(t,n,r){X(0+(r?1:0),3),((t,n)=>{ne(),H=8,Q(n),Q(~n),e.Ne.set(u.subarray(t,t+n),e.pending),e.pending+=n})(t,n)}function se(n){((t,n,r)=>{let s,i,o=0;D>0?(K.re(e),N.re(e),o=(()=>{let t;for(G(E,K.de),G(M,N.de),O.re(e),t=18;t>=3&&0===U[2*Fe._e[t]+1];t--);return e.we+=14+3*(t+1),t})(),s=e.we+3+7>>>3,i=e.he+3+7>>>3,i>s||(s=i)):s=i=n+5,n+4>s||-1==t?i==s?(X(2+(r?1:0),3),te(qe.Ie,qe.Ee)):(X(4+(r?1:0),3),((e,t,n)=>{let r;for(X(e-257,5),X(t-1,5),X(n-4,4),r=0;n>r;r++)X(U[2*Fe._e[r]+1],3);Z(E,e-1),Z(M,t-1)})(K.de+1,N.de+1,o+1),te(E,M)):re(t,n,r),q(),r&&ne()})(0>k?-1:k,C-k,n),k=C,t.We()}function ie(){let e,n,r,s;do{if(s=w-A-C,0===s&&0===C&&0===A)s=f;else if(-1==s)s--;else if(C>=f+f-et){u.set(u.subarray(f,f+f),0),x-=f,C-=f,k-=f,e=y,r=e;do{n=65535&d[--r],d[r]=f>n?0:n-f}while(0!=--e);e=f,r=e;do{n=65535&h[--r],h[r]=f>n?0:n-f}while(0!=--e);s+=f}if(0===t.je)return;e=t.He(u,C+A,s),A+=e,3>A||(p=255&u[C],p=(p<<g^255&u[C+1])&b)}while(et>A&&0!==t.je)}function oe(e){let t,n,r=I,s=C,i=_;const o=C>f-et?C-(f-et):0;let c=B;const a=l,w=C+258;let d=u[s+i-1],p=u[s+i];R>_||(r>>=2),c>A&&(c=A);do{if(t=e,u[t+i]==p&&u[t+i-1]==d&&u[t]==u[s]&&u[++t]==u[s+1]){s+=2,t++;do{}while(u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&w>s);if(n=258-(w-s),s=w-258,n>i){if(x=e,i=n,n>=c)break;d=u[s+i-1],p=u[s+i]}}}while((e=65535&h[e&a])>o&&0!=--r);return i>A?A:i}e.ue=[],e.ge=[],e.le=[],E=[],M=[],U=[],e.pe=(t,n)=>{const r=e.le,s=r[n];let i=n<<1;for(;i<=e.fe&&(i<e.fe&&tt(t,r[i+1],r[i],e.ue)&&i++,!tt(t,s,r[i],e.ue));)r[n]=r[i],n=i,i<<=1;r[n]=s},e.Le=(t,S,x,W,j,G)=>(W||(W=8),j||(j=8),G||(G=0),t.Fe=null,-1==S&&(S=6),1>j||j>9||8!=W||9>x||x>15||0>S||S>9||0>G||G>2?We:(t.qe=e,a=x,f=1<<a,l=f-1,m=j+7,y=1<<m,b=y-1,g=r.floor((m+3-1)/3),u=new i(2*f),h=[],d=[],T=1<<j+6,e.Ne=new i(4*T),s=4*T,e.Oe=new o(T),e.Te=new i(T),D=S,V=G,(t=>(t.Ge=t.Je=0,t.Fe=null,e.pending=0,e.Qe=0,n=Ze,c=0,K.se=E,K.oe=qe.Me,N.se=M,N.oe=qe.Ue,O.se=U,O.oe=qe.Ke,L=0,F=0,H=8,q(),(()=>{w=2*f,d[y-1]=0;for(let e=0;y-1>e;e++)d[e]=0;P=Xe[D].De,R=Xe[D].Pe,B=Xe[D].Ve,I=Xe[D].Re,C=0,k=0,A=0,v=_=2,z=0,p=0})(),0))(t))),e.Xe=()=>42!=n&&n!=Ze&&n!=$e?We:(e.Te=null,e.Oe=null,e.Ne=null,d=null,h=null,u=null,e.qe=null,n==Ze?-3:0),e.Ye=(e,t,n)=>{let r=0;return-1==t&&(t=6),0>t||t>9||0>n||n>2?We:(Xe[D].Be!=Xe[t].Be&&0!==e.Ge&&(r=e.Ze(1)),D!=t&&(D=t,P=Xe[D].De,R=Xe[D].Pe,B=Xe[D].Ve,I=Xe[D].Re),V=n,r)},e.$e=(e,t,r)=>{let s,i=r,o=0;if(!t||42!=n)return We;if(3>i)return 0;for(i>f-et&&(i=f-et,o=r-i),u.set(t.subarray(o,o+i),0),C=i,k=i,p=255&u[0],p=(p<<g^255&u[1])&b,s=0;i-3>=s;s++)p=(p<<g^255&u[s+2])&b,h[s&l]=d[p],d[p]=s;return 0},e.Ze=(r,i)=>{let o,w,m,I,R;if(i>4||0>i)return We;if(!r.et||!r.tt&&0!==r.je||n==$e&&4!=i)return r.Fe=Ye[4],We;if(0===r.nt)return r.Fe=Ye[7],-5;var B;if(t=r,I=c,c=i,42==n&&(w=8+(a-8<<4)<<8,m=(D-1&255)>>1,m>3&&(m=3),w|=m<<6,0!==C&&(w|=32),w+=31-w%31,n=Ze,J((B=w)>>8&255),J(255&B)),0!==e.pending){if(t.We(),0===t.nt)return c=-1,0}else if(0===t.je&&I>=i&&4!=i)return t.Fe=Ye[7],-5;if(n==$e&&0!==t.je)return r.Fe=Ye[7],-5;if(0!==t.je||0!==A||0!=i&&n!=$e){switch(R=-1,Xe[D].Be){case 0:R=(e=>{let n,r=65535;for(r>s-5&&(r=s-5);;){if(1>=A){if(ie(),0===A&&0==e)return 0;if(0===A)break}if(C+=A,A=0,n=k+r,(0===C||C>=n)&&(A=C-n,C=n,se(!1),0===t.nt))return 0;if(C-k>=f-et&&(se(!1),0===t.nt))return 0}return se(4==e),0===t.nt?4==e?2:0:4==e?3:1})(i);break;case 1:R=(e=>{let n,r=0;for(;;){if(et>A){if(ie(),et>A&&0==e)return 0;if(0===A)break}if(3>A||(p=(p<<g^255&u[C+2])&b,r=65535&d[p],h[C&l]=d[p],d[p]=C),0===r||(C-r&65535)>f-et||2!=V&&(v=oe(r)),3>v)n=ee(0,255&u[C]),A--,C++;else if(n=ee(C-x,v-3),A-=v,v>P||3>A)C+=v,v=0,p=255&u[C],p=(p<<g^255&u[C+1])&b;else{v--;do{C++,p=(p<<g^255&u[C+2])&b,r=65535&d[p],h[C&l]=d[p],d[p]=C}while(0!=--v);C++}if(n&&(se(!1),0===t.nt))return 0}return se(4==e),0===t.nt?4==e?2:0:4==e?3:1})(i);break;case 2:R=(e=>{let n,r,s=0;for(;;){if(et>A){if(ie(),et>A&&0==e)return 0;if(0===A)break}if(3>A||(p=(p<<g^255&u[C+2])&b,s=65535&d[p],h[C&l]=d[p],d[p]=C),_=v,S=x,v=2,0!==s&&P>_&&f-et>=(C-s&65535)&&(2!=V&&(v=oe(s)),5>=v&&(1==V||3==v&&C-x>4096)&&(v=2)),3>_||v>_)if(0!==z){if(n=ee(0,255&u[C-1]),n&&se(!1),C++,A--,0===t.nt)return 0}else z=1,C++,A--;else{r=C+A-3,n=ee(C-1-S,_-3),A-=_-1,_-=2;do{++C>r||(p=(p<<g^255&u[C+2])&b,s=65535&d[p],h[C&l]=d[p],d[p]=C)}while(0!=--_);if(z=0,v=2,C++,n&&(se(!1),0===t.nt))return 0}}return 0!==z&&(n=ee(0,255&u[C-1]),z=0),se(4==e),0===t.nt?4==e?2:0:4==e?3:1})(i)}if(2!=R&&3!=R||(n=$e),0==R||2==R)return 0===t.nt&&(c=-1),0;if(1==R){if(1==i)X(2,3),Y(256,qe.Ie),$(),9>1+H+10-F&&(X(2,3),Y(256,qe.Ie),$()),H=7;else if(re(0,0,!1),3==i)for(o=0;y>o;o++)d[o]=0;if(t.We(),0===t.nt)return c=-1,0}}return 4!=i?0:1}}function rt(){const e=this;e.rt=0,e.st=0,e.je=0,e.Ge=0,e.nt=0,e.Je=0}function st(e){const t=new rt,n=(o=e&&e.chunkSize?e.chunkSize:65536)+5*(r.floor(o/16383)+1);var o;const c=new i(n);let f=e?e.level:-1;void 0===f&&(f=-1),t.Le(f),t.et=c,this.append=(e,r)=>{let o,f,a=0,l=0,u=0;const w=[];if(e.length){t.rt=0,t.tt=e,t.je=e.length;do{if(t.st=0,t.nt=n,o=t.Ze(0),0!=o)throw new s("deflating: "+t.Fe);t.st&&(t.st==n?w.push(new i(c)):w.push(c.subarray(0,t.st))),u+=t.st,r&&t.rt>0&&t.rt!=a&&(r(t.rt),a=t.rt)}while(t.je>0||0===t.nt);return w.length>1?(f=new i(u),w.forEach((e=>{f.set(e,l),l+=e.length}))):f=w[0]?new i(w[0]):new i,f}},this.flush=()=>{let e,r,o=0,f=0;const a=[];do{if(t.st=0,t.nt=n,e=t.Ze(4),1!=e&&0!=e)throw new s("deflating: "+t.Fe);n-t.nt>0&&a.push(c.slice(0,t.st)),f+=t.st}while(t.je>0||0===t.nt);return t.Xe(),r=new i(f),a.forEach((e=>{r.set(e,o),o+=e.length})),r}}rt.prototype={Le(e,t){const n=this;return n.qe=new nt,t||(t=Oe),n.qe.Le(n,e,t)},Ze(e){const t=this;return t.qe?t.qe.Ze(t,e):We},Xe(){const e=this;if(!e.qe)return We;const t=e.qe.Xe();return e.qe=null,t},Ye(e,t){const n=this;return n.qe?n.qe.Ye(n,e,t):We},$e(e,t){const n=this;return n.qe?n.qe.$e(n,e,t):We},He(e,t,n){const r=this;let s=r.je;return s>n&&(s=n),0===s?0:(r.je-=s,e.set(r.tt.subarray(r.rt,r.rt+s),t),r.rt+=s,r.Ge+=s,s)},We(){const e=this;let t=e.qe.pending;t>e.nt&&(t=e.nt),0!==t&&(e.et.set(e.qe.Ne.subarray(e.qe.Qe,e.qe.Qe+t),e.st),e.st+=t,e.qe.Qe+=t,e.Je+=t,e.nt-=t,e.qe.pending-=t,0===e.qe.pending&&(e.qe.Qe=0))}};const it=0,ot=1,ct=-2,ft=-3,at=-4,lt=-5,ut=[0,1,3,7,15,31,63,127,255,511,1023,2047,4095,8191,16383,32767,65535],wt=1440,ht=[96,7,256,0,8,80,0,8,16,84,8,115,82,7,31,0,8,112,0,8,48,0,9,192,80,7,10,0,8,96,0,8,32,0,9,160,0,8,0,0,8,128,0,8,64,0,9,224,80,7,6,0,8,88,0,8,24,0,9,144,83,7,59,0,8,120,0,8,56,0,9,208,81,7,17,0,8,104,0,8,40,0,9,176,0,8,8,0,8,136,0,8,72,0,9,240,80,7,4,0,8,84,0,8,20,85,8,227,83,7,43,0,8,116,0,8,52,0,9,200,81,7,13,0,8,100,0,8,36,0,9,168,0,8,4,0,8,132,0,8,68,0,9,232,80,7,8,0,8,92,0,8,28,0,9,152,84,7,83,0,8,124,0,8,60,0,9,216,82,7,23,0,8,108,0,8,44,0,9,184,0,8,12,0,8,140,0,8,76,0,9,248,80,7,3,0,8,82,0,8,18,85,8,163,83,7,35,0,8,114,0,8,50,0,9,196,81,7,11,0,8,98,0,8,34,0,9,164,0,8,2,0,8,130,0,8,66,0,9,228,80,7,7,0,8,90,0,8,26,0,9,148,84,7,67,0,8,122,0,8,58,0,9,212,82,7,19,0,8,106,0,8,42,0,9,180,0,8,10,0,8,138,0,8,74,0,9,244,80,7,5,0,8,86,0,8,22,192,8,0,83,7,51,0,8,118,0,8,54,0,9,204,81,7,15,0,8,102,0,8,38,0,9,172,0,8,6,0,8,134,0,8,70,0,9,236,80,7,9,0,8,94,0,8,30,0,9,156,84,7,99,0,8,126,0,8,62,0,9,220,82,7,27,0,8,110,0,8,46,0,9,188,0,8,14,0,8,142,0,8,78,0,9,252,96,7,256,0,8,81,0,8,17,85,8,131,82,7,31,0,8,113,0,8,49,0,9,194,80,7,10,0,8,97,0,8,33,0,9,162,0,8,1,0,8,129,0,8,65,0,9,226,80,7,6,0,8,89,0,8,25,0,9,146,83,7,59,0,8,121,0,8,57,0,9,210,81,7,17,0,8,105,0,8,41,0,9,178,0,8,9,0,8,137,0,8,73,0,9,242,80,7,4,0,8,85,0,8,21,80,8,258,83,7,43,0,8,117,0,8,53,0,9,202,81,7,13,0,8,101,0,8,37,0,9,170,0,8,5,0,8,133,0,8,69,0,9,234,80,7,8,0,8,93,0,8,29,0,9,154,84,7,83,0,8,125,0,8,61,0,9,218,82,7,23,0,8,109,0,8,45,0,9,186,0,8,13,0,8,141,0,8,77,0,9,250,80,7,3,0,8,83,0,8,19,85,8,195,83,7,35,0,8,115,0,8,51,0,9,198,81,7,11,0,8,99,0,8,35,0,9,166,0,8,3,0,8,131,0,8,67,0,9,230,80,7,7,0,8,91,0,8,27,0,9,150,84,7,67,0,8,123,0,8,59,0,9,214,82,7,19,0,8,107,0,8,43,0,9,182,0,8,11,0,8,139,0,8,75,0,9,246,80,7,5,0,8,87,0,8,23,192,8,0,83,7,51,0,8,119,0,8,55,0,9,206,81,7,15,0,8,103,0,8,39,0,9,174,0,8,7,0,8,135,0,8,71,0,9,238,80,7,9,0,8,95,0,8,31,0,9,158,84,7,99,0,8,127,0,8,63,0,9,222,82,7,27,0,8,111,0,8,47,0,9,190,0,8,15,0,8,143,0,8,79,0,9,254,96,7,256,0,8,80,0,8,16,84,8,115,82,7,31,0,8,112,0,8,48,0,9,193,80,7,10,0,8,96,0,8,32,0,9,161,0,8,0,0,8,128,0,8,64,0,9,225,80,7,6,0,8,88,0,8,24,0,9,145,83,7,59,0,8,120,0,8,56,0,9,209,81,7,17,0,8,104,0,8,40,0,9,177,0,8,8,0,8,136,0,8,72,0,9,241,80,7,4,0,8,84,0,8,20,85,8,227,83,7,43,0,8,116,0,8,52,0,9,201,81,7,13,0,8,100,0,8,36,0,9,169,0,8,4,0,8,132,0,8,68,0,9,233,80,7,8,0,8,92,0,8,28,0,9,153,84,7,83,0,8,124,0,8,60,0,9,217,82,7,23,0,8,108,0,8,44,0,9,185,0,8,12,0,8,140,0,8,76,0,9,249,80,7,3,0,8,82,0,8,18,85,8,163,83,7,35,0,8,114,0,8,50,0,9,197,81,7,11,0,8,98,0,8,34,0,9,165,0,8,2,0,8,130,0,8,66,0,9,229,80,7,7,0,8,90,0,8,26,0,9,149,84,7,67,0,8,122,0,8,58,0,9,213,82,7,19,0,8,106,0,8,42,0,9,181,0,8,10,0,8,138,0,8,74,0,9,245,80,7,5,0,8,86,0,8,22,192,8,0,83,7,51,0,8,118,0,8,54,0,9,205,81,7,15,0,8,102,0,8,38,0,9,173,0,8,6,0,8,134,0,8,70,0,9,237,80,7,9,0,8,94,0,8,30,0,9,157,84,7,99,0,8,126,0,8,62,0,9,221,82,7,27,0,8,110,0,8,46,0,9,189,0,8,14,0,8,142,0,8,78,0,9,253,96,7,256,0,8,81,0,8,17,85,8,131,82,7,31,0,8,113,0,8,49,0,9,195,80,7,10,0,8,97,0,8,33,0,9,163,0,8,1,0,8,129,0,8,65,0,9,227,80,7,6,0,8,89,0,8,25,0,9,147,83,7,59,0,8,121,0,8,57,0,9,211,81,7,17,0,8,105,0,8,41,0,9,179,0,8,9,0,8,137,0,8,73,0,9,243,80,7,4,0,8,85,0,8,21,80,8,258,83,7,43,0,8,117,0,8,53,0,9,203,81,7,13,0,8,101,0,8,37,0,9,171,0,8,5,0,8,133,0,8,69,0,9,235,80,7,8,0,8,93,0,8,29,0,9,155,84,7,83,0,8,125,0,8,61,0,9,219,82,7,23,0,8,109,0,8,45,0,9,187,0,8,13,0,8,141,0,8,77,0,9,251,80,7,3,0,8,83,0,8,19,85,8,195,83,7,35,0,8,115,0,8,51,0,9,199,81,7,11,0,8,99,0,8,35,0,9,167,0,8,3,0,8,131,0,8,67,0,9,231,80,7,7,0,8,91,0,8,27,0,9,151,84,7,67,0,8,123,0,8,59,0,9,215,82,7,19,0,8,107,0,8,43,0,9,183,0,8,11,0,8,139,0,8,75,0,9,247,80,7,5,0,8,87,0,8,23,192,8,0,83,7,51,0,8,119,0,8,55,0,9,207,81,7,15,0,8,103,0,8,39,0,9,175,0,8,7,0,8,135,0,8,71,0,9,239,80,7,9,0,8,95,0,8,31,0,9,159,84,7,99,0,8,127,0,8,63,0,9,223,82,7,27,0,8,111,0,8,47,0,9,191,0,8,15,0,8,143,0,8,79,0,9,255],dt=[80,5,1,87,5,257,83,5,17,91,5,4097,81,5,5,89,5,1025,85,5,65,93,5,16385,80,5,3,88,5,513,84,5,33,92,5,8193,82,5,9,90,5,2049,86,5,129,192,5,24577,80,5,2,87,5,385,83,5,25,91,5,6145,81,5,7,89,5,1537,85,5,97,93,5,24577,80,5,4,88,5,769,84,5,49,92,5,12289,82,5,13,90,5,3073,86,5,193,192,5,24577],pt=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0],yt=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,112,112],mt=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],bt=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],gt=15;function kt(){let e,t,n,r,s,i;function o(e,t,o,c,f,a,l,u,w,h,d){let p,y,m,b,g,k,v,S,z,C,x,A,_,I,P;C=0,g=o;do{n[e[t+C]]++,C++,g--}while(0!==g);if(n[0]==o)return l[0]=-1,u[0]=0,it;for(S=u[0],k=1;gt>=k&&0===n[k];k++);for(v=k,k>S&&(S=k),g=gt;0!==g&&0===n[g];g--);for(m=g,S>g&&(S=g),u[0]=S,I=1<<k;g>k;k++,I<<=1)if(0>(I-=n[k]))return ft;if(0>(I-=n[g]))return ft;for(n[g]+=I,i[1]=k=0,C=1,_=2;0!=--g;)i[_]=k+=n[C],_++,C++;g=0,C=0;do{0!==(k=e[t+C])&&(d[i[k]++]=g),C++}while(++g<o);for(o=i[m],i[0]=g=0,C=0,b=-1,A=-S,s[0]=0,x=0,P=0;m>=v;v++)for(p=n[v];0!=p--;){for(;v>A+S;){if(b++,A+=S,P=m-A,P=P>S?S:P,(y=1<<(k=v-A))>p+1&&(y-=p+1,_=v,P>k))for(;++k<P&&(y<<=1)>n[++_];)y-=n[_];if(P=1<<k,h[0]+P>wt)return ft;s[b]=x=h[0],h[0]+=P,0!==b?(i[b]=g,r[0]=k,r[1]=S,k=g>>>A-S,r[2]=x-s[b-1]-k,w.set(r,3*(s[b-1]+k))):l[0]=x}for(r[1]=v-A,o>C?d[C]<c?(r[0]=256>d[C]?0:96,r[2]=d[C++]):(r[0]=a[d[C]-c]+16+64,r[2]=f[d[C++]-c]):r[0]=192,y=1<<v-A,k=g>>>A;P>k;k+=y)w.set(r,3*(x+k));for(k=1<<v-1;g&k;k>>>=1)g^=k;for(g^=k,z=(1<<A)-1;(g&z)!=i[b];)b--,A-=S,z=(1<<A)-1}return 0!==I&&1!=m?lt:it}function c(o){let c;for(e||(e=[],t=[],n=new f(gt+1),r=[],s=new f(gt),i=new f(gt+1)),t.length<o&&(t=[]),c=0;o>c;c++)t[c]=0;for(c=0;gt+1>c;c++)n[c]=0;for(c=0;3>c;c++)r[c]=0;s.set(n.subarray(0,gt),0),i.set(n.subarray(0,gt+1),0)}this.it=(n,r,s,i,f)=>{let a;return c(19),e[0]=0,a=o(n,0,19,19,null,null,s,r,i,e,t),a==ft?f.Fe="oversubscribed dynamic bit lengths tree":a!=lt&&0!==r[0]||(f.Fe="incomplete dynamic bit lengths tree",a=ft),a},this.ot=(n,r,s,i,f,a,l,u,w)=>{let h;return c(288),e[0]=0,h=o(s,0,n,257,pt,yt,a,i,u,e,t),h!=it||0===i[0]?(h==ft?w.Fe="oversubscribed literal/length tree":h!=at&&(w.Fe="incomplete literal/length tree",h=ft),h):(c(288),h=o(s,n,r,0,mt,bt,l,f,u,e,t),h!=it||0===f[0]&&n>257?(h==ft?w.Fe="oversubscribed distance tree":h==lt?(w.Fe="incomplete distance tree",h=ft):h!=at&&(w.Fe="empty distance tree with lengths",h=ft),h):it)}}kt.ct=(e,t,n,r)=>(e[0]=9,t[0]=5,n[0]=ht,r[0]=dt,it);const vt=0,St=1,zt=2,Ct=3,xt=4,At=5,_t=6,It=7,Pt=8,Dt=9;function Vt(){const e=this;let t,n,r,s,i=0,o=0,c=0,f=0,a=0,l=0,u=0,w=0,h=0,d=0;function p(e,t,n,r,s,i,o,c){let f,a,l,u,w,h,d,p,y,m,b,g,k,v,S,z;d=c.rt,p=c.je,w=o.ft,h=o.lt,y=o.write,m=y<o.read?o.read-y-1:o.end-y,b=ut[e],g=ut[t];do{for(;20>h;)p--,w|=(255&c.ut(d++))<<h,h+=8;if(f=w&b,a=n,l=r,z=3*(l+f),0!==(u=a[z]))for(;;){if(w>>=a[z+1],h-=a[z+1],16&u){for(u&=15,k=a[z+2]+(w&ut[u]),w>>=u,h-=u;15>h;)p--,w|=(255&c.ut(d++))<<h,h+=8;for(f=w&g,a=s,l=i,z=3*(l+f),u=a[z];;){if(w>>=a[z+1],h-=a[z+1],16&u){for(u&=15;u>h;)p--,w|=(255&c.ut(d++))<<h,h+=8;if(v=a[z+2]+(w&ut[u]),w>>=u,h-=u,m-=k,v>y){S=y-v;do{S+=o.end}while(0>S);if(u=o.end-S,k>u){if(k-=u,y-S>0&&u>y-S)do{o.wt[y++]=o.wt[S++]}while(0!=--u);else o.wt.set(o.wt.subarray(S,S+u),y),y+=u,S+=u,u=0;S=0}}else S=y-v,y-S>0&&2>y-S?(o.wt[y++]=o.wt[S++],o.wt[y++]=o.wt[S++],k-=2):(o.wt.set(o.wt.subarray(S,S+2),y),y+=2,S+=2,k-=2);if(y-S>0&&k>y-S)do{o.wt[y++]=o.wt[S++]}while(0!=--k);else o.wt.set(o.wt.subarray(S,S+k),y),y+=k,S+=k,k=0;break}if(64&u)return c.Fe="invalid distance code",k=c.je-p,k=k>h>>3?h>>3:k,p+=k,d-=k,h-=k<<3,o.ft=w,o.lt=h,c.je=p,c.Ge+=d-c.rt,c.rt=d,o.write=y,ft;f+=a[z+2],f+=w&ut[u],z=3*(l+f),u=a[z]}break}if(64&u)return 32&u?(k=c.je-p,k=k>h>>3?h>>3:k,p+=k,d-=k,h-=k<<3,o.ft=w,o.lt=h,c.je=p,c.Ge+=d-c.rt,c.rt=d,o.write=y,ot):(c.Fe="invalid literal/length code",k=c.je-p,k=k>h>>3?h>>3:k,p+=k,d-=k,h-=k<<3,o.ft=w,o.lt=h,c.je=p,c.Ge+=d-c.rt,c.rt=d,o.write=y,ft);if(f+=a[z+2],f+=w&ut[u],z=3*(l+f),0===(u=a[z])){w>>=a[z+1],h-=a[z+1],o.wt[y++]=a[z+2],m--;break}}else w>>=a[z+1],h-=a[z+1],o.wt[y++]=a[z+2],m--}while(m>=258&&p>=10);return k=c.je-p,k=k>h>>3?h>>3:k,p+=k,d-=k,h-=k<<3,o.ft=w,o.lt=h,c.je=p,c.Ge+=d-c.rt,c.rt=d,o.write=y,it}e.init=(e,i,o,c,f,a)=>{t=vt,u=e,w=i,r=o,h=c,s=f,d=a,n=null},e.ht=(e,y,m)=>{let b,g,k,v,S,z,C,x=0,A=0,_=0;for(_=y.rt,v=y.je,x=e.ft,A=e.lt,S=e.write,z=S<e.read?e.read-S-1:e.end-S;;)switch(t){case vt:if(z>=258&&v>=10&&(e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,m=p(u,w,r,h,s,d,e,y),_=y.rt,v=y.je,x=e.ft,A=e.lt,S=e.write,z=S<e.read?e.read-S-1:e.end-S,m!=it)){t=m==ot?It:Dt;break}c=u,n=r,o=h,t=St;case St:for(b=c;b>A;){if(0===v)return e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m);m=it,v--,x|=(255&y.ut(_++))<<A,A+=8}if(g=3*(o+(x&ut[b])),x>>>=n[g+1],A-=n[g+1],k=n[g],0===k){f=n[g+2],t=_t;break}if(16&k){a=15&k,i=n[g+2],t=zt;break}if(!(64&k)){c=k,o=g/3+n[g+2];break}if(32&k){t=It;break}return t=Dt,y.Fe="invalid literal/length code",m=ft,e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m);case zt:for(b=a;b>A;){if(0===v)return e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m);m=it,v--,x|=(255&y.ut(_++))<<A,A+=8}i+=x&ut[b],x>>=b,A-=b,c=w,n=s,o=d,t=Ct;case Ct:for(b=c;b>A;){if(0===v)return e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m);m=it,v--,x|=(255&y.ut(_++))<<A,A+=8}if(g=3*(o+(x&ut[b])),x>>=n[g+1],A-=n[g+1],k=n[g],16&k){a=15&k,l=n[g+2],t=xt;break}if(!(64&k)){c=k,o=g/3+n[g+2];break}return t=Dt,y.Fe="invalid distance code",m=ft,e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m);case xt:for(b=a;b>A;){if(0===v)return e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m);m=it,v--,x|=(255&y.ut(_++))<<A,A+=8}l+=x&ut[b],x>>=b,A-=b,t=At;case At:for(C=S-l;0>C;)C+=e.end;for(;0!==i;){if(0===z&&(S==e.end&&0!==e.read&&(S=0,z=S<e.read?e.read-S-1:e.end-S),0===z&&(e.write=S,m=e.dt(y,m),S=e.write,z=S<e.read?e.read-S-1:e.end-S,S==e.end&&0!==e.read&&(S=0,z=S<e.read?e.read-S-1:e.end-S),0===z)))return e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m);e.wt[S++]=e.wt[C++],z--,C==e.end&&(C=0),i--}t=vt;break;case _t:if(0===z&&(S==e.end&&0!==e.read&&(S=0,z=S<e.read?e.read-S-1:e.end-S),0===z&&(e.write=S,m=e.dt(y,m),S=e.write,z=S<e.read?e.read-S-1:e.end-S,S==e.end&&0!==e.read&&(S=0,z=S<e.read?e.read-S-1:e.end-S),0===z)))return e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m);m=it,e.wt[S++]=f,z--,t=vt;break;case It:if(A>7&&(A-=8,v++,_--),e.write=S,m=e.dt(y,m),S=e.write,z=S<e.read?e.read-S-1:e.end-S,e.read!=e.write)return e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m);t=Pt;case Pt:return m=ot,e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m);case Dt:return m=ft,e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m);default:return m=ct,e.ft=x,e.lt=A,y.je=v,y.Ge+=_-y.rt,y.rt=_,e.write=S,e.dt(y,m)}},e.yt=()=>{}}const Rt=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],Bt=0,Et=1,Mt=2,Ut=3,Kt=4,Nt=5,Ot=6,Tt=7,Wt=8,jt=9;function Ht(e,t){const n=this;let r,s=Bt,o=0,c=0,a=0;const l=[0],u=[0],w=new Vt;let h=0,d=new f(3*wt);const p=new kt;n.lt=0,n.ft=0,n.wt=new i(t),n.end=t,n.read=0,n.write=0,n.reset=(e,t)=>{t&&(t[0]=0),s==Ot&&w.yt(e),s=Bt,n.lt=0,n.ft=0,n.read=n.write=0},n.reset(e,null),n.dt=(e,t)=>{let r,s,i;return s=e.st,i=n.read,r=(i>n.write?n.end:n.write)-i,r>e.nt&&(r=e.nt),0!==r&&t==lt&&(t=it),e.nt-=r,e.Je+=r,e.et.set(n.wt.subarray(i,i+r),s),s+=r,i+=r,i==n.end&&(i=0,n.write==n.end&&(n.write=0),r=n.write-i,r>e.nt&&(r=e.nt),0!==r&&t==lt&&(t=it),e.nt-=r,e.Je+=r,e.et.set(n.wt.subarray(i,i+r),s),s+=r,i+=r),e.st=s,n.read=i,t},n.ht=(e,t)=>{let i,f,y,m,b,g,k,v;for(m=e.rt,b=e.je,f=n.ft,y=n.lt,g=n.write,k=g<n.read?n.read-g-1:n.end-g;;){let S,z,C,x,A,_,I,P;switch(s){case Bt:for(;3>y;){if(0===b)return n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);t=it,b--,f|=(255&e.ut(m++))<<y,y+=8}switch(i=7&f,h=1&i,i>>>1){case 0:f>>>=3,y-=3,i=7&y,f>>>=i,y-=i,s=Et;break;case 1:S=[],z=[],C=[[]],x=[[]],kt.ct(S,z,C,x),w.init(S[0],z[0],C[0],0,x[0],0),f>>>=3,y-=3,s=Ot;break;case 2:f>>>=3,y-=3,s=Ut;break;case 3:return f>>>=3,y-=3,s=jt,e.Fe="invalid block type",t=ft,n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t)}break;case Et:for(;32>y;){if(0===b)return n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);t=it,b--,f|=(255&e.ut(m++))<<y,y+=8}if((~f>>>16&65535)!=(65535&f))return s=jt,e.Fe="invalid stored block lengths",t=ft,n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);o=65535&f,f=y=0,s=0!==o?Mt:0!==h?Tt:Bt;break;case Mt:if(0===b)return n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);if(0===k&&(g==n.end&&0!==n.read&&(g=0,k=g<n.read?n.read-g-1:n.end-g),0===k&&(n.write=g,t=n.dt(e,t),g=n.write,k=g<n.read?n.read-g-1:n.end-g,g==n.end&&0!==n.read&&(g=0,k=g<n.read?n.read-g-1:n.end-g),0===k)))return n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);if(t=it,i=o,i>b&&(i=b),i>k&&(i=k),n.wt.set(e.He(m,i),g),m+=i,b-=i,g+=i,k-=i,0!=(o-=i))break;s=0!==h?Tt:Bt;break;case Ut:for(;14>y;){if(0===b)return n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);t=it,b--,f|=(255&e.ut(m++))<<y,y+=8}if(c=i=16383&f,(31&i)>29||(i>>5&31)>29)return s=jt,e.Fe="too many length or distance symbols",t=ft,n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);if(i=258+(31&i)+(i>>5&31),!r||r.length<i)r=[];else for(v=0;i>v;v++)r[v]=0;f>>>=14,y-=14,a=0,s=Kt;case Kt:for(;4+(c>>>10)>a;){for(;3>y;){if(0===b)return n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);t=it,b--,f|=(255&e.ut(m++))<<y,y+=8}r[Rt[a++]]=7&f,f>>>=3,y-=3}for(;19>a;)r[Rt[a++]]=0;if(l[0]=7,i=p.it(r,l,u,d,e),i!=it)return(t=i)==ft&&(r=null,s=jt),n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);a=0,s=Nt;case Nt:for(;i=c,258+(31&i)+(i>>5&31)>a;){let o,w;for(i=l[0];i>y;){if(0===b)return n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);t=it,b--,f|=(255&e.ut(m++))<<y,y+=8}if(i=d[3*(u[0]+(f&ut[i]))+1],w=d[3*(u[0]+(f&ut[i]))+2],16>w)f>>>=i,y-=i,r[a++]=w;else{for(v=18==w?7:w-14,o=18==w?11:3;i+v>y;){if(0===b)return n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);t=it,b--,f|=(255&e.ut(m++))<<y,y+=8}if(f>>>=i,y-=i,o+=f&ut[v],f>>>=v,y-=v,v=a,i=c,v+o>258+(31&i)+(i>>5&31)||16==w&&1>v)return r=null,s=jt,e.Fe="invalid bit length repeat",t=ft,n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);w=16==w?r[v-1]:0;do{r[v++]=w}while(0!=--o);a=v}}if(u[0]=-1,A=[],_=[],I=[],P=[],A[0]=9,_[0]=6,i=c,i=p.ot(257+(31&i),1+(i>>5&31),r,A,_,I,P,d,e),i!=it)return i==ft&&(r=null,s=jt),t=i,n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);w.init(A[0],_[0],d,I[0],d,P[0]),s=Ot;case Ot:if(n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,(t=w.ht(n,e,t))!=ot)return n.dt(e,t);if(t=it,w.yt(e),m=e.rt,b=e.je,f=n.ft,y=n.lt,g=n.write,k=g<n.read?n.read-g-1:n.end-g,0===h){s=Bt;break}s=Tt;case Tt:if(n.write=g,t=n.dt(e,t),g=n.write,k=g<n.read?n.read-g-1:n.end-g,n.read!=n.write)return n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);s=Wt;case Wt:return t=ot,n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);case jt:return t=ft,n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t);default:return t=ct,n.ft=f,n.lt=y,e.je=b,e.Ge+=m-e.rt,e.rt=m,n.write=g,n.dt(e,t)}}},n.yt=e=>{n.reset(e,null),n.wt=null,d=null},n.bt=(e,t,r)=>{n.wt.set(e.subarray(t,t+r),0),n.read=n.write=r},n.gt=()=>s==Et?1:0}const Lt=13,Ft=[0,0,255,255];function qt(){const e=this;function t(e){return e&&e.kt?(e.Ge=e.Je=0,e.Fe=null,e.kt.mode=7,e.kt.vt.reset(e,null),it):ct}e.mode=0,e.method=0,e.St=[0],e.zt=0,e.marker=0,e.Ct=0,e.xt=t=>(e.vt&&e.vt.yt(t),e.vt=null,it),e.At=(n,r)=>(n.Fe=null,e.vt=null,8>r||r>15?(e.xt(n),ct):(e.Ct=r,n.kt.vt=new Ht(n,1<<r),t(n),it)),e._t=(e,t)=>{let n,r;if(!e||!e.kt||!e.tt)return ct;const s=e.kt;for(t=4==t?lt:it,n=lt;;)switch(s.mode){case 0:if(0===e.je)return n;if(n=t,e.je--,e.Ge++,8!=(15&(s.method=e.ut(e.rt++)))){s.mode=Lt,e.Fe="unknown compression method",s.marker=5;break}if(8+(s.method>>4)>s.Ct){s.mode=Lt,e.Fe="invalid win size",s.marker=5;break}s.mode=1;case 1:if(0===e.je)return n;if(n=t,e.je--,e.Ge++,r=255&e.ut(e.rt++),((s.method<<8)+r)%31!=0){s.mode=Lt,e.Fe="incorrect header check",s.marker=5;break}if(!(32&r)){s.mode=7;break}s.mode=2;case 2:if(0===e.je)return n;n=t,e.je--,e.Ge++,s.zt=(255&e.ut(e.rt++))<<24&4278190080,s.mode=3;case 3:if(0===e.je)return n;n=t,e.je--,e.Ge++,s.zt+=(255&e.ut(e.rt++))<<16&16711680,s.mode=4;case 4:if(0===e.je)return n;n=t,e.je--,e.Ge++,s.zt+=(255&e.ut(e.rt++))<<8&65280,s.mode=5;case 5:return 0===e.je?n:(n=t,e.je--,e.Ge++,s.zt+=255&e.ut(e.rt++),s.mode=6,2);case 6:return s.mode=Lt,e.Fe="need dictionary",s.marker=0,ct;case 7:if(n=s.vt.ht(e,n),n==ft){s.mode=Lt,s.marker=0;break}if(n==it&&(n=t),n!=ot)return n;n=t,s.vt.reset(e,s.St),s.mode=12;case 12:return e.je=0,ot;case Lt:return ft;default:return ct}},e.It=(e,t,n)=>{let r=0,s=n;if(!e||!e.kt||6!=e.kt.mode)return ct;const i=e.kt;return s<1<<i.Ct||(s=(1<<i.Ct)-1,r=n-s),i.vt.bt(t,r,s),i.mode=7,it},e.Pt=e=>{let n,r,s,i,o;if(!e||!e.kt)return ct;const c=e.kt;if(c.mode!=Lt&&(c.mode=Lt,c.marker=0),0===(n=e.je))return lt;for(r=e.rt,s=c.marker;0!==n&&4>s;)e.ut(r)==Ft[s]?s++:s=0!==e.ut(r)?0:4-s,r++,n--;return e.Ge+=r-e.rt,e.rt=r,e.je=n,c.marker=s,4!=s?ft:(i=e.Ge,o=e.Je,t(e),e.Ge=i,e.Je=o,c.mode=7,it)},e.Dt=e=>e&&e.kt&&e.kt.vt?e.kt.vt.gt():ct}function Gt(){}function Jt(e){const t=new Gt,n=e&&e.chunkSize?r.floor(2*e.chunkSize):131072,o=new i(n);let c=!1;t.At(),t.et=o,this.append=(e,r)=>{const f=[];let a,l,u=0,w=0,h=0;if(0!==e.length){t.rt=0,t.tt=e,t.je=e.length;do{if(t.st=0,t.nt=n,0!==t.je||c||(t.rt=0,c=!0),a=t._t(0),c&&a===lt){if(0!==t.je)throw new s("inflating: bad input")}else if(a!==it&&a!==ot)throw new s("inflating: "+t.Fe);if((c||a===ot)&&t.je===e.length)throw new s("inflating: bad input");t.st&&(t.st===n?f.push(new i(o)):f.push(o.subarray(0,t.st))),h+=t.st,r&&t.rt>0&&t.rt!=u&&(r(t.rt),u=t.rt)}while(t.je>0||0===t.nt);return f.length>1?(l=new i(h),f.forEach((e=>{l.set(e,w),w+=e.length}))):l=f[0]?new i(f[0]):new i,l}},this.flush=()=>{t.xt()}}Gt.prototype={At(e){const t=this;return t.kt=new qt,e||(e=15),t.kt.At(t,e)},_t(e){const t=this;return t.kt?t.kt._t(t,e):ct},xt(){const e=this;if(!e.kt)return ct;const t=e.kt.xt(e);return e.kt=null,t},Pt(){const e=this;return e.kt?e.kt.Pt(e):ct},It(e,t){const n=this;return n.kt?n.kt.It(n,e,t):ct},ut(e){return this.tt[e]},He(e,t){return this.tt.subarray(e,e+t)}},self.initCodec=()=>{self.Deflate=st,self.Inflate=Jt};\n', r2 = () => t2.useDataURI ? "data:text/javascript," + encodeURIComponent(n2) : URL.createObjectURL(new Blob([n2], { type: "text/javascript" }));
  e3({ workerScripts: { inflate: [r2], deflate: [r2] } });
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/io.js
var ERR_HTTP_STATUS = "HTTP error ";
var ERR_HTTP_RANGE = "HTTP Range not supported";
var ERR_ITERATOR_COMPLETED_TOO_SOON = "Writer iterator completed too soon";
var CONTENT_TYPE_TEXT_PLAIN = "text/plain";
var HTTP_HEADER_CONTENT_LENGTH = "Content-Length";
var HTTP_HEADER_CONTENT_RANGE = "Content-Range";
var HTTP_HEADER_ACCEPT_RANGES = "Accept-Ranges";
var HTTP_HEADER_RANGE = "Range";
var HTTP_HEADER_CONTENT_TYPE = "Content-Type";
var HTTP_METHOD_HEAD = "HEAD";
var HTTP_METHOD_GET = "GET";
var HTTP_RANGE_UNIT = "bytes";
var DEFAULT_CHUNK_SIZE = 64 * 1024;
var PROPERTY_NAME_WRITABLE = "writable";
var Stream = class {
  constructor() {
    this.size = 0;
  }
  init() {
    this.initialized = true;
  }
};
var Reader = class extends Stream {
  get readable() {
    const reader = this;
    const { chunkSize = DEFAULT_CHUNK_SIZE } = reader;
    const readable = new ReadableStream({
      start() {
        this.chunkOffset = 0;
      },
      async pull(controller) {
        const { offset = 0, size, diskNumberStart } = readable;
        const { chunkOffset } = this;
        controller.enqueue(await readUint8Array(reader, offset + chunkOffset, Math.min(chunkSize, size - chunkOffset), diskNumberStart));
        if (chunkOffset + chunkSize > size) {
          controller.close();
        } else {
          this.chunkOffset += chunkSize;
        }
      }
    });
    return readable;
  }
};
var Writer = class extends Stream {
  constructor() {
    super();
    const writer = this;
    const writable = new WritableStream({
      write(chunk) {
        return writer.writeUint8Array(chunk);
      }
    });
    Object.defineProperty(writer, PROPERTY_NAME_WRITABLE, {
      get() {
        return writable;
      }
    });
  }
  writeUint8Array() {
  }
};
var Data64URIReader = class extends Reader {
  constructor(dataURI) {
    super();
    let dataEnd = dataURI.length;
    while (dataURI.charAt(dataEnd - 1) == "=") {
      dataEnd--;
    }
    const dataStart = dataURI.indexOf(",") + 1;
    Object.assign(this, {
      dataURI,
      dataStart,
      size: Math.floor((dataEnd - dataStart) * 0.75)
    });
  }
  readUint8Array(offset, length) {
    const {
      dataStart,
      dataURI
    } = this;
    const dataArray = new Uint8Array(length);
    const start = Math.floor(offset / 3) * 4;
    const bytes = atob(dataURI.substring(start + dataStart, Math.ceil((offset + length) / 3) * 4 + dataStart));
    const delta = offset - Math.floor(start / 4) * 3;
    for (let indexByte = delta; indexByte < delta + length; indexByte++) {
      dataArray[indexByte - delta] = bytes.charCodeAt(indexByte);
    }
    return dataArray;
  }
};
var Data64URIWriter = class extends Writer {
  constructor(contentType) {
    super();
    Object.assign(this, {
      data: "data:" + (contentType || "") + ";base64,",
      pending: []
    });
  }
  writeUint8Array(array) {
    const writer = this;
    let indexArray = 0;
    let dataString = writer.pending;
    const delta = writer.pending.length;
    writer.pending = "";
    for (indexArray = 0; indexArray < Math.floor((delta + array.length) / 3) * 3 - delta; indexArray++) {
      dataString += String.fromCharCode(array[indexArray]);
    }
    for (; indexArray < array.length; indexArray++) {
      writer.pending += String.fromCharCode(array[indexArray]);
    }
    if (dataString.length > 2) {
      writer.data += btoa(dataString);
    } else {
      writer.pending = dataString;
    }
  }
  getData() {
    return this.data + btoa(this.pending);
  }
};
var BlobReader = class extends Reader {
  constructor(blob) {
    super();
    Object.assign(this, {
      blob,
      size: blob.size
    });
  }
  async readUint8Array(offset, length) {
    const reader = this;
    const offsetEnd = offset + length;
    const blob = offset || offsetEnd < reader.size ? reader.blob.slice(offset, offsetEnd) : reader.blob;
    let arrayBuffer = await blob.arrayBuffer();
    if (arrayBuffer.byteLength > length) {
      arrayBuffer = arrayBuffer.slice(offset, offsetEnd);
    }
    return new Uint8Array(arrayBuffer);
  }
};
var BlobWriter = class extends Stream {
  constructor(contentType) {
    super();
    const writer = this;
    const transformStream = new TransformStream();
    const headers = [];
    if (contentType) {
      headers.push([HTTP_HEADER_CONTENT_TYPE, contentType]);
    }
    Object.defineProperty(writer, PROPERTY_NAME_WRITABLE, {
      get() {
        return transformStream.writable;
      }
    });
    writer.blob = new Response(transformStream.readable, { headers }).blob();
  }
  getData() {
    return this.blob;
  }
};
var TextReader = class extends BlobReader {
  constructor(text) {
    super(new Blob([text], { type: CONTENT_TYPE_TEXT_PLAIN }));
  }
};
var TextWriter = class extends BlobWriter {
  constructor(encoding) {
    super(encoding);
    Object.assign(this, {
      encoding,
      utf8: !encoding || encoding.toLowerCase() == "utf-8"
    });
  }
  async getData() {
    const {
      encoding,
      utf8
    } = this;
    const blob = await super.getData();
    if (blob.text && utf8) {
      return blob.text();
    } else {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        Object.assign(reader, {
          onload: ({ target }) => resolve(target.result),
          onerror: () => reject(reader.error)
        });
        reader.readAsText(blob, encoding);
      });
    }
  }
};
var FetchReader = class extends Reader {
  constructor(url, options) {
    super();
    createHttpReader(this, url, options);
  }
  async init() {
    await initHttpReader(this, sendFetchRequest, getFetchRequestData);
    super.init();
  }
  readUint8Array(index, length) {
    return readUint8ArrayHttpReader(this, index, length, sendFetchRequest, getFetchRequestData);
  }
};
var XHRReader = class extends Reader {
  constructor(url, options) {
    super();
    createHttpReader(this, url, options);
  }
  async init() {
    await initHttpReader(this, sendXMLHttpRequest, getXMLHttpRequestData);
    super.init();
  }
  readUint8Array(index, length) {
    return readUint8ArrayHttpReader(this, index, length, sendXMLHttpRequest, getXMLHttpRequestData);
  }
};
function createHttpReader(httpReader, url, options) {
  const {
    preventHeadRequest,
    useRangeHeader,
    forceRangeRequests,
    combineSizeEocd
  } = options;
  options = Object.assign({}, options);
  delete options.preventHeadRequest;
  delete options.useRangeHeader;
  delete options.forceRangeRequests;
  delete options.combineSizeEocd;
  delete options.useXHR;
  Object.assign(httpReader, {
    url,
    options,
    preventHeadRequest,
    useRangeHeader,
    forceRangeRequests,
    combineSizeEocd
  });
}
async function initHttpReader(httpReader, sendRequest, getRequestData2) {
  const {
    url,
    preventHeadRequest,
    useRangeHeader,
    forceRangeRequests,
    combineSizeEocd
  } = httpReader;
  if (isHttpFamily(url) && (useRangeHeader || forceRangeRequests) && (typeof preventHeadRequest == "undefined" || preventHeadRequest)) {
    const response = await sendRequest(HTTP_METHOD_GET, httpReader, getRangeHeaders(httpReader, combineSizeEocd ? -END_OF_CENTRAL_DIR_LENGTH : void 0));
    if (!forceRangeRequests && response.headers.get(HTTP_HEADER_ACCEPT_RANGES) != HTTP_RANGE_UNIT) {
      throw new Error(ERR_HTTP_RANGE);
    } else {
      if (combineSizeEocd) {
        httpReader.eocdCache = new Uint8Array(await response.arrayBuffer());
      }
      let contentSize;
      const contentRangeHeader = response.headers.get(HTTP_HEADER_CONTENT_RANGE);
      if (contentRangeHeader) {
        const splitHeader = contentRangeHeader.trim().split(/\s*\/\s*/);
        if (splitHeader.length) {
          const headerValue = splitHeader[1];
          if (headerValue && headerValue != "*") {
            contentSize = Number(headerValue);
          }
        }
      }
      if (contentSize === UNDEFINED_VALUE) {
        await getContentLength(httpReader, sendRequest, getRequestData2);
      } else {
        httpReader.size = contentSize;
      }
    }
  } else {
    await getContentLength(httpReader, sendRequest, getRequestData2);
  }
}
async function readUint8ArrayHttpReader(httpReader, index, length, sendRequest, getRequestData2) {
  const {
    useRangeHeader,
    forceRangeRequests,
    eocdCache,
    size,
    options
  } = httpReader;
  if (useRangeHeader || forceRangeRequests) {
    if (eocdCache && index == size - END_OF_CENTRAL_DIR_LENGTH && length == END_OF_CENTRAL_DIR_LENGTH) {
      return eocdCache;
    }
    const response = await sendRequest(HTTP_METHOD_GET, httpReader, getRangeHeaders(httpReader, index, length));
    if (response.status != 206) {
      throw new Error(ERR_HTTP_RANGE);
    }
    return new Uint8Array(await response.arrayBuffer());
  } else {
    const { data } = httpReader;
    if (!data) {
      await getRequestData2(httpReader, options);
    }
    return new Uint8Array(httpReader.data.subarray(index, index + length));
  }
}
function getRangeHeaders(httpReader, index = 0, length = 1) {
  return Object.assign({}, getHeaders(httpReader), { [HTTP_HEADER_RANGE]: HTTP_RANGE_UNIT + "=" + (index < 0 ? index : index + "-" + (index + length - 1)) });
}
function getHeaders({ options }) {
  const { headers } = options;
  if (headers) {
    if (Symbol.iterator in headers) {
      return Object.fromEntries(headers);
    } else {
      return headers;
    }
  }
}
async function getFetchRequestData(httpReader) {
  await getRequestData(httpReader, sendFetchRequest);
}
async function getXMLHttpRequestData(httpReader) {
  await getRequestData(httpReader, sendXMLHttpRequest);
}
async function getRequestData(httpReader, sendRequest) {
  const response = await sendRequest(HTTP_METHOD_GET, httpReader, getHeaders(httpReader));
  httpReader.data = new Uint8Array(await response.arrayBuffer());
  if (!httpReader.size) {
    httpReader.size = httpReader.data.length;
  }
}
async function getContentLength(httpReader, sendRequest, getRequestData2) {
  if (httpReader.preventHeadRequest) {
    await getRequestData2(httpReader, httpReader.options);
  } else {
    const response = await sendRequest(HTTP_METHOD_HEAD, httpReader, getHeaders(httpReader));
    const contentLength = response.headers.get(HTTP_HEADER_CONTENT_LENGTH);
    if (contentLength) {
      httpReader.size = Number(contentLength);
    } else {
      await getRequestData2(httpReader, httpReader.options);
    }
  }
}
async function sendFetchRequest(method, { options, url }, headers) {
  const response = await fetch(url, Object.assign({}, options, { method, headers }));
  if (response.status < 400) {
    return response;
  } else {
    throw response.status == 416 ? new Error(ERR_HTTP_RANGE) : new Error(ERR_HTTP_STATUS + (response.statusText || response.status));
  }
}
function sendXMLHttpRequest(method, { url }, headers) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.addEventListener("load", () => {
      if (request.status < 400) {
        const headers2 = [];
        request.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach((header) => {
          const splitHeader = header.trim().split(/\s*:\s*/);
          splitHeader[0] = splitHeader[0].trim().replace(/^[a-z]|-[a-z]/g, (value) => value.toUpperCase());
          headers2.push(splitHeader);
        });
        resolve({
          status: request.status,
          arrayBuffer: () => request.response,
          headers: new Map(headers2)
        });
      } else {
        reject(request.status == 416 ? new Error(ERR_HTTP_RANGE) : new Error(ERR_HTTP_STATUS + (request.statusText || request.status)));
      }
    }, false);
    request.addEventListener("error", (event) => reject(event.detail ? event.detail.error : new Error("Network error")), false);
    request.open(method, url);
    if (headers) {
      for (const entry of Object.entries(headers)) {
        request.setRequestHeader(entry[0], entry[1]);
      }
    }
    request.responseType = "arraybuffer";
    request.send();
  });
}
var HttpReader = class extends Reader {
  constructor(url, options = {}) {
    super();
    Object.assign(this, {
      url,
      reader: options.useXHR ? new XHRReader(url, options) : new FetchReader(url, options)
    });
  }
  set size(value) {
  }
  get size() {
    return this.reader.size;
  }
  async init() {
    await this.reader.init();
    super.init();
  }
  readUint8Array(index, length) {
    return this.reader.readUint8Array(index, length);
  }
};
var Uint8ArrayReader = class extends Reader {
  constructor(array) {
    super();
    Object.assign(this, {
      array,
      size: array.length
    });
  }
  readUint8Array(index, length) {
    return this.array.slice(index, index + length);
  }
};
var Uint8ArrayWriter = class extends Writer {
  init(initSize = 0) {
    Object.assign(this, {
      offset: 0,
      array: new Uint8Array(initSize)
    });
    super.init();
  }
  writeUint8Array(array) {
    const writer = this;
    if (writer.offset + array.length > writer.array.length) {
      const previousArray = writer.array;
      writer.array = new Uint8Array(previousArray.length + array.length);
      writer.array.set(previousArray);
    }
    writer.array.set(array, writer.offset);
    writer.offset += array.length;
  }
  getData() {
    return this.array;
  }
};
var SplitDataReader = class extends Reader {
  constructor(readers) {
    super();
    this.readers = readers;
  }
  async init() {
    const reader = this;
    const { readers } = reader;
    reader.lastDiskNumber = 0;
    reader.lastDiskOffset = 0;
    await Promise.all(readers.map(async (diskReader, indexDiskReader) => {
      await diskReader.init();
      if (indexDiskReader != readers.length - 1) {
        reader.lastDiskOffset += diskReader.size;
      }
      reader.size += diskReader.size;
    }));
    super.init();
  }
  async readUint8Array(offset, length, diskNumber = 0) {
    const reader = this;
    const { readers } = this;
    let result;
    let currentDiskNumber = diskNumber;
    if (currentDiskNumber == -1) {
      currentDiskNumber = readers.length - 1;
    }
    let currentReaderOffset = offset;
    while (currentReaderOffset >= readers[currentDiskNumber].size) {
      currentReaderOffset -= readers[currentDiskNumber].size;
      currentDiskNumber++;
    }
    const currentReader = readers[currentDiskNumber];
    const currentReaderSize = currentReader.size;
    if (currentReaderOffset + length <= currentReaderSize) {
      result = await readUint8Array(currentReader, currentReaderOffset, length);
    } else {
      const chunkLength = currentReaderSize - currentReaderOffset;
      result = new Uint8Array(length);
      result.set(await readUint8Array(currentReader, currentReaderOffset, chunkLength));
      result.set(await reader.readUint8Array(offset + chunkLength, length - chunkLength, diskNumber), chunkLength);
    }
    reader.lastDiskNumber = Math.max(currentDiskNumber, reader.lastDiskNumber);
    return result;
  }
};
var SplitDataWriter = class extends Stream {
  constructor(writerGenerator, maxSize = 4294967295) {
    super();
    const writer = this;
    Object.assign(writer, {
      diskNumber: 0,
      diskOffset: 0,
      size: 0,
      maxSize,
      availableSize: maxSize
    });
    let diskSourceWriter, diskWritable, diskWriter;
    const writable = new WritableStream({
      async write(chunk) {
        const { availableSize } = writer;
        if (!diskWriter) {
          const { value, done } = await writerGenerator.next();
          if (done && !value) {
            throw new Error(ERR_ITERATOR_COMPLETED_TOO_SOON);
          } else {
            diskSourceWriter = value;
            diskSourceWriter.size = 0;
            if (diskSourceWriter.maxSize) {
              writer.maxSize = diskSourceWriter.maxSize;
            }
            writer.availableSize = writer.maxSize;
            await initStream(diskSourceWriter);
            diskWritable = value.writable;
            diskWriter = diskWritable.getWriter();
          }
          await this.write(chunk);
        } else if (chunk.length >= availableSize) {
          await writeChunk(chunk.slice(0, availableSize));
          await closeDisk();
          writer.diskOffset += diskSourceWriter.size;
          writer.diskNumber++;
          diskWriter = null;
          await this.write(chunk.slice(availableSize));
        } else {
          await writeChunk(chunk);
        }
      },
      async close() {
        await diskWriter.ready;
        await closeDisk();
      }
    });
    Object.defineProperty(writer, PROPERTY_NAME_WRITABLE, {
      get() {
        return writable;
      }
    });
    async function writeChunk(chunk) {
      const chunkLength = chunk.length;
      if (chunkLength) {
        await diskWriter.ready;
        await diskWriter.write(chunk);
        diskSourceWriter.size += chunkLength;
        writer.size += chunkLength;
        writer.availableSize -= chunkLength;
      }
    }
    async function closeDisk() {
      diskWritable.size = diskSourceWriter.size;
      await diskWriter.close();
    }
  }
};
function isHttpFamily(url) {
  const { baseURL: baseURL2 } = getConfiguration();
  const { protocol } = new URL(url, baseURL2);
  return protocol == "http:" || protocol == "https:";
}
async function initStream(stream, initSize) {
  if (stream.init && !stream.initialized) {
    await stream.init(initSize);
  } else {
    return Promise.resolve();
  }
}
function initReader(reader) {
  if (Array.isArray(reader)) {
    reader = new SplitDataReader(reader);
  }
  if (reader instanceof ReadableStream) {
    reader = {
      readable: reader
    };
  }
  return reader;
}
function initWriter(writer) {
  if (writer.writable === UNDEFINED_VALUE && typeof writer.next == FUNCTION_TYPE) {
    writer = new SplitDataWriter(writer);
  }
  if (writer instanceof WritableStream) {
    writer = {
      writable: writer
    };
  }
  const { writable } = writer;
  if (writable.size === UNDEFINED_VALUE) {
    writable.size = 0;
  }
  if (!(writer instanceof SplitDataWriter)) {
    Object.assign(writer, {
      diskNumber: 0,
      diskOffset: 0,
      availableSize: Infinity,
      maxSize: Infinity
    });
  }
  return writer;
}
function readUint8Array(reader, offset, size, diskNumber) {
  return reader.readUint8Array(offset, size, diskNumber);
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/util/cp437-decode.js
var CP437 = "\0\u263A\u263B\u2665\u2666\u2663\u2660\u2022\u25D8\u25CB\u25D9\u2642\u2640\u266A\u266B\u263C\u25BA\u25C4\u2195\u203C\xB6\xA7\u25AC\u21A8\u2191\u2193\u2192\u2190\u221F\u2194\u25B2\u25BC !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u2302\xC7\xFC\xE9\xE2\xE4\xE0\xE5\xE7\xEA\xEB\xE8\xEF\xEE\xEC\xC4\xC5\xC9\xE6\xC6\xF4\xF6\xF2\xFB\xF9\xFF\xD6\xDC\xA2\xA3\xA5\u20A7\u0192\xE1\xED\xF3\xFA\xF1\xD1\xAA\xBA\xBF\u2310\xAC\xBD\xBC\xA1\xAB\xBB\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255D\u255C\u255B\u2510\u2514\u2534\u252C\u251C\u2500\u253C\u255E\u255F\u255A\u2554\u2569\u2566\u2560\u2550\u256C\u2567\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256B\u256A\u2518\u250C\u2588\u2584\u258C\u2590\u2580\u03B1\xDF\u0393\u03C0\u03A3\u03C3\xB5\u03C4\u03A6\u0398\u03A9\u03B4\u221E\u03C6\u03B5\u2229\u2261\xB1\u2265\u2264\u2320\u2321\xF7\u2248\xB0\u2219\xB7\u221A\u207F\xB2\u25A0 ".split("");
var VALID_CP437 = CP437.length == 256;
function decodeCP437(stringValue) {
  if (VALID_CP437) {
    let result = "";
    for (let indexCharacter = 0; indexCharacter < stringValue.length; indexCharacter++) {
      result += CP437[stringValue[indexCharacter]];
    }
    return result;
  } else {
    return new TextDecoder().decode(stringValue);
  }
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/util/decode-text.js
function decodeText(value, encoding) {
  if (encoding && encoding.trim().toLowerCase() == "cp437") {
    return decodeCP437(value);
  } else {
    return new TextDecoder(encoding).decode(value);
  }
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/zip-entry.js
var PROPERTY_NAME_FILENAME = "filename";
var PROPERTY_NAME_RAW_FILENAME = "rawFilename";
var PROPERTY_NAME_COMMENT = "comment";
var PROPERTY_NAME_RAW_COMMENT = "rawComment";
var PROPERTY_NAME_UNCOMPPRESSED_SIZE = "uncompressedSize";
var PROPERTY_NAME_COMPPRESSED_SIZE = "compressedSize";
var PROPERTY_NAME_OFFSET = "offset";
var PROPERTY_NAME_DISK_NUMBER_START = "diskNumberStart";
var PROPERTY_NAME_LAST_MODIFICATION_DATE = "lastModDate";
var PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE = "rawLastModDate";
var PROPERTY_NAME_LAST_ACCESS_DATE = "lastAccessDate";
var PROPERTY_NAME_RAW_LAST_ACCESS_DATE = "rawLastAccessDate";
var PROPERTY_NAME_CREATION_DATE = "creationDate";
var PROPERTY_NAME_RAW_CREATION_DATE = "rawCreationDate";
var PROPERTY_NAME_INTERNAL_FILE_ATTRIBUTE = "internalFileAttribute";
var PROPERTY_NAME_EXTERNAL_FILE_ATTRIBUTE = "externalFileAttribute";
var PROPERTY_NAME_MS_DOS_COMPATIBLE = "msDosCompatible";
var PROPERTY_NAME_ZIP64 = "zip64";
var PROPERTY_NAMES = [
  PROPERTY_NAME_FILENAME,
  PROPERTY_NAME_RAW_FILENAME,
  PROPERTY_NAME_COMPPRESSED_SIZE,
  PROPERTY_NAME_UNCOMPPRESSED_SIZE,
  PROPERTY_NAME_LAST_MODIFICATION_DATE,
  PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE,
  PROPERTY_NAME_COMMENT,
  PROPERTY_NAME_RAW_COMMENT,
  PROPERTY_NAME_LAST_ACCESS_DATE,
  PROPERTY_NAME_CREATION_DATE,
  PROPERTY_NAME_OFFSET,
  PROPERTY_NAME_DISK_NUMBER_START,
  PROPERTY_NAME_DISK_NUMBER_START,
  PROPERTY_NAME_INTERNAL_FILE_ATTRIBUTE,
  PROPERTY_NAME_EXTERNAL_FILE_ATTRIBUTE,
  PROPERTY_NAME_MS_DOS_COMPATIBLE,
  PROPERTY_NAME_ZIP64,
  "directory",
  "bitFlag",
  "encrypted",
  "signature",
  "filenameUTF8",
  "commentUTF8",
  "compressionMethod",
  "version",
  "versionMadeBy",
  "extraField",
  "rawExtraField",
  "extraFieldZip64",
  "extraFieldUnicodePath",
  "extraFieldUnicodeComment",
  "extraFieldAES",
  "extraFieldNTFS",
  "extraFieldExtendedTimestamp"
];
var Entry = class {
  constructor(data) {
    PROPERTY_NAMES.forEach((name) => this[name] = data[name]);
  }
};

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/zip-reader.js
var ERR_BAD_FORMAT = "File format is not recognized";
var ERR_EOCDR_NOT_FOUND = "End of central directory not found";
var ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND = "End of Zip64 central directory locator not found";
var ERR_CENTRAL_DIRECTORY_NOT_FOUND = "Central directory header not found";
var ERR_LOCAL_FILE_HEADER_NOT_FOUND = "Local file header not found";
var ERR_EXTRAFIELD_ZIP64_NOT_FOUND = "Zip64 extra field not found";
var ERR_ENCRYPTED = "File contains encrypted entry";
var ERR_UNSUPPORTED_ENCRYPTION = "Encryption method not supported";
var ERR_UNSUPPORTED_COMPRESSION = "Compression method not supported";
var ERR_SPLIT_ZIP_FILE = "Split zip file";
var CHARSET_UTF8 = "utf-8";
var CHARSET_CP437 = "cp437";
var ZIP64_PROPERTIES = [
  [PROPERTY_NAME_UNCOMPPRESSED_SIZE, MAX_32_BITS],
  [PROPERTY_NAME_COMPPRESSED_SIZE, MAX_32_BITS],
  [PROPERTY_NAME_OFFSET, MAX_32_BITS],
  [PROPERTY_NAME_DISK_NUMBER_START, MAX_16_BITS]
];
var ZIP64_EXTRACTION = {
  [MAX_16_BITS]: {
    getValue: getUint32,
    bytes: 4
  },
  [MAX_32_BITS]: {
    getValue: getBigUint64,
    bytes: 8
  }
};
var ZipReader = class {
  constructor(reader, options = {}) {
    Object.assign(this, {
      reader: initReader(reader),
      options,
      config: getConfiguration()
    });
  }
  async *getEntriesGenerator(options = {}) {
    const zipReader = this;
    let { reader } = zipReader;
    const { config: config2 } = zipReader;
    await initStream(reader);
    if (reader.size === UNDEFINED_VALUE || !reader.readUint8Array) {
      reader = new BlobReader(await new Response(reader.readable).blob());
      await initStream(reader);
    }
    if (reader.size < END_OF_CENTRAL_DIR_LENGTH) {
      throw new Error(ERR_BAD_FORMAT);
    }
    reader.chunkSize = getChunkSize(config2);
    const endOfDirectoryInfo = await seekSignature(reader, END_OF_CENTRAL_DIR_SIGNATURE, reader.size, END_OF_CENTRAL_DIR_LENGTH, MAX_16_BITS * 16);
    if (!endOfDirectoryInfo) {
      const signatureArray = await readUint8Array(reader, 0, 4);
      const signatureView = getDataView(signatureArray);
      if (getUint32(signatureView) == SPLIT_ZIP_FILE_SIGNATURE) {
        throw new Error(ERR_SPLIT_ZIP_FILE);
      } else {
        throw new Error(ERR_EOCDR_NOT_FOUND);
      }
    }
    const endOfDirectoryView = getDataView(endOfDirectoryInfo);
    let directoryDataLength = getUint32(endOfDirectoryView, 12);
    let directoryDataOffset = getUint32(endOfDirectoryView, 16);
    const commentOffset = endOfDirectoryInfo.offset;
    const commentLength = getUint16(endOfDirectoryView, 20);
    const appendedDataOffset = commentOffset + END_OF_CENTRAL_DIR_LENGTH + commentLength;
    let lastDiskNumber = getUint16(endOfDirectoryView, 4);
    const expectedLastDiskNumber = reader.lastDiskNumber || 0;
    let diskNumber = getUint16(endOfDirectoryView, 6);
    let filesLength = getUint16(endOfDirectoryView, 8);
    let prependedDataLength = 0;
    let startOffset = 0;
    if (directoryDataOffset == MAX_32_BITS || directoryDataLength == MAX_32_BITS || filesLength == MAX_16_BITS || diskNumber == MAX_16_BITS) {
      const endOfDirectoryLocatorArray = await readUint8Array(reader, endOfDirectoryInfo.offset - ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH, ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH);
      const endOfDirectoryLocatorView = getDataView(endOfDirectoryLocatorArray);
      if (getUint32(endOfDirectoryLocatorView, 0) == ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIGNATURE) {
        directoryDataOffset = getBigUint64(endOfDirectoryLocatorView, 8);
        let endOfDirectoryArray = await readUint8Array(reader, directoryDataOffset, ZIP64_END_OF_CENTRAL_DIR_LENGTH, -1);
        let endOfDirectoryView2 = getDataView(endOfDirectoryArray);
        const expectedDirectoryDataOffset = endOfDirectoryInfo.offset - ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH - ZIP64_END_OF_CENTRAL_DIR_LENGTH;
        if (getUint32(endOfDirectoryView2, 0) != ZIP64_END_OF_CENTRAL_DIR_SIGNATURE && directoryDataOffset != expectedDirectoryDataOffset) {
          const originalDirectoryDataOffset = directoryDataOffset;
          directoryDataOffset = expectedDirectoryDataOffset;
          prependedDataLength = directoryDataOffset - originalDirectoryDataOffset;
          endOfDirectoryArray = await readUint8Array(reader, directoryDataOffset, ZIP64_END_OF_CENTRAL_DIR_LENGTH, -1);
          endOfDirectoryView2 = getDataView(endOfDirectoryArray);
        }
        if (getUint32(endOfDirectoryView2, 0) != ZIP64_END_OF_CENTRAL_DIR_SIGNATURE) {
          throw new Error(ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND);
        }
        if (lastDiskNumber == MAX_16_BITS) {
          lastDiskNumber = getUint32(endOfDirectoryView2, 16);
        }
        if (diskNumber == MAX_16_BITS) {
          diskNumber = getUint32(endOfDirectoryView2, 20);
        }
        if (filesLength == MAX_16_BITS) {
          filesLength = getBigUint64(endOfDirectoryView2, 32);
        }
        if (directoryDataLength == MAX_32_BITS) {
          directoryDataLength = getBigUint64(endOfDirectoryView2, 40);
        }
        directoryDataOffset -= directoryDataLength;
      }
    }
    if (directoryDataOffset >= reader.size) {
      prependedDataLength = reader.size - directoryDataOffset - directoryDataLength - END_OF_CENTRAL_DIR_LENGTH;
      directoryDataOffset = reader.size - directoryDataLength - END_OF_CENTRAL_DIR_LENGTH;
    }
    if (expectedLastDiskNumber != lastDiskNumber) {
      throw new Error(ERR_SPLIT_ZIP_FILE);
    }
    if (directoryDataOffset < 0) {
      throw new Error(ERR_BAD_FORMAT);
    }
    let offset = 0;
    let directoryArray = await readUint8Array(reader, directoryDataOffset, directoryDataLength, diskNumber);
    let directoryView = getDataView(directoryArray);
    if (directoryDataLength) {
      const expectedDirectoryDataOffset = endOfDirectoryInfo.offset - directoryDataLength;
      if (getUint32(directoryView, offset) != CENTRAL_FILE_HEADER_SIGNATURE && directoryDataOffset != expectedDirectoryDataOffset) {
        const originalDirectoryDataOffset = directoryDataOffset;
        directoryDataOffset = expectedDirectoryDataOffset;
        prependedDataLength += directoryDataOffset - originalDirectoryDataOffset;
        directoryArray = await readUint8Array(reader, directoryDataOffset, directoryDataLength, diskNumber);
        directoryView = getDataView(directoryArray);
      }
    }
    const expectedDirectoryDataLength = endOfDirectoryInfo.offset - directoryDataOffset - (reader.lastDiskOffset || 0);
    if (directoryDataLength != expectedDirectoryDataLength && expectedDirectoryDataLength >= 0) {
      directoryDataLength = expectedDirectoryDataLength;
      directoryArray = await readUint8Array(reader, directoryDataOffset, directoryDataLength, diskNumber);
      directoryView = getDataView(directoryArray);
    }
    if (directoryDataOffset < 0 || directoryDataOffset >= reader.size) {
      throw new Error(ERR_BAD_FORMAT);
    }
    const filenameEncoding = getOptionValue(zipReader, options, "filenameEncoding");
    const commentEncoding = getOptionValue(zipReader, options, "commentEncoding");
    for (let indexFile = 0; indexFile < filesLength; indexFile++) {
      const fileEntry = new ZipEntry(reader, config2, zipReader.options);
      if (getUint32(directoryView, offset) != CENTRAL_FILE_HEADER_SIGNATURE) {
        throw new Error(ERR_CENTRAL_DIRECTORY_NOT_FOUND);
      }
      readCommonHeader(fileEntry, directoryView, offset + 6);
      const languageEncodingFlag = Boolean(fileEntry.bitFlag.languageEncodingFlag);
      const filenameOffset = offset + 46;
      const extraFieldOffset = filenameOffset + fileEntry.filenameLength;
      const commentOffset2 = extraFieldOffset + fileEntry.extraFieldLength;
      const versionMadeBy = getUint16(directoryView, offset + 4);
      const msDosCompatible = (versionMadeBy & 0) == 0;
      const rawFilename = directoryArray.subarray(filenameOffset, extraFieldOffset);
      const commentLength2 = getUint16(directoryView, offset + 32);
      const endOffset = commentOffset2 + commentLength2;
      const rawComment = directoryArray.subarray(commentOffset2, endOffset);
      const filenameUTF8 = languageEncodingFlag;
      const commentUTF8 = languageEncodingFlag;
      const directory = msDosCompatible && (getUint8(directoryView, offset + 38) & FILE_ATTR_MSDOS_DIR_MASK) == FILE_ATTR_MSDOS_DIR_MASK;
      const offsetFileEntry = getUint32(directoryView, offset + 42) + prependedDataLength;
      Object.assign(fileEntry, {
        versionMadeBy,
        msDosCompatible,
        compressedSize: 0,
        uncompressedSize: 0,
        commentLength: commentLength2,
        directory,
        offset: offsetFileEntry,
        diskNumberStart: getUint16(directoryView, offset + 34),
        internalFileAttribute: getUint16(directoryView, offset + 36),
        externalFileAttribute: getUint32(directoryView, offset + 38),
        rawFilename,
        filenameUTF8,
        commentUTF8,
        rawExtraField: directoryArray.subarray(extraFieldOffset, commentOffset2)
      });
      const decode = getOptionValue(zipReader, options, "decodeText") || decodeText;
      const rawFilenameEncoding = filenameUTF8 ? CHARSET_UTF8 : filenameEncoding || CHARSET_CP437;
      const rawCommentEncoding = commentUTF8 ? CHARSET_UTF8 : commentEncoding || CHARSET_CP437;
      let filename = decode(rawFilename, rawFilenameEncoding);
      if (filename === UNDEFINED_VALUE) {
        filename = decodeText(rawFilename, rawFilenameEncoding);
      }
      let comment = decode(rawComment, rawCommentEncoding);
      if (comment === UNDEFINED_VALUE) {
        comment = decodeText(rawComment, rawCommentEncoding);
      }
      Object.assign(fileEntry, {
        rawComment,
        filename,
        comment,
        directory: directory || filename.endsWith(DIRECTORY_SIGNATURE)
      });
      startOffset = Math.max(offsetFileEntry, startOffset);
      await readCommonFooter(fileEntry, fileEntry, directoryView, offset + 6);
      const entry = new Entry(fileEntry);
      entry.getData = (writer, options2) => fileEntry.getData(writer, entry, options2);
      offset = endOffset;
      const { onprogress } = options;
      if (onprogress) {
        try {
          await onprogress(indexFile + 1, filesLength, new Entry(fileEntry));
        } catch (_error) {
        }
      }
      yield entry;
    }
    const extractPrependedData = getOptionValue(zipReader, options, "extractPrependedData");
    const extractAppendedData = getOptionValue(zipReader, options, "extractAppendedData");
    if (extractPrependedData) {
      zipReader.prependedData = startOffset > 0 ? await readUint8Array(reader, 0, startOffset) : new Uint8Array();
    }
    zipReader.comment = commentLength ? await readUint8Array(reader, commentOffset + END_OF_CENTRAL_DIR_LENGTH, commentLength) : new Uint8Array();
    if (extractAppendedData) {
      zipReader.appendedData = appendedDataOffset < reader.size ? await readUint8Array(reader, appendedDataOffset, reader.size - appendedDataOffset) : new Uint8Array();
    }
    return true;
  }
  async getEntries(options = {}) {
    const entries = [];
    for await (const entry of this.getEntriesGenerator(options)) {
      entries.push(entry);
    }
    return entries;
  }
  async close() {
  }
};
var ZipEntry = class {
  constructor(reader, config2, options) {
    Object.assign(this, {
      reader,
      config: config2,
      options
    });
  }
  async getData(writer, fileEntry, options = {}) {
    const zipEntry = this;
    const {
      reader,
      offset,
      diskNumberStart,
      extraFieldAES,
      compressionMethod,
      config: config2,
      bitFlag,
      signature,
      rawLastModDate,
      uncompressedSize,
      compressedSize
    } = zipEntry;
    const localDirectory = fileEntry.localDirectory = {};
    const dataArray = await readUint8Array(reader, offset, 30, diskNumberStart);
    const dataView = getDataView(dataArray);
    let password = getOptionValue(zipEntry, options, "password");
    let rawPassword = getOptionValue(zipEntry, options, "rawPassword");
    password = password && password.length && password;
    rawPassword = rawPassword && rawPassword.length && rawPassword;
    if (extraFieldAES) {
      if (extraFieldAES.originalCompressionMethod != COMPRESSION_METHOD_AES) {
        throw new Error(ERR_UNSUPPORTED_COMPRESSION);
      }
    }
    if (compressionMethod != COMPRESSION_METHOD_STORE && compressionMethod != COMPRESSION_METHOD_DEFLATE) {
      throw new Error(ERR_UNSUPPORTED_COMPRESSION);
    }
    if (getUint32(dataView, 0) != LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(ERR_LOCAL_FILE_HEADER_NOT_FOUND);
    }
    readCommonHeader(localDirectory, dataView, 4);
    localDirectory.rawExtraField = localDirectory.extraFieldLength ? await readUint8Array(reader, offset + 30 + localDirectory.filenameLength, localDirectory.extraFieldLength, diskNumberStart) : new Uint8Array();
    await readCommonFooter(zipEntry, localDirectory, dataView, 4, true);
    Object.assign(fileEntry, {
      lastAccessDate: localDirectory.lastAccessDate,
      creationDate: localDirectory.creationDate
    });
    const encrypted = zipEntry.encrypted && localDirectory.encrypted;
    const zipCrypto = encrypted && !extraFieldAES;
    if (encrypted) {
      if (!zipCrypto && extraFieldAES.strength === UNDEFINED_VALUE) {
        throw new Error(ERR_UNSUPPORTED_ENCRYPTION);
      } else if (!password && !rawPassword) {
        throw new Error(ERR_ENCRYPTED);
      }
    }
    const dataOffset = offset + 30 + localDirectory.filenameLength + localDirectory.extraFieldLength;
    const size = compressedSize;
    const readable = reader.readable;
    Object.assign(readable, {
      diskNumberStart,
      offset: dataOffset,
      size
    });
    const signal = getOptionValue(zipEntry, options, "signal");
    const checkPasswordOnly = getOptionValue(zipEntry, options, "checkPasswordOnly");
    if (checkPasswordOnly) {
      writer = new WritableStream();
    }
    writer = initWriter(writer);
    await initStream(writer, uncompressedSize);
    const { writable } = writer;
    const { onstart, onprogress, onend } = options;
    const workerOptions = {
      options: {
        codecType: CODEC_INFLATE,
        password,
        rawPassword,
        zipCrypto,
        encryptionStrength: extraFieldAES && extraFieldAES.strength,
        signed: getOptionValue(zipEntry, options, "checkSignature"),
        passwordVerification: zipCrypto && (bitFlag.dataDescriptor ? rawLastModDate >>> 8 & 255 : signature >>> 24 & 255),
        signature,
        compressed: compressionMethod != 0,
        encrypted,
        useWebWorkers: getOptionValue(zipEntry, options, "useWebWorkers"),
        useCompressionStream: getOptionValue(zipEntry, options, "useCompressionStream"),
        transferStreams: getOptionValue(zipEntry, options, "transferStreams"),
        checkPasswordOnly
      },
      config: config2,
      streamOptions: { signal, size, onstart, onprogress, onend }
    };
    let outputSize = 0;
    try {
      ({ outputSize } = await runWorker2({ readable, writable }, workerOptions));
    } catch (error) {
      if (!checkPasswordOnly || error.message != ERR_ABORT_CHECK_PASSWORD) {
        throw error;
      }
    } finally {
      const preventClose = getOptionValue(zipEntry, options, "preventClose");
      writable.size += outputSize;
      if (!preventClose && !writable.locked) {
        await writable.getWriter().close();
      }
    }
    return checkPasswordOnly ? UNDEFINED_VALUE : writer.getData ? writer.getData() : writable;
  }
};
function readCommonHeader(directory, dataView, offset) {
  const rawBitFlag = directory.rawBitFlag = getUint16(dataView, offset + 2);
  const encrypted = (rawBitFlag & BITFLAG_ENCRYPTED) == BITFLAG_ENCRYPTED;
  const rawLastModDate = getUint32(dataView, offset + 6);
  Object.assign(directory, {
    encrypted,
    version: getUint16(dataView, offset),
    bitFlag: {
      level: (rawBitFlag & BITFLAG_LEVEL) >> 1,
      dataDescriptor: (rawBitFlag & BITFLAG_DATA_DESCRIPTOR) == BITFLAG_DATA_DESCRIPTOR,
      languageEncodingFlag: (rawBitFlag & BITFLAG_LANG_ENCODING_FLAG) == BITFLAG_LANG_ENCODING_FLAG
    },
    rawLastModDate,
    lastModDate: getDate(rawLastModDate),
    filenameLength: getUint16(dataView, offset + 22),
    extraFieldLength: getUint16(dataView, offset + 24)
  });
}
async function readCommonFooter(fileEntry, directory, dataView, offset, localDirectory) {
  const { rawExtraField } = directory;
  const extraField = directory.extraField = /* @__PURE__ */ new Map();
  const rawExtraFieldView = getDataView(new Uint8Array(rawExtraField));
  let offsetExtraField = 0;
  try {
    while (offsetExtraField < rawExtraField.length) {
      const type = getUint16(rawExtraFieldView, offsetExtraField);
      const size = getUint16(rawExtraFieldView, offsetExtraField + 2);
      extraField.set(type, {
        type,
        data: rawExtraField.slice(offsetExtraField + 4, offsetExtraField + 4 + size)
      });
      offsetExtraField += 4 + size;
    }
  } catch (_error) {
  }
  const compressionMethod = getUint16(dataView, offset + 4);
  Object.assign(directory, {
    signature: getUint32(dataView, offset + 10),
    uncompressedSize: getUint32(dataView, offset + 18),
    compressedSize: getUint32(dataView, offset + 14)
  });
  const extraFieldZip64 = extraField.get(EXTRAFIELD_TYPE_ZIP64);
  if (extraFieldZip64) {
    readExtraFieldZip64(extraFieldZip64, directory);
    directory.extraFieldZip64 = extraFieldZip64;
  }
  const extraFieldUnicodePath = extraField.get(EXTRAFIELD_TYPE_UNICODE_PATH);
  if (extraFieldUnicodePath) {
    await readExtraFieldUnicode(extraFieldUnicodePath, PROPERTY_NAME_FILENAME, PROPERTY_NAME_RAW_FILENAME, directory, fileEntry);
    directory.extraFieldUnicodePath = extraFieldUnicodePath;
  }
  const extraFieldUnicodeComment = extraField.get(EXTRAFIELD_TYPE_UNICODE_COMMENT);
  if (extraFieldUnicodeComment) {
    await readExtraFieldUnicode(extraFieldUnicodeComment, PROPERTY_NAME_COMMENT, PROPERTY_NAME_RAW_COMMENT, directory, fileEntry);
    directory.extraFieldUnicodeComment = extraFieldUnicodeComment;
  }
  const extraFieldAES = extraField.get(EXTRAFIELD_TYPE_AES);
  if (extraFieldAES) {
    readExtraFieldAES(extraFieldAES, directory, compressionMethod);
    directory.extraFieldAES = extraFieldAES;
  } else {
    directory.compressionMethod = compressionMethod;
  }
  const extraFieldNTFS = extraField.get(EXTRAFIELD_TYPE_NTFS);
  if (extraFieldNTFS) {
    readExtraFieldNTFS(extraFieldNTFS, directory);
    directory.extraFieldNTFS = extraFieldNTFS;
  }
  const extraFieldExtendedTimestamp = extraField.get(EXTRAFIELD_TYPE_EXTENDED_TIMESTAMP);
  if (extraFieldExtendedTimestamp) {
    readExtraFieldExtendedTimestamp(extraFieldExtendedTimestamp, directory, localDirectory);
    directory.extraFieldExtendedTimestamp = extraFieldExtendedTimestamp;
  }
  const extraFieldUSDZ = extraField.get(EXTRAFIELD_TYPE_USDZ);
  if (extraFieldUSDZ) {
    directory.extraFieldUSDZ = extraFieldUSDZ;
  }
}
function readExtraFieldZip64(extraFieldZip64, directory) {
  directory.zip64 = true;
  const extraFieldView = getDataView(extraFieldZip64.data);
  const missingProperties = ZIP64_PROPERTIES.filter(([propertyName, max]) => directory[propertyName] == max);
  for (let indexMissingProperty = 0, offset = 0; indexMissingProperty < missingProperties.length; indexMissingProperty++) {
    const [propertyName, max] = missingProperties[indexMissingProperty];
    if (directory[propertyName] == max) {
      const extraction = ZIP64_EXTRACTION[max];
      directory[propertyName] = extraFieldZip64[propertyName] = extraction.getValue(extraFieldView, offset);
      offset += extraction.bytes;
    } else if (extraFieldZip64[propertyName]) {
      throw new Error(ERR_EXTRAFIELD_ZIP64_NOT_FOUND);
    }
  }
}
async function readExtraFieldUnicode(extraFieldUnicode, propertyName, rawPropertyName, directory, fileEntry) {
  const extraFieldView = getDataView(extraFieldUnicode.data);
  const crc32 = new Crc32();
  crc32.append(fileEntry[rawPropertyName]);
  const dataViewSignature = getDataView(new Uint8Array(4));
  dataViewSignature.setUint32(0, crc32.get(), true);
  const signature = getUint32(extraFieldView, 1);
  Object.assign(extraFieldUnicode, {
    version: getUint8(extraFieldView, 0),
    [propertyName]: decodeText(extraFieldUnicode.data.subarray(5)),
    valid: !fileEntry.bitFlag.languageEncodingFlag && signature == getUint32(dataViewSignature, 0)
  });
  if (extraFieldUnicode.valid) {
    directory[propertyName] = extraFieldUnicode[propertyName];
    directory[propertyName + "UTF8"] = true;
  }
}
function readExtraFieldAES(extraFieldAES, directory, compressionMethod) {
  const extraFieldView = getDataView(extraFieldAES.data);
  const strength = getUint8(extraFieldView, 4);
  Object.assign(extraFieldAES, {
    vendorVersion: getUint8(extraFieldView, 0),
    vendorId: getUint8(extraFieldView, 2),
    strength,
    originalCompressionMethod: compressionMethod,
    compressionMethod: getUint16(extraFieldView, 5)
  });
  directory.compressionMethod = extraFieldAES.compressionMethod;
}
function readExtraFieldNTFS(extraFieldNTFS, directory) {
  const extraFieldView = getDataView(extraFieldNTFS.data);
  let offsetExtraField = 4;
  let tag1Data;
  try {
    while (offsetExtraField < extraFieldNTFS.data.length && !tag1Data) {
      const tagValue = getUint16(extraFieldView, offsetExtraField);
      const attributeSize = getUint16(extraFieldView, offsetExtraField + 2);
      if (tagValue == EXTRAFIELD_TYPE_NTFS_TAG1) {
        tag1Data = extraFieldNTFS.data.slice(offsetExtraField + 4, offsetExtraField + 4 + attributeSize);
      }
      offsetExtraField += 4 + attributeSize;
    }
  } catch (_error) {
  }
  try {
    if (tag1Data && tag1Data.length == 24) {
      const tag1View = getDataView(tag1Data);
      const rawLastModDate = tag1View.getBigUint64(0, true);
      const rawLastAccessDate = tag1View.getBigUint64(8, true);
      const rawCreationDate = tag1View.getBigUint64(16, true);
      Object.assign(extraFieldNTFS, {
        rawLastModDate,
        rawLastAccessDate,
        rawCreationDate
      });
      const lastModDate = getDateNTFS(rawLastModDate);
      const lastAccessDate = getDateNTFS(rawLastAccessDate);
      const creationDate = getDateNTFS(rawCreationDate);
      const extraFieldData = { lastModDate, lastAccessDate, creationDate };
      Object.assign(extraFieldNTFS, extraFieldData);
      Object.assign(directory, extraFieldData);
    }
  } catch (_error) {
  }
}
function readExtraFieldExtendedTimestamp(extraFieldExtendedTimestamp, directory, localDirectory) {
  const extraFieldView = getDataView(extraFieldExtendedTimestamp.data);
  const flags = getUint8(extraFieldView, 0);
  const timeProperties = [];
  const timeRawProperties = [];
  if (localDirectory) {
    if ((flags & 1) == 1) {
      timeProperties.push(PROPERTY_NAME_LAST_MODIFICATION_DATE);
      timeRawProperties.push(PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE);
    }
    if ((flags & 2) == 2) {
      timeProperties.push(PROPERTY_NAME_LAST_ACCESS_DATE);
      timeRawProperties.push(PROPERTY_NAME_RAW_LAST_ACCESS_DATE);
    }
    if ((flags & 4) == 4) {
      timeProperties.push(PROPERTY_NAME_CREATION_DATE);
      timeRawProperties.push(PROPERTY_NAME_RAW_CREATION_DATE);
    }
  } else if (extraFieldExtendedTimestamp.data.length >= 5) {
    timeProperties.push(PROPERTY_NAME_LAST_MODIFICATION_DATE);
    timeRawProperties.push(PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE);
  }
  let offset = 1;
  timeProperties.forEach((propertyName, indexProperty) => {
    if (extraFieldExtendedTimestamp.data.length >= offset + 4) {
      const time = getUint32(extraFieldView, offset);
      directory[propertyName] = extraFieldExtendedTimestamp[propertyName] = new Date(time * 1e3);
      const rawPropertyName = timeRawProperties[indexProperty];
      extraFieldExtendedTimestamp[rawPropertyName] = time;
    }
    offset += 4;
  });
}
async function seekSignature(reader, signature, startOffset, minimumBytes, maximumLength) {
  const signatureArray = new Uint8Array(4);
  const signatureView = getDataView(signatureArray);
  setUint32(signatureView, 0, signature);
  const maximumBytes = minimumBytes + maximumLength;
  return await seek(minimumBytes) || await seek(Math.min(maximumBytes, startOffset));
  async function seek(length) {
    const offset = startOffset - length;
    const bytes = await readUint8Array(reader, offset, length);
    for (let indexByte = bytes.length - minimumBytes; indexByte >= 0; indexByte--) {
      if (bytes[indexByte] == signatureArray[0] && bytes[indexByte + 1] == signatureArray[1] && bytes[indexByte + 2] == signatureArray[2] && bytes[indexByte + 3] == signatureArray[3]) {
        return {
          offset: offset + indexByte,
          buffer: bytes.slice(indexByte, indexByte + minimumBytes).buffer
        };
      }
    }
  }
}
function getOptionValue(zipReader, options, name) {
  return options[name] === UNDEFINED_VALUE ? zipReader.options[name] : options[name];
}
function getDate(timeRaw) {
  const date = (timeRaw & 4294901760) >> 16, time = timeRaw & 65535;
  try {
    return new Date(1980 + ((date & 65024) >> 9), ((date & 480) >> 5) - 1, date & 31, (time & 63488) >> 11, (time & 2016) >> 5, (time & 31) * 2, 0);
  } catch (_error) {
  }
}
function getDateNTFS(timeRaw) {
  return new Date(Number(timeRaw / BigInt(1e4) - BigInt(116444736e5)));
}
function getUint8(view, offset) {
  return view.getUint8(offset);
}
function getUint16(view, offset) {
  return view.getUint16(offset, true);
}
function getUint32(view, offset) {
  return view.getUint32(offset, true);
}
function getBigUint64(view, offset) {
  return Number(view.getBigUint64(offset, true));
}
function setUint32(view, offset, value) {
  view.setUint32(offset, value, true);
}
function getDataView(array) {
  return new DataView(array.buffer);
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/zip-writer.js
var ERR_DUPLICATED_NAME = "File already exists";
var ERR_INVALID_COMMENT = "Zip file comment exceeds 64KB";
var ERR_INVALID_ENTRY_COMMENT = "File entry comment exceeds 64KB";
var ERR_INVALID_ENTRY_NAME = "File entry name exceeds 64KB";
var ERR_INVALID_VERSION = "Version exceeds 65535";
var ERR_INVALID_ENCRYPTION_STRENGTH = "The strength must equal 1, 2, or 3";
var ERR_INVALID_EXTRAFIELD_TYPE = "Extra field type exceeds 65535";
var ERR_INVALID_EXTRAFIELD_DATA = "Extra field data exceeds 64KB";
var ERR_UNSUPPORTED_FORMAT = "Zip64 is not supported (make sure 'keepOrder' is set to 'true')";
var EXTRAFIELD_DATA_AES = new Uint8Array([7, 0, 2, 0, 65, 69, 3, 0, 0]);
var workers = 0;
var pendingEntries = [];
var ZipWriter = class {
  constructor(writer, options = {}) {
    writer = initWriter(writer);
    const addSplitZipSignature = writer.availableSize !== UNDEFINED_VALUE && writer.availableSize > 0 && writer.availableSize !== Infinity && writer.maxSize !== UNDEFINED_VALUE && writer.maxSize > 0 && writer.maxSize !== Infinity;
    Object.assign(this, {
      writer,
      addSplitZipSignature,
      options,
      config: getConfiguration(),
      files: /* @__PURE__ */ new Map(),
      filenames: /* @__PURE__ */ new Set(),
      offset: writer.writable.size,
      pendingEntriesSize: 0,
      pendingAddFileCalls: /* @__PURE__ */ new Set(),
      bufferedWrites: 0
    });
  }
  async add(name = "", reader, options = {}) {
    const zipWriter = this;
    const {
      pendingAddFileCalls,
      config: config2
    } = zipWriter;
    if (workers < config2.maxWorkers) {
      workers++;
    } else {
      await new Promise((resolve) => pendingEntries.push(resolve));
    }
    let promiseAddFile;
    try {
      name = name.trim();
      if (zipWriter.filenames.has(name)) {
        throw new Error(ERR_DUPLICATED_NAME);
      }
      zipWriter.filenames.add(name);
      promiseAddFile = addFile(zipWriter, name, reader, options);
      pendingAddFileCalls.add(promiseAddFile);
      return await promiseAddFile;
    } catch (error) {
      zipWriter.filenames.delete(name);
      throw error;
    } finally {
      pendingAddFileCalls.delete(promiseAddFile);
      const pendingEntry = pendingEntries.shift();
      if (pendingEntry) {
        pendingEntry();
      } else {
        workers--;
      }
    }
  }
  async close(comment = new Uint8Array(), options = {}) {
    const zipWriter = this;
    const { pendingAddFileCalls, writer } = this;
    const { writable } = writer;
    while (pendingAddFileCalls.size) {
      await Promise.allSettled(Array.from(pendingAddFileCalls));
    }
    await closeFile(this, comment, options);
    const preventClose = getOptionValue2(zipWriter, options, "preventClose");
    if (!preventClose) {
      await writable.getWriter().close();
    }
    return writer.getData ? writer.getData() : writable;
  }
};
async function addFile(zipWriter, name, reader, options) {
  name = name.trim();
  if (options.directory && !name.endsWith(DIRECTORY_SIGNATURE)) {
    name += DIRECTORY_SIGNATURE;
  } else {
    options.directory = name.endsWith(DIRECTORY_SIGNATURE);
  }
  const encode = getOptionValue2(zipWriter, options, "encodeText", encodeText);
  let rawFilename = encode(name);
  if (rawFilename === UNDEFINED_VALUE) {
    rawFilename = encodeText(name);
  }
  if (getLength(rawFilename) > MAX_16_BITS) {
    throw new Error(ERR_INVALID_ENTRY_NAME);
  }
  const comment = options.comment || "";
  let rawComment = encode(comment);
  if (rawComment === UNDEFINED_VALUE) {
    rawComment = encodeText(comment);
  }
  if (getLength(rawComment) > MAX_16_BITS) {
    throw new Error(ERR_INVALID_ENTRY_COMMENT);
  }
  const version = getOptionValue2(zipWriter, options, "version", VERSION_DEFLATE);
  if (version > MAX_16_BITS) {
    throw new Error(ERR_INVALID_VERSION);
  }
  const versionMadeBy = getOptionValue2(zipWriter, options, "versionMadeBy", 20);
  if (versionMadeBy > MAX_16_BITS) {
    throw new Error(ERR_INVALID_VERSION);
  }
  const lastModDate = getOptionValue2(zipWriter, options, PROPERTY_NAME_LAST_MODIFICATION_DATE, /* @__PURE__ */ new Date());
  const lastAccessDate = getOptionValue2(zipWriter, options, PROPERTY_NAME_LAST_ACCESS_DATE);
  const creationDate = getOptionValue2(zipWriter, options, PROPERTY_NAME_CREATION_DATE);
  const msDosCompatible = getOptionValue2(zipWriter, options, PROPERTY_NAME_MS_DOS_COMPATIBLE, true);
  const internalFileAttribute = getOptionValue2(zipWriter, options, PROPERTY_NAME_INTERNAL_FILE_ATTRIBUTE, 0);
  const externalFileAttribute = getOptionValue2(zipWriter, options, PROPERTY_NAME_EXTERNAL_FILE_ATTRIBUTE, 0);
  const password = getOptionValue2(zipWriter, options, "password");
  const rawPassword = getOptionValue2(zipWriter, options, "rawPassword");
  const encryptionStrength = getOptionValue2(zipWriter, options, "encryptionStrength", 3);
  const zipCrypto = getOptionValue2(zipWriter, options, "zipCrypto");
  const extendedTimestamp = getOptionValue2(zipWriter, options, "extendedTimestamp", true);
  const keepOrder = getOptionValue2(zipWriter, options, "keepOrder", true);
  const level = getOptionValue2(zipWriter, options, "level");
  const useWebWorkers = getOptionValue2(zipWriter, options, "useWebWorkers");
  const bufferedWrite = getOptionValue2(zipWriter, options, "bufferedWrite");
  const dataDescriptorSignature = getOptionValue2(zipWriter, options, "dataDescriptorSignature", false);
  const signal = getOptionValue2(zipWriter, options, "signal");
  const useUnicodeFileNames = getOptionValue2(zipWriter, options, "useUnicodeFileNames", true);
  const useCompressionStream = getOptionValue2(zipWriter, options, "useCompressionStream");
  let dataDescriptor = getOptionValue2(zipWriter, options, "dataDescriptor", true);
  let zip64 = getOptionValue2(zipWriter, options, PROPERTY_NAME_ZIP64);
  if (password !== UNDEFINED_VALUE && encryptionStrength !== UNDEFINED_VALUE && (encryptionStrength < 1 || encryptionStrength > 3)) {
    throw new Error(ERR_INVALID_ENCRYPTION_STRENGTH);
  }
  let rawExtraField = new Uint8Array();
  const { extraField } = options;
  if (extraField) {
    let extraFieldSize = 0;
    let offset = 0;
    extraField.forEach((data) => extraFieldSize += 4 + getLength(data));
    rawExtraField = new Uint8Array(extraFieldSize);
    extraField.forEach((data, type) => {
      if (type > MAX_16_BITS) {
        throw new Error(ERR_INVALID_EXTRAFIELD_TYPE);
      }
      if (getLength(data) > MAX_16_BITS) {
        throw new Error(ERR_INVALID_EXTRAFIELD_DATA);
      }
      arraySet(rawExtraField, new Uint16Array([type]), offset);
      arraySet(rawExtraField, new Uint16Array([getLength(data)]), offset + 2);
      arraySet(rawExtraField, data, offset + 4);
      offset += 4 + getLength(data);
    });
  }
  let maximumCompressedSize = 0;
  let maximumEntrySize = 0;
  let uncompressedSize = 0;
  const zip64Enabled = zip64 === true;
  if (reader) {
    reader = initReader(reader);
    await initStream(reader);
    if (reader.size === UNDEFINED_VALUE) {
      dataDescriptor = true;
      if (zip64 || zip64 === UNDEFINED_VALUE) {
        zip64 = true;
        uncompressedSize = maximumCompressedSize = MAX_32_BITS + 1;
      }
    } else {
      uncompressedSize = reader.size;
      maximumCompressedSize = getMaximumCompressedSize2(uncompressedSize);
    }
  }
  const { diskOffset, diskNumber, maxSize } = zipWriter.writer;
  const zip64UncompressedSize = zip64Enabled || uncompressedSize > MAX_32_BITS;
  const zip64CompressedSize = zip64Enabled || maximumCompressedSize > MAX_32_BITS;
  const zip64Offset = zip64Enabled || zipWriter.offset + zipWriter.pendingEntriesSize - diskOffset > MAX_32_BITS;
  const supportZip64SplitFile = getOptionValue2(zipWriter, options, "supportZip64SplitFile", true);
  const zip64DiskNumberStart = supportZip64SplitFile && zip64Enabled || diskNumber + Math.ceil(zipWriter.pendingEntriesSize / maxSize) > MAX_16_BITS;
  if (zip64Offset || zip64UncompressedSize || zip64CompressedSize || zip64DiskNumberStart) {
    if (zip64 === false || !keepOrder) {
      throw new Error(ERR_UNSUPPORTED_FORMAT);
    } else {
      zip64 = true;
    }
  }
  zip64 = zip64 || false;
  options = Object.assign({}, options, {
    rawFilename,
    rawComment,
    version,
    versionMadeBy,
    lastModDate,
    lastAccessDate,
    creationDate,
    rawExtraField,
    zip64,
    zip64UncompressedSize,
    zip64CompressedSize,
    zip64Offset,
    zip64DiskNumberStart,
    password,
    rawPassword,
    level: !useCompressionStream && (zipWriter.config.CompressionStream === UNDEFINED_VALUE && zipWriter.config.CompressionStreamNative === UNDEFINED_VALUE) ? 0 : level,
    useWebWorkers,
    encryptionStrength,
    extendedTimestamp,
    zipCrypto,
    bufferedWrite,
    keepOrder,
    useUnicodeFileNames,
    dataDescriptor,
    dataDescriptorSignature,
    signal,
    msDosCompatible,
    internalFileAttribute,
    externalFileAttribute,
    useCompressionStream
  });
  const headerInfo = getHeaderInfo(options);
  const dataDescriptorInfo = getDataDescriptorInfo(options);
  const metadataSize = getLength(headerInfo.localHeaderArray, dataDescriptorInfo.dataDescriptorArray);
  maximumEntrySize = metadataSize + maximumCompressedSize;
  if (zipWriter.options.usdz) {
    maximumEntrySize += maximumEntrySize + 64;
  }
  zipWriter.pendingEntriesSize += maximumEntrySize;
  let fileEntry;
  try {
    fileEntry = await getFileEntry(zipWriter, name, reader, { headerInfo, dataDescriptorInfo, metadataSize }, options);
  } finally {
    zipWriter.pendingEntriesSize -= maximumEntrySize;
  }
  Object.assign(fileEntry, { name, comment, extraField });
  return new Entry(fileEntry);
}
async function getFileEntry(zipWriter, name, reader, entryInfo, options) {
  const {
    files,
    writer
  } = zipWriter;
  const {
    keepOrder,
    dataDescriptor,
    signal
  } = options;
  const {
    headerInfo
  } = entryInfo;
  const { usdz } = zipWriter.options;
  const previousFileEntry = Array.from(files.values()).pop();
  let fileEntry = {};
  let bufferedWrite;
  let releaseLockWriter;
  let releaseLockCurrentFileEntry;
  let writingBufferedEntryData;
  let writingEntryData;
  let fileWriter;
  let blobPromise;
  files.set(name, fileEntry);
  try {
    let lockPreviousFileEntry;
    if (keepOrder) {
      lockPreviousFileEntry = previousFileEntry && previousFileEntry.lock;
      requestLockCurrentFileEntry();
    }
    if ((options.bufferedWrite || zipWriter.writerLocked || zipWriter.bufferedWrites && keepOrder || !dataDescriptor) && !usdz) {
      fileWriter = new TransformStream();
      blobPromise = new Response(fileWriter.readable).blob();
      fileWriter.writable.size = 0;
      bufferedWrite = true;
      zipWriter.bufferedWrites++;
      await initStream(writer);
    } else {
      fileWriter = writer;
      await requestLockWriter();
    }
    await initStream(fileWriter);
    const { writable } = writer;
    let { diskOffset } = writer;
    if (zipWriter.addSplitZipSignature) {
      delete zipWriter.addSplitZipSignature;
      const signatureArray = new Uint8Array(4);
      const signatureArrayView = getDataView2(signatureArray);
      setUint322(signatureArrayView, 0, SPLIT_ZIP_FILE_SIGNATURE);
      await writeData(writable, signatureArray);
      zipWriter.offset += 4;
    }
    if (usdz) {
      appendExtraFieldUSDZ(entryInfo, zipWriter.offset - diskOffset);
    }
    if (!bufferedWrite) {
      await lockPreviousFileEntry;
      await skipDiskIfNeeded(writable);
    }
    const { diskNumber } = writer;
    writingEntryData = true;
    fileEntry.diskNumberStart = diskNumber;
    fileEntry = await createFileEntry(reader, fileWriter, fileEntry, entryInfo, zipWriter.config, options);
    writingEntryData = false;
    files.set(name, fileEntry);
    fileEntry.filename = name;
    if (bufferedWrite) {
      await fileWriter.writable.getWriter().close();
      let blob = await blobPromise;
      await lockPreviousFileEntry;
      await requestLockWriter();
      writingBufferedEntryData = true;
      if (!dataDescriptor) {
        blob = await writeExtraHeaderInfo(fileEntry, blob, writable, options);
      }
      await skipDiskIfNeeded(writable);
      fileEntry.diskNumberStart = writer.diskNumber;
      diskOffset = writer.diskOffset;
      await blob.stream().pipeTo(writable, { preventClose: true, preventAbort: true, signal });
      writable.size += blob.size;
      writingBufferedEntryData = false;
    }
    fileEntry.offset = zipWriter.offset - diskOffset;
    if (fileEntry.zip64) {
      setZip64ExtraInfo(fileEntry, options);
    } else if (fileEntry.offset > MAX_32_BITS) {
      throw new Error(ERR_UNSUPPORTED_FORMAT);
    }
    zipWriter.offset += fileEntry.size;
    return fileEntry;
  } catch (error) {
    if (bufferedWrite && writingBufferedEntryData || !bufferedWrite && writingEntryData) {
      zipWriter.hasCorruptedEntries = true;
      if (error) {
        try {
          error.corruptedEntry = true;
        } catch (_error) {
        }
      }
      if (bufferedWrite) {
        zipWriter.offset += fileWriter.writable.size;
      } else {
        zipWriter.offset = fileWriter.writable.size;
      }
    }
    files.delete(name);
    throw error;
  } finally {
    if (bufferedWrite) {
      zipWriter.bufferedWrites--;
    }
    if (releaseLockCurrentFileEntry) {
      releaseLockCurrentFileEntry();
    }
    if (releaseLockWriter) {
      releaseLockWriter();
    }
  }
  function requestLockCurrentFileEntry() {
    fileEntry.lock = new Promise((resolve) => releaseLockCurrentFileEntry = resolve);
  }
  async function requestLockWriter() {
    zipWriter.writerLocked = true;
    const { lockWriter } = zipWriter;
    zipWriter.lockWriter = new Promise((resolve) => releaseLockWriter = () => {
      zipWriter.writerLocked = false;
      resolve();
    });
    await lockWriter;
  }
  async function skipDiskIfNeeded(writable) {
    if (getLength(headerInfo.localHeaderArray) > writer.availableSize) {
      writer.availableSize = 0;
      await writeData(writable, new Uint8Array());
    }
  }
}
async function createFileEntry(reader, writer, { diskNumberStart, lock }, entryInfo, config2, options) {
  const {
    headerInfo,
    dataDescriptorInfo,
    metadataSize
  } = entryInfo;
  const {
    localHeaderArray,
    headerArray,
    lastModDate,
    rawLastModDate,
    encrypted,
    compressed,
    version,
    compressionMethod,
    rawExtraFieldExtendedTimestamp,
    extraFieldExtendedTimestampFlag,
    rawExtraFieldNTFS,
    rawExtraFieldAES
  } = headerInfo;
  const { dataDescriptorArray } = dataDescriptorInfo;
  const {
    rawFilename,
    lastAccessDate,
    creationDate,
    password,
    rawPassword,
    level,
    zip64,
    zip64UncompressedSize,
    zip64CompressedSize,
    zip64Offset,
    zip64DiskNumberStart,
    zipCrypto,
    dataDescriptor,
    directory,
    versionMadeBy,
    rawComment,
    rawExtraField,
    useWebWorkers,
    onstart,
    onprogress,
    onend,
    signal,
    encryptionStrength,
    extendedTimestamp,
    msDosCompatible,
    internalFileAttribute,
    externalFileAttribute,
    useCompressionStream
  } = options;
  const fileEntry = {
    lock,
    versionMadeBy,
    zip64,
    directory: Boolean(directory),
    filenameUTF8: true,
    rawFilename,
    commentUTF8: true,
    rawComment,
    rawExtraFieldExtendedTimestamp,
    rawExtraFieldNTFS,
    rawExtraFieldAES,
    rawExtraField,
    extendedTimestamp,
    msDosCompatible,
    internalFileAttribute,
    externalFileAttribute,
    diskNumberStart
  };
  let compressedSize = 0;
  let uncompressedSize = 0;
  let signature;
  const { writable } = writer;
  if (reader) {
    reader.chunkSize = getChunkSize(config2);
    await writeData(writable, localHeaderArray);
    const readable = reader.readable;
    const size = readable.size = reader.size;
    const workerOptions = {
      options: {
        codecType: CODEC_DEFLATE,
        level,
        rawPassword,
        password,
        encryptionStrength,
        zipCrypto: encrypted && zipCrypto,
        passwordVerification: encrypted && zipCrypto && rawLastModDate >> 8 & 255,
        signed: true,
        compressed,
        encrypted,
        useWebWorkers,
        useCompressionStream,
        transferStreams: false
      },
      config: config2,
      streamOptions: { signal, size, onstart, onprogress, onend }
    };
    const result = await runWorker2({ readable, writable }, workerOptions);
    uncompressedSize = result.inputSize;
    compressedSize = result.outputSize;
    signature = result.signature;
    writable.size += uncompressedSize;
  } else {
    await writeData(writable, localHeaderArray);
  }
  let rawExtraFieldZip64;
  if (zip64) {
    let rawExtraFieldZip64Length = 4;
    if (zip64UncompressedSize) {
      rawExtraFieldZip64Length += 8;
    }
    if (zip64CompressedSize) {
      rawExtraFieldZip64Length += 8;
    }
    if (zip64Offset) {
      rawExtraFieldZip64Length += 8;
    }
    if (zip64DiskNumberStart) {
      rawExtraFieldZip64Length += 4;
    }
    rawExtraFieldZip64 = new Uint8Array(rawExtraFieldZip64Length);
  } else {
    rawExtraFieldZip64 = new Uint8Array();
  }
  setEntryInfo({
    signature,
    rawExtraFieldZip64,
    compressedSize,
    uncompressedSize,
    headerInfo,
    dataDescriptorInfo
  }, options);
  if (dataDescriptor) {
    await writeData(writable, dataDescriptorArray);
  }
  Object.assign(fileEntry, {
    uncompressedSize,
    compressedSize,
    lastModDate,
    rawLastModDate,
    creationDate,
    lastAccessDate,
    encrypted,
    size: metadataSize + compressedSize,
    compressionMethod,
    version,
    headerArray,
    signature,
    rawExtraFieldZip64,
    extraFieldExtendedTimestampFlag,
    zip64UncompressedSize,
    zip64CompressedSize,
    zip64Offset,
    zip64DiskNumberStart
  });
  return fileEntry;
}
function getHeaderInfo(options) {
  const {
    rawFilename,
    lastModDate,
    lastAccessDate,
    creationDate,
    rawPassword,
    password,
    level,
    zip64,
    zipCrypto,
    useUnicodeFileNames,
    dataDescriptor,
    directory,
    rawExtraField,
    encryptionStrength,
    extendedTimestamp
  } = options;
  const compressed = level !== 0 && !directory;
  const encrypted = Boolean(password && getLength(password) || rawPassword && getLength(rawPassword));
  let version = options.version;
  let rawExtraFieldAES;
  if (encrypted && !zipCrypto) {
    rawExtraFieldAES = new Uint8Array(getLength(EXTRAFIELD_DATA_AES) + 2);
    const extraFieldAESView = getDataView2(rawExtraFieldAES);
    setUint16(extraFieldAESView, 0, EXTRAFIELD_TYPE_AES);
    arraySet(rawExtraFieldAES, EXTRAFIELD_DATA_AES, 2);
    setUint8(extraFieldAESView, 8, encryptionStrength);
  } else {
    rawExtraFieldAES = new Uint8Array();
  }
  let rawExtraFieldNTFS;
  let rawExtraFieldExtendedTimestamp;
  let extraFieldExtendedTimestampFlag;
  if (extendedTimestamp) {
    rawExtraFieldExtendedTimestamp = new Uint8Array(9 + (lastAccessDate ? 4 : 0) + (creationDate ? 4 : 0));
    const extraFieldExtendedTimestampView = getDataView2(rawExtraFieldExtendedTimestamp);
    setUint16(extraFieldExtendedTimestampView, 0, EXTRAFIELD_TYPE_EXTENDED_TIMESTAMP);
    setUint16(extraFieldExtendedTimestampView, 2, getLength(rawExtraFieldExtendedTimestamp) - 4);
    extraFieldExtendedTimestampFlag = 1 + (lastAccessDate ? 2 : 0) + (creationDate ? 4 : 0);
    setUint8(extraFieldExtendedTimestampView, 4, extraFieldExtendedTimestampFlag);
    let offset = 5;
    setUint322(extraFieldExtendedTimestampView, offset, Math.floor(lastModDate.getTime() / 1e3));
    offset += 4;
    if (lastAccessDate) {
      setUint322(extraFieldExtendedTimestampView, offset, Math.floor(lastAccessDate.getTime() / 1e3));
      offset += 4;
    }
    if (creationDate) {
      setUint322(extraFieldExtendedTimestampView, offset, Math.floor(creationDate.getTime() / 1e3));
    }
    try {
      rawExtraFieldNTFS = new Uint8Array(36);
      const extraFieldNTFSView = getDataView2(rawExtraFieldNTFS);
      const lastModTimeNTFS = getTimeNTFS(lastModDate);
      setUint16(extraFieldNTFSView, 0, EXTRAFIELD_TYPE_NTFS);
      setUint16(extraFieldNTFSView, 2, 32);
      setUint16(extraFieldNTFSView, 8, EXTRAFIELD_TYPE_NTFS_TAG1);
      setUint16(extraFieldNTFSView, 10, 24);
      setBigUint64(extraFieldNTFSView, 12, lastModTimeNTFS);
      setBigUint64(extraFieldNTFSView, 20, getTimeNTFS(lastAccessDate) || lastModTimeNTFS);
      setBigUint64(extraFieldNTFSView, 28, getTimeNTFS(creationDate) || lastModTimeNTFS);
    } catch (_error) {
      rawExtraFieldNTFS = new Uint8Array();
    }
  } else {
    rawExtraFieldNTFS = rawExtraFieldExtendedTimestamp = new Uint8Array();
  }
  let bitFlag = 0;
  if (useUnicodeFileNames) {
    bitFlag = bitFlag | BITFLAG_LANG_ENCODING_FLAG;
  }
  if (dataDescriptor) {
    bitFlag = bitFlag | BITFLAG_DATA_DESCRIPTOR;
  }
  let compressionMethod = COMPRESSION_METHOD_STORE;
  if (compressed) {
    compressionMethod = COMPRESSION_METHOD_DEFLATE;
  }
  if (zip64) {
    version = version > VERSION_ZIP64 ? version : VERSION_ZIP64;
  }
  if (encrypted) {
    bitFlag = bitFlag | BITFLAG_ENCRYPTED;
    if (!zipCrypto) {
      version = version > VERSION_AES ? version : VERSION_AES;
      compressionMethod = COMPRESSION_METHOD_AES;
      if (compressed) {
        rawExtraFieldAES[9] = COMPRESSION_METHOD_DEFLATE;
      }
    }
  }
  const headerArray = new Uint8Array(26);
  const headerView = getDataView2(headerArray);
  setUint16(headerView, 0, version);
  setUint16(headerView, 2, bitFlag);
  setUint16(headerView, 4, compressionMethod);
  const dateArray = new Uint32Array(1);
  const dateView = getDataView2(dateArray);
  let lastModDateMsDos;
  if (lastModDate < MIN_DATE) {
    lastModDateMsDos = MIN_DATE;
  } else if (lastModDate > MAX_DATE) {
    lastModDateMsDos = MAX_DATE;
  } else {
    lastModDateMsDos = lastModDate;
  }
  setUint16(dateView, 0, (lastModDateMsDos.getHours() << 6 | lastModDateMsDos.getMinutes()) << 5 | lastModDateMsDos.getSeconds() / 2);
  setUint16(dateView, 2, (lastModDateMsDos.getFullYear() - 1980 << 4 | lastModDateMsDos.getMonth() + 1) << 5 | lastModDateMsDos.getDate());
  const rawLastModDate = dateArray[0];
  setUint322(headerView, 6, rawLastModDate);
  setUint16(headerView, 22, getLength(rawFilename));
  const extraFieldLength = getLength(rawExtraFieldAES, rawExtraFieldExtendedTimestamp, rawExtraFieldNTFS, rawExtraField);
  setUint16(headerView, 24, extraFieldLength);
  const localHeaderArray = new Uint8Array(30 + getLength(rawFilename) + extraFieldLength);
  const localHeaderView = getDataView2(localHeaderArray);
  setUint322(localHeaderView, 0, LOCAL_FILE_HEADER_SIGNATURE);
  arraySet(localHeaderArray, headerArray, 4);
  arraySet(localHeaderArray, rawFilename, 30);
  arraySet(localHeaderArray, rawExtraFieldAES, 30 + getLength(rawFilename));
  arraySet(localHeaderArray, rawExtraFieldExtendedTimestamp, 30 + getLength(rawFilename, rawExtraFieldAES));
  arraySet(localHeaderArray, rawExtraFieldNTFS, 30 + getLength(rawFilename, rawExtraFieldAES, rawExtraFieldExtendedTimestamp));
  arraySet(localHeaderArray, rawExtraField, 30 + getLength(rawFilename, rawExtraFieldAES, rawExtraFieldExtendedTimestamp, rawExtraFieldNTFS));
  return {
    localHeaderArray,
    headerArray,
    headerView,
    lastModDate,
    rawLastModDate,
    encrypted,
    compressed,
    version,
    compressionMethod,
    extraFieldExtendedTimestampFlag,
    rawExtraFieldExtendedTimestamp,
    rawExtraFieldNTFS,
    rawExtraFieldAES,
    extraFieldLength
  };
}
function appendExtraFieldUSDZ(entryInfo, zipWriterOffset) {
  const { headerInfo } = entryInfo;
  let { localHeaderArray, extraFieldLength } = headerInfo;
  let localHeaderArrayView = getDataView2(localHeaderArray);
  let extraBytesLength = 64 - (zipWriterOffset + getLength(localHeaderArray)) % 64;
  if (extraBytesLength < 4) {
    extraBytesLength += 64;
  }
  const rawExtraFieldUSDZ = new Uint8Array(extraBytesLength);
  const extraFieldUSDZView = getDataView2(rawExtraFieldUSDZ);
  setUint16(extraFieldUSDZView, 0, EXTRAFIELD_TYPE_USDZ);
  setUint16(extraFieldUSDZView, 2, extraBytesLength - 2);
  const previousLocalHeaderArray = localHeaderArray;
  headerInfo.localHeaderArray = localHeaderArray = new Uint8Array(getLength(previousLocalHeaderArray) + extraBytesLength);
  arraySet(localHeaderArray, previousLocalHeaderArray);
  arraySet(localHeaderArray, rawExtraFieldUSDZ, getLength(previousLocalHeaderArray));
  localHeaderArrayView = getDataView2(localHeaderArray);
  setUint16(localHeaderArrayView, 28, extraFieldLength + extraBytesLength);
  entryInfo.metadataSize += extraBytesLength;
}
function getDataDescriptorInfo(options) {
  const {
    zip64,
    dataDescriptor,
    dataDescriptorSignature
  } = options;
  let dataDescriptorArray = new Uint8Array();
  let dataDescriptorView, dataDescriptorOffset = 0;
  if (dataDescriptor) {
    dataDescriptorArray = new Uint8Array(zip64 ? dataDescriptorSignature ? 24 : 20 : dataDescriptorSignature ? 16 : 12);
    dataDescriptorView = getDataView2(dataDescriptorArray);
    if (dataDescriptorSignature) {
      dataDescriptorOffset = 4;
      setUint322(dataDescriptorView, 0, DATA_DESCRIPTOR_RECORD_SIGNATURE);
    }
  }
  return {
    dataDescriptorArray,
    dataDescriptorView,
    dataDescriptorOffset
  };
}
function setEntryInfo(entryInfo, options) {
  const {
    signature,
    rawExtraFieldZip64,
    compressedSize,
    uncompressedSize,
    headerInfo,
    dataDescriptorInfo
  } = entryInfo;
  const {
    headerView,
    encrypted
  } = headerInfo;
  const {
    dataDescriptorView,
    dataDescriptorOffset
  } = dataDescriptorInfo;
  const {
    zip64,
    zip64UncompressedSize,
    zip64CompressedSize,
    zipCrypto,
    dataDescriptor
  } = options;
  if ((!encrypted || zipCrypto) && signature !== UNDEFINED_VALUE) {
    setUint322(headerView, 10, signature);
    if (dataDescriptor) {
      setUint322(dataDescriptorView, dataDescriptorOffset, signature);
    }
  }
  if (zip64) {
    const rawExtraFieldZip64View = getDataView2(rawExtraFieldZip64);
    setUint16(rawExtraFieldZip64View, 0, EXTRAFIELD_TYPE_ZIP64);
    setUint16(rawExtraFieldZip64View, 2, getLength(rawExtraFieldZip64) - 4);
    let rawExtraFieldZip64Offset = 4;
    if (zip64UncompressedSize) {
      setUint322(headerView, 18, MAX_32_BITS);
      setBigUint64(rawExtraFieldZip64View, rawExtraFieldZip64Offset, BigInt(uncompressedSize));
      rawExtraFieldZip64Offset += 8;
    }
    if (zip64CompressedSize) {
      setUint322(headerView, 14, MAX_32_BITS);
      setBigUint64(rawExtraFieldZip64View, rawExtraFieldZip64Offset, BigInt(compressedSize));
    }
    if (dataDescriptor) {
      setBigUint64(dataDescriptorView, dataDescriptorOffset + 4, BigInt(compressedSize));
      setBigUint64(dataDescriptorView, dataDescriptorOffset + 12, BigInt(uncompressedSize));
    }
  } else {
    setUint322(headerView, 14, compressedSize);
    setUint322(headerView, 18, uncompressedSize);
    if (dataDescriptor) {
      setUint322(dataDescriptorView, dataDescriptorOffset + 4, compressedSize);
      setUint322(dataDescriptorView, dataDescriptorOffset + 8, uncompressedSize);
    }
  }
}
async function writeExtraHeaderInfo(fileEntry, entryData, writable, { zipCrypto }) {
  let arrayBuffer;
  arrayBuffer = await entryData.slice(0, 26).arrayBuffer();
  if (arrayBuffer.byteLength != 26) {
    arrayBuffer = arrayBuffer.slice(0, 26);
  }
  const arrayBufferView = new DataView(arrayBuffer);
  if (!fileEntry.encrypted || zipCrypto) {
    setUint322(arrayBufferView, 14, fileEntry.signature);
  }
  if (fileEntry.zip64) {
    setUint322(arrayBufferView, 18, MAX_32_BITS);
    setUint322(arrayBufferView, 22, MAX_32_BITS);
  } else {
    setUint322(arrayBufferView, 18, fileEntry.compressedSize);
    setUint322(arrayBufferView, 22, fileEntry.uncompressedSize);
  }
  await writeData(writable, new Uint8Array(arrayBuffer));
  return entryData.slice(arrayBuffer.byteLength);
}
function setZip64ExtraInfo(fileEntry, options) {
  const { rawExtraFieldZip64, offset, diskNumberStart } = fileEntry;
  const { zip64UncompressedSize, zip64CompressedSize, zip64Offset, zip64DiskNumberStart } = options;
  const rawExtraFieldZip64View = getDataView2(rawExtraFieldZip64);
  let rawExtraFieldZip64Offset = 4;
  if (zip64UncompressedSize) {
    rawExtraFieldZip64Offset += 8;
  }
  if (zip64CompressedSize) {
    rawExtraFieldZip64Offset += 8;
  }
  if (zip64Offset) {
    setBigUint64(rawExtraFieldZip64View, rawExtraFieldZip64Offset, BigInt(offset));
    rawExtraFieldZip64Offset += 8;
  }
  if (zip64DiskNumberStart) {
    setUint322(rawExtraFieldZip64View, rawExtraFieldZip64Offset, diskNumberStart);
  }
}
async function closeFile(zipWriter, comment, options) {
  const { files, writer } = zipWriter;
  const { diskOffset, writable } = writer;
  let { diskNumber } = writer;
  let offset = 0;
  let directoryDataLength = 0;
  let directoryOffset = zipWriter.offset - diskOffset;
  let filesLength = files.size;
  for (const [, fileEntry] of files) {
    const {
      rawFilename,
      rawExtraFieldZip64,
      rawExtraFieldAES,
      rawComment,
      rawExtraFieldNTFS,
      rawExtraField,
      extendedTimestamp,
      extraFieldExtendedTimestampFlag,
      lastModDate
    } = fileEntry;
    let rawExtraFieldTimestamp;
    if (extendedTimestamp) {
      rawExtraFieldTimestamp = new Uint8Array(9);
      const extraFieldExtendedTimestampView = getDataView2(rawExtraFieldTimestamp);
      setUint16(extraFieldExtendedTimestampView, 0, EXTRAFIELD_TYPE_EXTENDED_TIMESTAMP);
      setUint16(extraFieldExtendedTimestampView, 2, 5);
      setUint8(extraFieldExtendedTimestampView, 4, extraFieldExtendedTimestampFlag);
      setUint322(extraFieldExtendedTimestampView, 5, Math.floor(lastModDate.getTime() / 1e3));
    } else {
      rawExtraFieldTimestamp = new Uint8Array();
    }
    fileEntry.rawExtraFieldCDExtendedTimestamp = rawExtraFieldTimestamp;
    directoryDataLength += 46 + getLength(
      rawFilename,
      rawComment,
      rawExtraFieldZip64,
      rawExtraFieldAES,
      rawExtraFieldNTFS,
      rawExtraFieldTimestamp,
      rawExtraField
    );
  }
  const directoryArray = new Uint8Array(directoryDataLength);
  const directoryView = getDataView2(directoryArray);
  await initStream(writer);
  let directoryDiskOffset = 0;
  for (const [indexFileEntry, fileEntry] of Array.from(files.values()).entries()) {
    const {
      offset: fileEntryOffset,
      rawFilename,
      rawExtraFieldZip64,
      rawExtraFieldAES,
      rawExtraFieldCDExtendedTimestamp,
      rawExtraFieldNTFS,
      rawExtraField,
      rawComment,
      versionMadeBy,
      headerArray,
      directory,
      zip64: zip642,
      zip64UncompressedSize,
      zip64CompressedSize,
      zip64DiskNumberStart,
      zip64Offset,
      msDosCompatible,
      internalFileAttribute,
      externalFileAttribute,
      diskNumberStart,
      uncompressedSize,
      compressedSize
    } = fileEntry;
    const extraFieldLength = getLength(rawExtraFieldZip64, rawExtraFieldAES, rawExtraFieldCDExtendedTimestamp, rawExtraFieldNTFS, rawExtraField);
    setUint322(directoryView, offset, CENTRAL_FILE_HEADER_SIGNATURE);
    setUint16(directoryView, offset + 4, versionMadeBy);
    const headerView = getDataView2(headerArray);
    if (!zip64UncompressedSize) {
      setUint322(headerView, 18, uncompressedSize);
    }
    if (!zip64CompressedSize) {
      setUint322(headerView, 14, compressedSize);
    }
    arraySet(directoryArray, headerArray, offset + 6);
    setUint16(directoryView, offset + 30, extraFieldLength);
    setUint16(directoryView, offset + 32, getLength(rawComment));
    setUint16(directoryView, offset + 34, zip642 && zip64DiskNumberStart ? MAX_16_BITS : diskNumberStart);
    setUint16(directoryView, offset + 36, internalFileAttribute);
    if (externalFileAttribute) {
      setUint322(directoryView, offset + 38, externalFileAttribute);
    } else if (directory && msDosCompatible) {
      setUint8(directoryView, offset + 38, FILE_ATTR_MSDOS_DIR_MASK);
    }
    setUint322(directoryView, offset + 42, zip642 && zip64Offset ? MAX_32_BITS : fileEntryOffset);
    arraySet(directoryArray, rawFilename, offset + 46);
    arraySet(directoryArray, rawExtraFieldZip64, offset + 46 + getLength(rawFilename));
    arraySet(directoryArray, rawExtraFieldAES, offset + 46 + getLength(rawFilename, rawExtraFieldZip64));
    arraySet(directoryArray, rawExtraFieldCDExtendedTimestamp, offset + 46 + getLength(rawFilename, rawExtraFieldZip64, rawExtraFieldAES));
    arraySet(directoryArray, rawExtraFieldNTFS, offset + 46 + getLength(rawFilename, rawExtraFieldZip64, rawExtraFieldAES, rawExtraFieldCDExtendedTimestamp));
    arraySet(directoryArray, rawExtraField, offset + 46 + getLength(rawFilename, rawExtraFieldZip64, rawExtraFieldAES, rawExtraFieldCDExtendedTimestamp, rawExtraFieldNTFS));
    arraySet(directoryArray, rawComment, offset + 46 + getLength(rawFilename) + extraFieldLength);
    const directoryEntryLength = 46 + getLength(rawFilename, rawComment) + extraFieldLength;
    if (offset - directoryDiskOffset > writer.availableSize) {
      writer.availableSize = 0;
      await writeData(writable, directoryArray.slice(directoryDiskOffset, offset));
      directoryDiskOffset = offset;
    }
    offset += directoryEntryLength;
    if (options.onprogress) {
      try {
        await options.onprogress(indexFileEntry + 1, files.size, new Entry(fileEntry));
      } catch (_error) {
      }
    }
  }
  await writeData(writable, directoryDiskOffset ? directoryArray.slice(directoryDiskOffset) : directoryArray);
  let lastDiskNumber = writer.diskNumber;
  const { availableSize } = writer;
  if (availableSize < END_OF_CENTRAL_DIR_LENGTH) {
    lastDiskNumber++;
  }
  let zip64 = getOptionValue2(zipWriter, options, "zip64");
  if (directoryOffset > MAX_32_BITS || directoryDataLength > MAX_32_BITS || filesLength > MAX_16_BITS || lastDiskNumber > MAX_16_BITS) {
    if (zip64 === false) {
      throw new Error(ERR_UNSUPPORTED_FORMAT);
    } else {
      zip64 = true;
    }
  }
  const endOfdirectoryArray = new Uint8Array(zip64 ? ZIP64_END_OF_CENTRAL_DIR_TOTAL_LENGTH : END_OF_CENTRAL_DIR_LENGTH);
  const endOfdirectoryView = getDataView2(endOfdirectoryArray);
  offset = 0;
  if (zip64) {
    setUint322(endOfdirectoryView, 0, ZIP64_END_OF_CENTRAL_DIR_SIGNATURE);
    setBigUint64(endOfdirectoryView, 4, BigInt(44));
    setUint16(endOfdirectoryView, 12, 45);
    setUint16(endOfdirectoryView, 14, 45);
    setUint322(endOfdirectoryView, 16, lastDiskNumber);
    setUint322(endOfdirectoryView, 20, diskNumber);
    setBigUint64(endOfdirectoryView, 24, BigInt(filesLength));
    setBigUint64(endOfdirectoryView, 32, BigInt(filesLength));
    setBigUint64(endOfdirectoryView, 40, BigInt(directoryDataLength));
    setBigUint64(endOfdirectoryView, 48, BigInt(directoryOffset));
    setUint322(endOfdirectoryView, 56, ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIGNATURE);
    setBigUint64(endOfdirectoryView, 64, BigInt(directoryOffset) + BigInt(directoryDataLength));
    setUint322(endOfdirectoryView, 72, lastDiskNumber + 1);
    const supportZip64SplitFile = getOptionValue2(zipWriter, options, "supportZip64SplitFile", true);
    if (supportZip64SplitFile) {
      lastDiskNumber = MAX_16_BITS;
      diskNumber = MAX_16_BITS;
    }
    filesLength = MAX_16_BITS;
    directoryOffset = MAX_32_BITS;
    directoryDataLength = MAX_32_BITS;
    offset += ZIP64_END_OF_CENTRAL_DIR_LENGTH + ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH;
  }
  setUint322(endOfdirectoryView, offset, END_OF_CENTRAL_DIR_SIGNATURE);
  setUint16(endOfdirectoryView, offset + 4, lastDiskNumber);
  setUint16(endOfdirectoryView, offset + 6, diskNumber);
  setUint16(endOfdirectoryView, offset + 8, filesLength);
  setUint16(endOfdirectoryView, offset + 10, filesLength);
  setUint322(endOfdirectoryView, offset + 12, directoryDataLength);
  setUint322(endOfdirectoryView, offset + 16, directoryOffset);
  const commentLength = getLength(comment);
  if (commentLength) {
    if (commentLength <= MAX_16_BITS) {
      setUint16(endOfdirectoryView, offset + 20, commentLength);
    } else {
      throw new Error(ERR_INVALID_COMMENT);
    }
  }
  await writeData(writable, endOfdirectoryArray);
  if (commentLength) {
    await writeData(writable, comment);
  }
}
async function writeData(writable, array) {
  const streamWriter = writable.getWriter();
  try {
    await streamWriter.ready;
    writable.size += getLength(array);
    await streamWriter.write(array);
  } finally {
    streamWriter.releaseLock();
  }
}
function getTimeNTFS(date) {
  if (date) {
    return (BigInt(date.getTime()) + BigInt(116444736e5)) * BigInt(1e4);
  }
}
function getOptionValue2(zipWriter, options, name, defaultValue) {
  const result = options[name] === UNDEFINED_VALUE ? zipWriter.options[name] : options[name];
  return result === UNDEFINED_VALUE ? defaultValue : result;
}
function getMaximumCompressedSize2(uncompressedSize) {
  return uncompressedSize + 5 * (Math.floor(uncompressedSize / 16383) + 1);
}
function setUint8(view, offset, value) {
  view.setUint8(offset, value);
}
function setUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}
function setUint322(view, offset, value) {
  view.setUint32(offset, value, true);
}
function setBigUint64(view, offset, value) {
  view.setBigUint64(offset, value, true);
}
function arraySet(array, typedArray, offset) {
  array.set(typedArray, offset);
}
function getDataView2(array) {
  return new DataView(array.buffer);
}
function getLength(...arrayLikes) {
  let result = 0;
  arrayLikes.forEach((arrayLike) => arrayLike && (result += arrayLike.length));
  return result;
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/core/zip-fs-core.js
var ZipEntry2 = class {
  constructor(fs2, name, params, parent) {
    const zipEntry = this;
    if (fs2.root && parent && parent.getChildByName(name)) {
      throw new Error("Entry filename already exists");
    }
    if (!params) {
      params = {};
    }
    Object.assign(zipEntry, {
      fs: fs2,
      name,
      data: params.data,
      options: params.options,
      id: fs2.entries.length,
      parent,
      children: [],
      uncompressedSize: params.uncompressedSize || 0
    });
    fs2.entries.push(zipEntry);
    if (parent) {
      zipEntry.parent.children.push(zipEntry);
    }
  }
  moveTo(target) {
    const zipEntry = this;
    zipEntry.fs.move(zipEntry, target);
  }
  getFullname() {
    return this.getRelativeName();
  }
  getRelativeName(ancestor = this.fs.root) {
    const zipEntry = this;
    let relativeName = zipEntry.name;
    let entry = zipEntry.parent;
    while (entry && entry != ancestor) {
      relativeName = (entry.name ? entry.name + "/" : "") + relativeName;
      entry = entry.parent;
    }
    return relativeName;
  }
  isDescendantOf(ancestor) {
    let entry = this.parent;
    while (entry && entry.id != ancestor.id) {
      entry = entry.parent;
    }
    return Boolean(entry);
  }
  rename(name) {
    const parent = this.parent;
    if (parent && parent.getChildByName(name)) {
      throw new Error("Entry filename already exists");
    } else {
      this.name = name;
    }
  }
};
var ZipFileEntry = class _ZipFileEntry extends ZipEntry2 {
  constructor(fs2, name, params, parent) {
    super(fs2, name, params, parent);
    const zipEntry = this;
    zipEntry.Reader = params.Reader;
    zipEntry.Writer = params.Writer;
    if (params.getData) {
      zipEntry.getData = params.getData;
    }
  }
  clone() {
    return new _ZipFileEntry(this.fs, this.name, this);
  }
  async getData(writer, options = {}) {
    const zipEntry = this;
    if (!writer || writer.constructor == zipEntry.Writer && zipEntry.data) {
      return zipEntry.data;
    } else {
      const reader = zipEntry.reader = new zipEntry.Reader(zipEntry.data, options);
      const uncompressedSize = zipEntry.data ? zipEntry.data.uncompressedSize : reader.size;
      await Promise.all([initStream(reader), initStream(writer, uncompressedSize)]);
      const readable = reader.readable;
      readable.size = zipEntry.uncompressedSize = reader.size;
      await readable.pipeTo(writer.writable);
      return writer.getData ? writer.getData() : writer.writable;
    }
  }
  isPasswordProtected() {
    return this.data.encrypted;
  }
  async checkPassword(password, options = {}) {
    const zipEntry = this;
    if (zipEntry.isPasswordProtected()) {
      options.password = password;
      options.checkPasswordOnly = true;
      try {
        await zipEntry.data.getData(null, options);
        return true;
      } catch (error) {
        if (error.message == ERR_INVALID_PASSWORD) {
          return false;
        } else {
          throw error;
        }
      }
    } else {
      return true;
    }
  }
  getText(encoding, options) {
    return this.getData(new TextWriter(encoding), options);
  }
  getBlob(mimeType, options) {
    return this.getData(new BlobWriter(mimeType), options);
  }
  getData64URI(mimeType, options) {
    return this.getData(new Data64URIWriter(mimeType), options);
  }
  getUint8Array(options) {
    return this.getData(new Uint8ArrayWriter(), options);
  }
  getWritable(writable = new WritableStream(), options) {
    return this.getData({ writable }, options);
  }
  replaceBlob(blob) {
    Object.assign(this, {
      data: blob,
      Reader: BlobReader,
      Writer: BlobWriter,
      reader: null
    });
  }
  replaceText(text) {
    Object.assign(this, {
      data: text,
      Reader: TextReader,
      Writer: TextWriter,
      reader: null
    });
  }
  replaceData64URI(dataURI) {
    Object.assign(this, {
      data: dataURI,
      Reader: Data64URIReader,
      Writer: Data64URIWriter,
      reader: null
    });
  }
  replaceUint8Array(array) {
    Object.assign(this, {
      data: array,
      Reader: Uint8ArrayReader,
      Writer: Uint8ArrayWriter,
      reader: null
    });
  }
  replaceReadable(readable) {
    Object.assign(this, {
      data: null,
      Reader: function() {
        return { readable };
      },
      Writer: null,
      reader: null
    });
  }
};
var ZipDirectoryEntry = class _ZipDirectoryEntry extends ZipEntry2 {
  constructor(fs2, name, params, parent) {
    super(fs2, name, params, parent);
    this.directory = true;
  }
  clone(deepClone) {
    const zipEntry = this;
    const clonedEntry = new _ZipDirectoryEntry(zipEntry.fs, zipEntry.name);
    if (deepClone) {
      clonedEntry.children = zipEntry.children.map((child) => {
        const childClone = child.clone(deepClone);
        childClone.parent = clonedEntry;
        return childClone;
      });
    }
    return clonedEntry;
  }
  addDirectory(name, options) {
    return addChild(this, name, { options }, true);
  }
  addText(name, text, options = {}) {
    return addChild(this, name, {
      data: text,
      Reader: TextReader,
      Writer: TextWriter,
      options,
      uncompressedSize: text.length
    });
  }
  addBlob(name, blob, options = {}) {
    return addChild(this, name, {
      data: blob,
      Reader: BlobReader,
      Writer: BlobWriter,
      options,
      uncompressedSize: blob.size
    });
  }
  addData64URI(name, dataURI, options = {}) {
    let dataEnd = dataURI.length;
    while (dataURI.charAt(dataEnd - 1) == "=") {
      dataEnd--;
    }
    const dataStart = dataURI.indexOf(",") + 1;
    return addChild(this, name, {
      data: dataURI,
      Reader: Data64URIReader,
      Writer: Data64URIWriter,
      options,
      uncompressedSize: Math.floor((dataEnd - dataStart) * 0.75)
    });
  }
  addUint8Array(name, array, options = {}) {
    return addChild(this, name, {
      data: array,
      Reader: Uint8ArrayReader,
      Writer: Uint8ArrayWriter,
      options,
      uncompressedSize: array.length
    });
  }
  addHttpContent(name, url, options = {}) {
    return addChild(this, name, {
      data: url,
      Reader: class extends HttpReader {
        constructor(url2) {
          super(url2, options);
        }
      },
      options
    });
  }
  addReadable(name, readable, options = {}) {
    return addChild(this, name, {
      Reader: function() {
        return { readable };
      },
      options
    });
  }
  addFileSystemEntry(fileSystemEntry, options = {}) {
    return addFileSystemHandle(this, fileSystemEntry, options);
  }
  addFileSystemHandle(handle, options = {}) {
    return addFileSystemHandle(this, handle, options);
  }
  addFile(file, options = {}) {
    if (!options.lastModDate) {
      options.lastModDate = new Date(file.lastModified);
    }
    return addChild(this, file.name, {
      data: file,
      Reader: function() {
        const readable = file.stream();
        const size = file.size;
        return { readable, size };
      },
      options,
      uncompressedSize: file.size
    });
  }
  addData(name, params) {
    return addChild(this, name, params);
  }
  importBlob(blob, options) {
    return this.importZip(new BlobReader(blob), options);
  }
  importData64URI(dataURI, options) {
    return this.importZip(new Data64URIReader(dataURI), options);
  }
  importUint8Array(array, options) {
    return this.importZip(new Uint8ArrayReader(array), options);
  }
  importHttpContent(url, options) {
    return this.importZip(new HttpReader(url, options), options);
  }
  importReadable(readable, options) {
    return this.importZip({ readable }, options);
  }
  exportBlob(options = {}) {
    return this.exportZip(new BlobWriter(options.mimeType || "application/zip"), options);
  }
  exportData64URI(options = {}) {
    return this.exportZip(new Data64URIWriter(options.mimeType || "application/zip"), options);
  }
  exportUint8Array(options = {}) {
    return this.exportZip(new Uint8ArrayWriter(), options);
  }
  async exportWritable(writable = new WritableStream(), options = {}) {
    await this.exportZip({ writable }, options);
    return writable;
  }
  async importZip(reader, options = {}) {
    await initStream(reader);
    const zipReader = new ZipReader(reader, options);
    const importedEntries = [];
    const entries = await zipReader.getEntries();
    for (const entry of entries) {
      let parent = this;
      try {
        const path = entry.filename.split("/");
        const name = path.pop();
        path.forEach((pathPart, pathIndex) => {
          const previousParent = parent;
          parent = parent.getChildByName(pathPart);
          if (!parent) {
            parent = new _ZipDirectoryEntry(this.fs, pathPart, { data: pathIndex == path.length - 1 ? entry : null }, previousParent);
            importedEntries.push(parent);
          }
        });
        if (!entry.directory) {
          importedEntries.push(addChild(parent, name, {
            data: entry,
            Reader: getZipBlobReader(Object.assign({}, options)),
            uncompressedSize: entry.uncompressedSize
          }));
        }
      } catch (error) {
        try {
          error.cause = {
            entry
          };
        } catch (_error) {
        }
        throw error;
      }
    }
    return importedEntries;
  }
  async exportZip(writer, options) {
    const zipEntry = this;
    if (options.bufferedWrite === UNDEFINED_VALUE) {
      options.bufferedWrite = true;
    }
    await Promise.all([initReaders(zipEntry, options.readerOptions), initStream(writer)]);
    const zipWriter = new ZipWriter(writer, options);
    await exportZip(zipWriter, zipEntry, getTotalSize([zipEntry], "uncompressedSize"), options);
    await zipWriter.close();
    return writer.getData ? writer.getData() : writer.writable;
  }
  getChildByName(name) {
    const children = this.children;
    for (let childIndex = 0; childIndex < children.length; childIndex++) {
      const child = children[childIndex];
      if (child.name == name) {
        return child;
      }
    }
  }
  isPasswordProtected() {
    const children = this.children;
    for (let childIndex = 0; childIndex < children.length; childIndex++) {
      const child = children[childIndex];
      if (child.isPasswordProtected()) {
        return true;
      }
    }
    return false;
  }
  async checkPassword(password, options = {}) {
    const children = this.children;
    const result = await Promise.all(children.map((child) => child.checkPassword(password, options)));
    return !result.includes(false);
  }
};
var FS = class {
  constructor() {
    resetFS(this);
  }
  get children() {
    return this.root.children;
  }
  remove(entry) {
    detach(entry);
    this.entries[entry.id] = null;
  }
  move(entry, destination) {
    if (entry == this.root) {
      throw new Error("Root directory cannot be moved");
    } else {
      if (destination.directory) {
        if (!destination.isDescendantOf(entry)) {
          if (entry != destination) {
            if (destination.getChildByName(entry.name)) {
              throw new Error("Entry filename already exists");
            }
            detach(entry);
            entry.parent = destination;
            destination.children.push(entry);
          }
        } else {
          throw new Error("Entry is a ancestor of target entry");
        }
      } else {
        throw new Error("Target entry is not a directory");
      }
    }
  }
  find(fullname) {
    const path = fullname.split("/");
    let node = this.root;
    for (let index = 0; node && index < path.length; index++) {
      node = node.getChildByName(path[index]);
    }
    return node;
  }
  getById(id) {
    return this.entries[id];
  }
  getChildByName(name) {
    return this.root.getChildByName(name);
  }
  addDirectory(name, options) {
    return this.root.addDirectory(name, options);
  }
  addText(name, text, options) {
    return this.root.addText(name, text, options);
  }
  addBlob(name, blob, options) {
    return this.root.addBlob(name, blob, options);
  }
  addData64URI(name, dataURI, options) {
    return this.root.addData64URI(name, dataURI, options);
  }
  addUint8Array(name, array, options) {
    return this.root.addUint8Array(name, array, options);
  }
  addHttpContent(name, url, options) {
    return this.root.addHttpContent(name, url, options);
  }
  addReadable(name, readable, options) {
    return this.root.addReadable(name, readable, options);
  }
  addFileSystemEntry(fileSystemEntry, options) {
    return this.root.addFileSystemEntry(fileSystemEntry, options);
  }
  addFileSystemHandle(handle, options) {
    return this.root.addFileSystemHandle(handle, options);
  }
  addFile(file, options) {
    return this.root.addFile(file, options);
  }
  addData(name, params) {
    return this.root.addData(name, params);
  }
  importBlob(blob, options) {
    resetFS(this);
    return this.root.importBlob(blob, options);
  }
  importData64URI(dataURI, options) {
    resetFS(this);
    return this.root.importData64URI(dataURI, options);
  }
  importUint8Array(array, options) {
    resetFS(this);
    return this.root.importUint8Array(array, options);
  }
  importHttpContent(url, options) {
    resetFS(this);
    return this.root.importHttpContent(url, options);
  }
  importReadable(readable, options) {
    resetFS(this);
    return this.root.importReadable(readable, options);
  }
  importZip(reader, options) {
    return this.root.importZip(reader, options);
  }
  exportBlob(options) {
    return this.root.exportBlob(options);
  }
  exportData64URI(options) {
    return this.root.exportData64URI(options);
  }
  exportUint8Array(options) {
    return this.root.exportUint8Array(options);
  }
  exportWritable(writable, options) {
    return this.root.exportWritable(writable, options);
  }
  isPasswordProtected() {
    return this.root.isPasswordProtected();
  }
  async checkPassword(password, options) {
    return this.root.checkPassword(password, options);
  }
};
var fs = { FS, ZipDirectoryEntry, ZipFileEntry };
function getTotalSize(entries, propertyName) {
  let size = 0;
  entries.forEach(process);
  return size;
  function process(entry) {
    size += entry[propertyName];
    if (entry.children) {
      entry.children.forEach(process);
    }
  }
}
function getZipBlobReader(options) {
  return class extends Reader {
    constructor(entry, options2 = {}) {
      super();
      this.entry = entry;
      this.options = options2;
    }
    async init() {
      const zipBlobReader = this;
      zipBlobReader.size = zipBlobReader.entry.uncompressedSize;
      const data = await zipBlobReader.entry.getData(new BlobWriter(), Object.assign({}, zipBlobReader.options, options));
      zipBlobReader.data = data;
      zipBlobReader.blobReader = new BlobReader(data);
      super.init();
    }
    readUint8Array(index, length) {
      return this.blobReader.readUint8Array(index, length);
    }
  };
}
async function initReaders(entry, options) {
  if (entry.children.length) {
    await Promise.all(entry.children.map(async (child) => {
      if (child.directory) {
        await initReaders(child, options);
      } else {
        const reader = child.reader = new child.Reader(child.data, options);
        try {
          await initStream(reader);
        } catch (error) {
          try {
            error.entryId = child.id;
            error.cause = {
              entry: child
            };
          } catch (_error) {
          }
          throw error;
        }
        child.uncompressedSize = reader.size;
      }
    }));
  }
}
function detach(entry) {
  if (entry.parent) {
    const children = entry.parent.children;
    children.forEach((child, index) => {
      if (child.id == entry.id) {
        children.splice(index, 1);
      }
    });
  }
}
async function exportZip(zipWriter, entry, totalSize, options) {
  const selectedEntry = entry;
  const entryOffsets = /* @__PURE__ */ new Map();
  await process(zipWriter, entry);
  async function process(zipWriter2, entry2) {
    await exportChild();
    async function exportChild() {
      if (options.bufferedWrite) {
        await Promise.allSettled(entry2.children.map(processChild));
      } else {
        for (const child of entry2.children) {
          await processChild(child);
        }
      }
    }
    async function processChild(child) {
      const name = options.relativePath ? child.getRelativeName(selectedEntry) : child.getFullname();
      let childOptions = child.options || {};
      let zipEntryOptions = {};
      if (child.data instanceof Entry) {
        const {
          externalFileAttribute,
          versionMadeBy,
          comment,
          lastModDate,
          creationDate,
          lastAccessDate
        } = child.data;
        zipEntryOptions = {
          externalFileAttribute,
          versionMadeBy,
          comment,
          lastModDate,
          creationDate,
          lastAccessDate
        };
      }
      await zipWriter2.add(name, child.reader, Object.assign({
        directory: child.directory
      }, Object.assign({}, options, zipEntryOptions, childOptions, {
        onprogress: async (indexProgress) => {
          if (options.onprogress) {
            entryOffsets.set(name, indexProgress);
            try {
              await options.onprogress(Array.from(entryOffsets.values()).reduce((previousValue, currentValue) => previousValue + currentValue), totalSize);
            } catch (_error) {
            }
          }
        }
      })));
      await process(zipWriter2, child);
    }
  }
}
async function addFileSystemHandle(zipEntry, handle, options) {
  return addFile2(zipEntry, handle, []);
  async function addFile2(parentEntry, handle2, addedEntries) {
    if (handle2) {
      try {
        if (handle2.isFile || handle2.isDirectory) {
          handle2 = await transformToFileSystemhandle(handle2);
        }
        if (handle2.kind == "file") {
          const file = await handle2.getFile();
          addedEntries.push(
            parentEntry.addData(file.name, {
              Reader: function() {
                const readable = file.stream();
                const size = file.size;
                return { readable, size };
              },
              options: Object.assign({}, { lastModDate: new Date(file.lastModified) }, options),
              uncompressedSize: file.size
            })
          );
        } else if (handle2.kind == "directory") {
          const directoryEntry = parentEntry.addDirectory(handle2.name);
          addedEntries.push(directoryEntry);
          for await (const childHandle of handle2.values()) {
            await addFile2(directoryEntry, childHandle, addedEntries);
          }
        }
      } catch (error) {
        const message = error.message + (handle2 ? " (" + handle2.name + ")" : "");
        throw new Error(message);
      }
    }
    return addedEntries;
  }
}
async function transformToFileSystemhandle(entry) {
  const handle = {
    name: entry.name
  };
  if (entry.isFile) {
    handle.kind = "file";
    handle.getFile = () => new Promise((resolve, reject) => entry.file(resolve, reject));
  }
  if (entry.isDirectory) {
    handle.kind = "directory";
    const handles = await transformToFileSystemhandles(entry);
    handle.values = () => handles;
  }
  return handle;
}
async function transformToFileSystemhandles(entry) {
  const entries = [];
  function readEntries(directoryReader, resolve, reject) {
    directoryReader.readEntries(async (entriesPart) => {
      if (!entriesPart.length) {
        resolve(entries);
      } else {
        for (const entry2 of entriesPart) {
          entries.push(await transformToFileSystemhandle(entry2));
        }
        readEntries(directoryReader, resolve, reject);
      }
    }, reject);
  }
  await new Promise(
    (resolve, reject) => readEntries(entry.createReader(), resolve, reject)
  );
  return {
    [Symbol.iterator]() {
      let entryIndex = 0;
      return {
        next() {
          const result = {
            value: entries[entryIndex],
            done: entryIndex === entries.length
          };
          entryIndex++;
          return result;
        }
      };
    }
  };
}
function resetFS(fs2) {
  fs2.entries = [];
  fs2.root = new ZipDirectoryEntry(fs2);
}
function addChild(parent, name, params, directory) {
  if (parent.directory) {
    return directory ? new ZipDirectoryEntry(parent.fs, name, params, parent) : new ZipFileEntry(parent.fs, name, params, parent);
  } else {
    throw new Error("Parent entry is not a directory");
  }
}

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/lib/zip-fs.js
var baseURL;
try {
  baseURL = import.meta.url;
} catch (_error) {
}
configure({ baseURL });
e2(configure);

// node_modules/.pnpm/@zip.js+zip.js@2.7.48/node_modules/@zip.js/zip.js/index.js
configure({ Deflate: ZipDeflate, Inflate: ZipInflate });

// src/zip.ts
var ResponsifiedReader = class {
  constructor(responser, precursor) {
    this.responser = responser;
    this.precursor = precursor;
  }
  // @ts-ignore
  get readable() {
    const { readable, writable } = new TransformStream();
    const interval = setInterval(() => {
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
  async init() {
    const request = precursor2request(this.precursor);
    let method = "HEAD";
    if (request.url.startsWith("blob:")) {
      method = "GET";
    }
    const response = await this.responser.createResponse(new Request(request, { method }));
    const length = response.headers.get("Content-Length");
    if (length) this.size = Number(length);
  }
  async readUint8Array(index, length) {
    const response = await this.responser.createResponseFromPrecursor(this.precursor, index, length);
    const data = new Uint8Array(await response.arrayBuffer());
    return data;
  }
};
function getUint16LE(uint8View, offset) {
  return uint8View[offset] + uint8View[offset + 1] * 256;
}

// src/serviceworker.ts
function createId() {
  return crypto.randomUUID();
}
var UNZIP_CACHE_CHUNK_SIZE = 10 * 1024 * 1024;
var UNZIP_CACHE_NAME = "service-worker-responsify-unzip-cache";
var UNZIP_CACHE_RETAIN_INTERVAL = 10 * 1e3;
var Responser = class _Responser extends EventTarget22 {
  constructor() {
    super();
    this.path = new URL(self.registration.scope).pathname + "_service-worker-responsify";
    this.address = /* @__PURE__ */ new WeakMap();
    this.storage = /* @__PURE__ */ new Map();
    this.messenger = MessengerFactory.new(self);
    this.messenger.response("reserve", (_, e3) => {
      const uurl = this.getUniqueURL();
      const client = e3.source;
      if (!this.address.has(client)) this.address.set(client, MessengerFactory.new(client));
      this.storage.set(uurl.id, async (request) => {
        const messenger = this.address.get(client);
        const response = await messenger?.request("reserved", {
          id: uurl.id,
          precursor: request2precursor(request)
        }, request.body ? [request.body] : void 0);
        return response || { reuse: true, status: 404 };
      });
      return uurl;
    });
    this.messenger.response("store", (precursor) => {
      const uurl = this.getUniqueURL();
      this.storage.set(uurl.id, async (childRequest) => {
        const parentRequest = precursor2request(precursor, { method: childRequest.method });
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
          headers.set("Accept-Ranges", "bytes");
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
        const { body, ...init } = responsified;
        const result = { body: void 0, ...init };
        if (request.method === "GET") {
          if (responsified.reuse) {
            if (responsified.body instanceof ReadableStream) {
              const [stream1, stream2] = responsified.body.tee();
              responsified.body = stream1;
              result.body = stream2;
            } else {
              result.body = structuredClone(responsified.body);
            }
          } else {
            result.body = responsified.body;
          }
        }
        const headers = new Headers(result.headers);
        let length = 0;
        if (body) {
          if (body instanceof ReadableStream && responsified.length) {
            length = responsified.length;
          } else if ("buffer" in body) {
            length = body.buffer.byteLength;
          } else if (body instanceof Blob) {
            length = body.size;
          } else {
            length = body.length;
          }
          if (length) {
            headers.set("Accept-Ranges", "bytes");
            headers.set("Content-Length", length.toString());
          }
        }
        if (request.headers.has("Range")) {
          let { start, end } = parseRange(request.headers.get("Range"));
          if (end < 0 && length) end = length - 1;
          if (end < 0) headers.set("Content-Range", `bytes */*`);
          else {
            headers.set("Content-Range", `bytes ${start}-${end}/${length || "*"}`);
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
          result.status = 206;
          result.statusText = "Partial Content";
        }
        result.headers = Object.fromEntries([...headers]);
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
          const generators = parts.map((p2) => async () => (await this.createResponseFromPrecursor(p2)).body);
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
      this.storage.set(uurl.id, (request) => {
        const newname = encodeURIComponent(name.replace(/\//g, ":")).replace(/['()]/g, escape).replace(/\*/g, "%2A");
        const headers = {
          "Content-Type": "application/octet-stream; charset=utf-8",
          "Content-Disposition": "attachment; filename*=UTF-8''" + newname
        };
        if (size > 0n) headers["Content-Length"] = size.toString();
        const result = { reuse, headers };
        if (request.method === "GET") {
          result.body = N(this.zipSource(zip.entries), { buffersAreUTF8: true });
        }
        return result;
      });
      return uurl;
    });
    this.messenger.response("unzip", async (unzip) => {
      const uurl = this.getUniqueURL();
      const precursor = unzip.request;
      const unzipId = unzip.id || uurl.id;
      const password = unzip.password;
      let passwordChecked = false;
      const entryMap = /* @__PURE__ */ new Map();
      const entryDataOffset = /* @__PURE__ */ new Map();
      const entryMetaData = {};
      const entryInit = /* @__PURE__ */ new Map();
      const entryCurrentStream = {};
      const entryCurrentNumber = {};
      const entries = await new fs.FS().importZip(new ResponsifiedReader(this, precursor));
      for (let entry of entries) {
        if (!entry.data || entry.data.directory) continue;
        if (!passwordChecked && entry.isPasswordProtected()) {
          passwordChecked = true;
          if (!password || !await entry.checkPassword(password)) {
            return { passwordNeed: true, id: "", url: "", unzipId: "", entries: {} };
          }
        }
        const name = entry.data.filename;
        entryMap.set(name, entry);
        let data = {};
        for (let [key, value] of Object.entries(entry.data)) {
          if (value instanceof Function) {
            continue;
          }
          data[key] = value;
        }
        entryMetaData[name] = data;
      }
      this.storage.set(uurl.id, async (request) => {
        const param = new URL(request.url).searchParams;
        const path = param.get("path");
        if (!path) return { status: 400, body: "Need searchParam - 'path'", reuse: true };
        const entry = entryMap.get(path);
        if (!entry) return { status: 404, body: "Entry not found", reuse: true };
        const data = entry.data;
        const range = { start: 0, end: data.uncompressedSize - 1 };
        const isRanged = request.headers.has("Range");
        if (isRanged) {
          const parsed = parseRange(request.headers.get("Range"));
          range.start = parsed.start;
          if (parsed.end > 0) range.end = parsed.end;
        }
        if (range.end > data.uncompressedSize - 1) {
          return {
            headers: { "Content-Range": `bytes */${data.uncompressedSize}` },
            status: 416,
            reuse: true
          };
        }
        const result = {
          reuse: true,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${range.start}-${range.end}/${entry.uncompressedSize}`,
            "Content-Length": `${range.end - range.start + 1}`
          },
          status: isRanged ? 206 : 200
        };
        if (request.method === "HEAD") {
          return result;
        }
        if (data.compressedSize === data.uncompressedSize && !data.encrypted) {
          if (!entryDataOffset.has(path)) {
            const view = new Uint8Array(await (await this.createResponseFromPrecursor(precursor, data.offset + 26, 4)).arrayBuffer());
            entryDataOffset.set(path, data.offset + 30 + getUint16LE(view, 0) + getUint16LE(view, 2));
          }
          const offset = entryDataOffset.get(path);
          result.body = (await this.createResponseFromPrecursor(precursor, range.start + offset, range.end - range.start + 1)).body;
        } else {
          const cache = await caches.open(`${UNZIP_CACHE_NAME}:${unzipId}`);
          const scheme = `/${path}`;
          const emitter = entryInit.get(path) || new EventTarget22();
          if (!entryInit.has(path)) {
            entryInit.set(path, emitter);
            let number = entryCurrentNumber[path] = -1;
            const { readable: readable2, writable: writable2 } = fitMetaByteStream(UNZIP_CACHE_CHUNK_SIZE);
            data.getData(writable2, { password });
            readable2.pipeTo(new WritableStream({
              async write(stream) {
                number += 1;
                const [stream1, stream2] = stream.tee();
                entryCurrentStream[path] = stream1;
                entryCurrentNumber[path] = number;
                emitter.dispatch("cache-start", number);
                await cache.put(`${scheme}:${number}`, new Response(stream2));
                emitter.dispatch("cache-end", number);
                if (entryCurrentStream[path].locked) entryCurrentStream[path].cancel("expired");
              }
            }));
          }
          const { readable, writable } = new TransformStream();
          const startNumber = Math.floor(range.start / UNZIP_CACHE_CHUNK_SIZE);
          const endNumber = Math.floor((range.end + 1) / UNZIP_CACHE_CHUNK_SIZE);
          const startOffset = range.start % UNZIP_CACHE_CHUNK_SIZE;
          const endOffset = (range.end + 1) % UNZIP_CACHE_CHUNK_SIZE;
          const cycle = async () => {
            let errored = false;
            for (let i2 = startNumber; i2 <= endNumber; i2++) {
              let source;
              if (entryCurrentNumber[path] > i2) {
                source = (await cache.match(`${scheme}:${i2}`)).body;
              } else {
                if (entryCurrentNumber[path] < i2) {
                  await emitter.waitFor("cache-start", i2);
                }
                const [stream1, stream2] = entryCurrentStream[path].tee();
                entryCurrentStream[path] = stream1;
                source = stream2;
              }
              const sliceStart = i2 === startNumber && startOffset > 0;
              const sliceEnd = i2 === endNumber && endOffset > 0;
              if (sliceStart && sliceEnd) {
                source = source.pipeThrough(sliceByteStream(startOffset, endOffset));
              } else if (sliceStart) {
                source = source.pipeThrough(sliceByteStream(startOffset));
              } else if (sliceEnd) {
                source = source.pipeThrough(sliceByteStream(0, endOffset));
              }
              await source.pipeTo(writable, { preventClose: true, preventCancel: true }).catch((e3) => {
                errored = true;
              });
              if (errored) return;
            }
            await writable.close();
          };
          cycle();
          result.body = readable;
        }
        return result;
      });
      return {
        id: uurl.id,
        unzipId,
        url: uurl.url,
        passwordNeed: false,
        entries: entryMetaData
      };
    });
    const unzipRetainMap = /* @__PURE__ */ new Map();
    self.addEventListener("message", (e3) => {
      const unzipRetain = e3.data.unzipRetain;
      if (unzipRetain) {
        for (let unzipId of unzipRetain) {
          unzipRetainMap.set(`${UNZIP_CACHE_NAME}:${unzipId}`, Date.now());
        }
      }
    });
    setInterval(async () => {
      const keys = await caches.keys();
      const now = Date.now();
      for (let key of keys) {
        const time = unzipRetainMap.get(key);
        if (time && now - time > 2 * UNZIP_CACHE_RETAIN_INTERVAL) {
          caches.delete(key);
        }
        if (!time && key.startsWith(UNZIP_CACHE_NAME)) {
          caches.delete(key);
        }
      }
    }, 2 * UNZIP_CACHE_RETAIN_INTERVAL);
    this.messenger.response("revoke", (url) => {
      const id = this.parseId(url);
      let result = false;
      if (id) result = this.storage.delete(id);
      return result;
    });
    self.addEventListener("fetch", async (e3) => {
      const response = this.handleRequest(e3.request);
      if (response) e3.respondWith(response);
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
      if (responsified.status === 301 || responsified.status === 302) {
        const precursor = request2precursor(request.clone());
        precursor.url = responsified.headers.location;
        return await this.createResponse(precursor2request(precursor));
      }
      return new Response(body, init);
    }
    if (request.method === "HEAD" && request.url.startsWith("blob:")) {
      const length = (await fetch(request.url)).headers.get("Content-Length");
      return new Response(null, {
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": length
        }
      });
    }
    return await fetch(request);
  }
  async createResponseFromPrecursor(precursor, start, length) {
    const init = {};
    if (start !== void 0 && length) {
      init.method = "GET";
      const headers = new Headers(precursor.headers);
      headers.set("Range", `bytes=${start}-${start + length - 1}`);
      init.headers = Object.fromEntries([...headers]);
    }
    return this.createResponse(precursor2request(precursor, init));
  }
  parseId(url) {
    url = new URL(url);
    if (url.pathname !== this.path) return null;
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
    } catch (e3) {
      controller.abort(e3);
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

// src/client.ts
var Responsify = class _Responsify {
  constructor() {
    this.reserved = /* @__PURE__ */ new Map();
    // unzip
    this.unzipRetain = /* @__PURE__ */ new Set();
    this.messenger = MessengerFactory.new(navigator.serviceWorker);
    this.messenger.response("reserved", async ({ id, precursor }) => {
      const responsified = this.reserved.get(id);
      if (responsified) {
        const result = await responsified(precursor2request(precursor));
        if (result.body instanceof ReadableStream) {
          return { payload: result, transfer: [result.body] };
        }
        return result;
      } else {
        return { reuse: false, status: 404 };
      }
    });
    setInterval(() => {
      window.navigator.serviceWorker.controller?.postMessage({ unzipRetain: Array.from(this.unzipRetain) });
    }, UNZIP_CACHE_RETAIN_INTERVAL);
  }
  static get instance() {
    if (!this._instance) this._instance = new _Responsify();
    return this._instance;
  }
  // reserve (promised) window-created response and forward to service worker future
  static async reserve(generator, reuse) {
    const result = await this.instance.messenger.request("reserve", null);
    this.instance.reserved.set(result.id, async (request) => {
      if (!reuse) this.instance.reserved.delete(result.id);
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
  static async unzip(unzip, promptPassword = unzipPasswordPrompt) {
    let result = void 0;
    let isFirst = true;
    while (!result || result.passwordNeed) {
      result = await this.instance.messenger.request("unzip", unzip);
      if (result.passwordNeed) {
        unzip.password = await promptPassword(isFirst);
        isFirst = false;
      }
    }
    this.instance.unzipRetain.add(result.unzipId);
    return {
      url: result.url,
      entries: result.entries
    };
  }
  // revoke
  static async revoke(url) {
    return await this.instance.messenger.request("revoke", url);
  }
};
function unzipPasswordPrompt(isFirst) {
  let password;
  if (isFirst) {
    password = prompt("This file is encrypted. Please enter the password.");
  } else {
    password = prompt("The password does not match. Please check the password.");
  }
  if (!password) {
    return unzipPasswordPrompt(false);
  }
  return password;
}
async function responsify(responsifiable, init) {
  switch (responsifiable.constructor) {
    case ReadableStream:
      return responsifyStream(responsifiable, init);
    case Request:
      return responsifyRequest(responsifiable, init);
    case Response:
      return responsifyResponse(responsifiable, init);
    case String:
    case URL:
      return responsifyResponse(Response.redirect(responsifiable, 301), init);
    default:
      return responsifyResponse(new Response(responsifiable), init);
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
export {
  Responser,
  Responsify
};
