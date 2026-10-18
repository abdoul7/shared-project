import { randomUUID, createHash } from "node:crypto";
import WebSocket from "ws";
import {
  ready,
  identity,
  card,
  validateCard,
  sign,
  challenge,
  seal,
  open,
} from "./protocol.js";
export class ChatClient {
  static async create(options) {
    await ready;
    const parsed = new URL(options.url);
    if (
      parsed.protocol !== "wss:" ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    )
      throw Error("An authenticated WSS relay URL is required");
    const client = new ChatClient({ ...options, url: parsed.href });
    client.data = (await options.store.load()) || {
      v: 1,
      identity: identity(),
      contacts: [],
      history: [],
      outbox: [],
      dedup: [],
    };
    if (client.data.v !== 1) throw Error("Unsupported store version");
    await options.store.save(client.data);
    return client;
  }
  constructor(options) {
    this.options = options;
    this.connected = false;
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.socket = null;
    this.timer = null;
    this.stopped = true;
    this.reconnectAttempt = 0;
    this.lastError = null;
    this.flushCursor = 0;
  }
  contactCard() {
    return card(this.data.identity);
  }
  state() {
    return structuredClone({
      id: this.contactCard().id,
      connected: this.connected,
      error: this.lastError,
      contacts: this.data.contacts,
      history: this.data.history,
      outbox: this.data.outbox,
    });
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    for (const fn of this.listeners)
      try {
        fn(this.state());
      } catch {}
  }
  mutate(fn) {
    const result = this.queue.then(async () => {
      const before = structuredClone(this.data);
      try {
        return await fn();
      } catch (error) {
        this.data = before;
        throw error;
      }
    });
    this.queue = result.catch(() => {});
    return result;
  }
  async persist() {
    await this.options.store.save(structuredClone(this.data));
    this.emit();
  }
  addContact(input) {
    return this.mutate(async () => {
      const c = validateCard(input);
      if (c.id === this.contactCard().id) throw Error("Cannot add self");
      if (!this.data.contacts.some((x) => x.id === c.id)) {
        this.data.contacts.push(c);
        await this.persist();
      }
      this.allowlist();
      return c;
    });
  }
  transmit(value) {
    if (
      this.socket?.readyState === WebSocket.OPEN &&
      this.socket.bufferedAmount < 256 * 1024
    )
      this.socket.send(JSON.stringify(value));
  }
  allowlist() {
    if (!this.connected) return;
    const body = {
      v: 1,
      type: "allowlist",
      ids: this.data.contacts.map((c) => c.id),
      nonce: this.nonce,
    };
    this.transmit({
      type: "allowlist",
      ids: body.ids,
      signature: sign(body, this.data.identity),
    });
  }
  connect() {
    this.stopped = false;
    clearTimeout(this.reconnectTimer);
    if (this.connected) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.options.url, {
        ca: this.options.ca,
        maxPayload: 64 * 1024,
      });
      this.socket = ws;
      let settled = false,
        phase = "challenge",
        retryInterval;
      const timeout = setTimeout(() => {
        if (this.socket !== ws) return;
        this.lastError = "Relay authentication timed out";
        this.emit();
        reject(Error(this.lastError));
        ws.close();
      }, 10000);
      ws.on("message", (raw) => {
        if (this.socket !== ws) return;
        this.mutate(async () => {
          if (this.socket !== ws) return;
          const m = JSON.parse(raw);
          if (m.type === "challenge" && phase === "challenge") {
            if (
              m.scope !== this.options.url ||
              typeof m.nonce !== "string" ||
              !/^[A-Za-z0-9+/]{43}=$/.test(m.nonce)
            )
              throw Error("Relay scope or nonce mismatch");
            phase = "ready";
            this.nonce = m.nonce;
            this.transmit({
              type: "authenticate",
              card: this.contactCard(),
              signature: sign(challenge(m.scope, m.nonce), this.data.identity),
            });
          } else if (m.type === "ready" && phase === "ready") {
            phase = "authenticated";
            this.connected = true;
            this.lastError = null;
            this.reconnectAttempt = 0;
            this.allowlist();
            this.flush();
            clearTimeout(timeout);
            settled = true;
            retryInterval = setInterval(() => this.flush(), 2000);
            this.timer = retryInterval;
            this.emit();
            resolve();
          } else if (m.type === "envelope" && phase === "authenticated")
            await this.receive(m.envelope);
          else throw Error("Unexpected relay message");
        }).catch(() => {
          if (this.socket === ws) {
            this.lastError = "Relay protocol or durable storage failed";
            this.emit();
          }
          if (!settled) reject(Error("Relay protocol failed"));
          ws.close(1008, "Invalid protocol");
        });
      });
      ws.on("error", () => {
        clearTimeout(timeout);
        if (this.socket === ws) {
          this.lastError = "Cannot establish trusted TLS relay connection";
          this.emit();
        }
        if (!settled)
          reject(Error("Cannot establish trusted TLS relay connection"));
      });
      ws.on("close", () => {
        clearTimeout(timeout);
        clearInterval(retryInterval);
        if (this.socket === ws) {
          this.connected = false;
          this.connecting = null;
          this.emit();
          if (!this.stopped) {
            const wait = Math.min(
              30000,
              500 * 2 ** Math.min(6, this.reconnectAttempt++),
            );
            this.reconnectTimer = setTimeout(
              () => this.connect().catch(() => {}),
              wait,
            );
          }
        }
        if (!settled) reject(Error("Relay disconnected before authentication"));
      });
    });
    return this.connecting;
  }
  async disconnect() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.timer);
    const ws = this.socket;
    this.connected = false;
    this.connecting = null;
    this.socket = null;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      await new Promise((r) => {
        ws.once("close", r);
        ws.close();
      });
    }
    this.emit();
    await this.queue;
  }
  flush() {
    return this.mutate(async () => {
      let changed = false;
      for (const h of this.data.history)
        if (
          h.status === "pending" &&
          Date.now() - Date.parse(h.at) >
            (this.options.deliveryTimeoutMs ?? 30000)
        ) {
          h.status = "failed";
          changed = true;
        }
      if (changed) await this.persist();
      if (!this.connected || !this.data.outbox.length) return;
      const count = Math.min(25, this.data.outbox.length),
        start = this.flushCursor % this.data.outbox.length;
      for (let i = 0; i < count; i++)
        this.transmit({
          type: "envelope",
          envelope:
            this.data.outbox[(start + i) % this.data.outbox.length].envelope,
        });
      this.flushCursor = (start + count) % this.data.outbox.length;
    }).catch(() => {
      this.lastError = "Cannot persist delivery state";
      this.emit();
    });
  }
  send(peerId, text) {
    return this.mutate(async () => {
      const recipient = this.data.contacts.find((c) => c.id === peerId);
      if (!recipient) throw Error("Verify and add this contact first");
      if (
        typeof text !== "string" ||
        !text.trim() ||
        Buffer.byteLength(text) > 16000
      )
        throw Error("Message must contain 1–16000 bytes");
      const id = randomUUID(),
        from = this.contactCard().id;
      const payload = { v: 1, from, to: peerId, id, type: "message", text };
      const envelope = seal(payload, this.data.identity, recipient);
      this.data.history.push({
        id,
        from,
        to: peerId,
        text,
        status: "pending",
        at: new Date().toISOString(),
      });
      this.data.outbox.push({ id, peerId, envelope });
      await this.persist();
      if (this.connected) this.transmit({ type: "envelope", envelope });
      return id;
    });
  }
  retry(id) {
    return this.mutate(async () => {
      const p = this.data.outbox.find((x) => x.id === id);
      if (!p) throw Error("No pending message");
      const h = this.data.history.find((x) => x.id === id);
      if (h) {
        h.status = "pending";
        h.at = new Date().toISOString();
        await this.persist();
      }
      if (this.connected)
        this.transmit({ type: "envelope", envelope: p.envelope });
    });
  }
  async receive(envelope) {
    const sender = this.data.contacts.find((c) => c.id === envelope.from);
    if (!sender) throw Error("Unapproved sender");
    const p = open(envelope, this.data.identity, sender);
    if (p.type === "ack") {
      const pending = this.data.outbox.find(
        (x) => x.id === p.ackId && x.peerId === p.from,
      );
      if (pending) {
        this.data.outbox = this.data.outbox.filter((x) => x !== pending);
        const h = this.data.history.find((x) => x.id === p.ackId);
        if (h) h.status = "delivered";
        await this.persist();
      }
      return;
    }
    if (
      typeof p.text !== "string" ||
      !p.text.trim() ||
      Buffer.byteLength(p.text) > 16000
    )
      throw Error("Invalid message");
    const dedupKey = `${p.from}:${p.id}`,
      digest = createHash("sha256")
        .update(JSON.stringify(envelope))
        .digest("hex");
    const previous = this.data.dedup.find((x) => x.key === dedupKey);
    if (previous && previous.digest !== digest)
      throw Error("Message ID conflict");
    if (!previous) {
      this.data.dedup.push({ key: dedupKey, digest });
      this.data.history.push({
        id: p.id,
        from: p.from,
        to: p.to,
        text: p.text,
        status: "received",
        at: new Date().toISOString(),
      });
      await this.persist();
    }
    const ack = seal(
      {
        v: 1,
        from: p.to,
        to: p.from,
        id: randomUUID(),
        type: "ack",
        ackId: p.id,
      },
      this.data.identity,
      sender,
    );
    this.transmit({ type: "envelope", envelope: ack });
  }
}
