/**
 * Outbound WhatsApp. `Messenger` is the seam: the Worker uses the Cloud API
 * implementation, the simulator and tests use a fake that records messages.
 */
const GRAPH = "https://graph.facebook.com/v22.0";

export interface Button {
  id: string;
  title: string; // ≤ 20 characters
}

export interface Messenger {
  sendText(to: string, body: string): Promise<void>;
  sendButtons(to: string, body: string, buttons: Button[]): Promise<void>;
  sendImage(to: string, mediaId: string, caption?: string): Promise<void>;
  sendDocument(to: string, data: Uint8Array, filename: string, mime: string, caption?: string): Promise<void>;
  sendTemplate(to: string, name: string, lang: string, params: string[]): Promise<void>;
  downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }>;
}

export class WhatsAppError extends Error {
  readonly status: number;
  readonly code?: number;
  constructor(message: string, status: number, code?: number) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class CloudApiMessenger implements Messenger {
  private token: string;
  private phoneNumberId: string;
  constructor(token: string, phoneNumberId: string) {
    this.token = token;
    this.phoneNumberId = phoneNumberId;
  }

  private async post(path: string, body: unknown) {
    const res = await fetch(`${GRAPH}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
      throw new WhatsAppError(err.error?.message ?? `WhatsApp ${res.status}`, res.status, err.error?.code);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  private send(to: string, payload: Record<string, unknown>) {
    return this.post(`${this.phoneNumberId}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", to, ...payload });
  }

  async sendText(to: string, body: string) {
    await this.send(to, { type: "text", text: { body, preview_url: false } });
  }

  async sendButtons(to: string, body: string, buttons: Button[]) {
    await this.send(to, {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body.slice(0, 1024) },
        action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
      },
    });
  }

  async sendImage(to: string, mediaId: string, caption?: string) {
    await this.send(to, { type: "image", image: { id: mediaId, ...(caption ? { caption: caption.slice(0, 1024) } : {}) } });
  }

  async sendDocument(to: string, data: Uint8Array, filename: string, mime: string, caption?: string) {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append("file", new Blob([data], { type: mime }), filename);
    const up = await fetch(`${GRAPH}/${this.phoneNumberId}/media`, { method: "POST", headers: { Authorization: `Bearer ${this.token}` }, body: form });
    if (!up.ok) throw new WhatsAppError(`media upload ${up.status}`, up.status);
    const { id } = (await up.json()) as { id: string };
    await this.send(to, { type: "document", document: { id, filename, ...(caption ? { caption } : {}) } });
  }

  async sendTemplate(to: string, name: string, lang: string, params: string[]) {
    await this.send(to, {
      type: "template",
      template: { name, language: { code: lang }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
    });
  }

  async downloadMedia(mediaId: string) {
    const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!meta.ok) throw new WhatsAppError(`media lookup ${meta.status}`, meta.status);
    const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
    const file = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!file.ok) throw new WhatsAppError(`media download ${file.status}`, file.status);
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: mime_type };
  }
}
