/**
 * S3 备用通道（HTTPS 轮询）的线上格式与编解码（纯逻辑、无 DOM，可单测）。
 *
 * 端点（与 WS 同源同反代，见 src/presence/protocol.ts）：
 * - POST /presence/poll/join {name} → {session, id, messages}
 * - POST /presence/poll（头 x-presence-session）{state?, events?} → {messages}
 * - POST /presence/poll/leave（头 x-presence-session）→ {}
 * messages/events 里的帧与 WS 完全同构：text 帧是 JSON 原文，bin 帧是 base64
 * （内容即 WS 上的二进制原样：12B 状态记录 / 快照帧 / 雪球事件帧）。
 */
import { POLL_INTERVAL_MS } from '../../../src/presence/protocol';

export const POLL_JOIN_URL = '/presence/poll/join';
export const POLL_URL = '/presence/poll';
export const POLL_LEAVE_URL = '/presence/poll/leave';
/** 轮询往返间隔：状态上报与快照拉取均为 2 Hz。 */
export const pollIntervalMs = POLL_INTERVAL_MS;
/** 轮询下状态上报间隔（秒）：WS 为 0.1 s（10 Hz），备用通道降为 0.5 s（2 Hz）。 */
export const pollSampleIntervalSeconds = POLL_INTERVAL_MS / 1000;
/** 待发事件队列上限（与 WS 侧雪球队列同量级）；超限丢最旧。 */
export const pollEventQueueLimit = 128;

export type PollWireMessage = { t: 'text'; d: string } | { t: 'bin'; d: string };

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64ToArrayBuffer(text: string): ArrayBuffer {
  const bytes = base64ToBytes(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function encodePollEvent(event: string | Uint8Array): PollWireMessage {
  return typeof event === 'string' ? { t: 'text', d: event } : { t: 'bin', d: bytesToBase64(event) };
}

/** 组装一次轮询往返的请求体：最新状态一帧 + 本周期攒下的事件。 */
export function buildPollBody(state: ArrayBuffer | undefined, events: readonly (string | Uint8Array)[]): string {
  const payload: { state?: string; events?: PollWireMessage[] } = {};
  if (state) payload.state = bytesToBase64(new Uint8Array(state));
  if (events.length) payload.events = events.map(encodePollEvent);
  return JSON.stringify(payload);
}

/** 校验并取出服务端回包里的 messages；形状不对返回 undefined（整包丢弃）。 */
export function parsePollMessages(payload: unknown): PollWireMessage[] | undefined {
  if (!payload || typeof payload !== 'object' || !('messages' in payload)) return undefined;
  const messages = (payload as { messages: unknown }).messages;
  if (!Array.isArray(messages)) return undefined;
  const parsed: PollWireMessage[] = [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') return undefined;
    const frame = message as { t?: unknown; d?: unknown };
    if ((frame.t === 'text' || frame.t === 'bin') && typeof frame.d === 'string') {
      parsed.push({ t: frame.t, d: frame.d });
    } else return undefined;
  }
  return parsed;
}

/** 把待发事件压进有界队列：满了丢最旧（与 WS 侧队列策略一致）。 */
export function pushPollEvent(queue: (string | Uint8Array)[], event: string | Uint8Array): void {
  queue.push(event);
  while (queue.length > pollEventQueueLimit) queue.shift();
}

/** 往返失败时把已取出的事件塞回队首（顺序不变），仍受队列上限约束。 */
export function requeuePollEvents(queue: (string | Uint8Array)[], failed: readonly (string | Uint8Array)[]): void {
  queue.unshift(...failed);
  while (queue.length > pollEventQueueLimit) queue.pop();
}
