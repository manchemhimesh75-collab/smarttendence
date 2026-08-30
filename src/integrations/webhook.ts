export interface WebhookConfig {
  url: string;
  secret: string;
  timeoutMs: number;
  maxRetries: number;
}

export interface WebhookPayload {
  event: 'attendance_recorded' | 'session_completed' | 'session_cancelled';
  timestamp: number;
  data: Record<string, unknown>;
  idempotencyKey: string;
}

export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

export class WebhookIntegration {
  private config: WebhookConfig;
  private pendingQueue: Map<string, { payload: WebhookPayload; retries: number }> = new Map();

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  async send(payload: WebhookPayload): Promise<WebhookResult> {
    const signature = await this.generateSignature(JSON.stringify(payload));
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Idempotency-Key': payload.idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true, statusCode: response.status };
      } else {
        const errorText = await response.text();
        return { success: false, statusCode: response.status, error: errorText };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async sendWithRetry(payload: WebhookPayload): Promise<WebhookResult> {
    let lastResult: WebhookResult = { success: false, error: 'Not attempted' };
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      lastResult = await this.send(payload);
      if (lastResult.success) return lastResult;
      
      if (attempt < this.config.maxRetries) {
        await this.delay(Math.min(1000 * Math.pow(2, attempt), 30000));
      }
    }
    
    return lastResult;
  }

  queueForLater(payload: WebhookPayload): void {
    this.pendingQueue.set(payload.idempotencyKey, { payload, retries: 0 });
  }

  async processQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const [key, item] of this.pendingQueue.entries()) {
      const result = await this.sendWithRetry(item.payload);
      processed++;
      
      if (result.success) {
        succeeded++;
        this.pendingQueue.delete(key);
      } else {
        failed++;
        item.retries++;
        if (item.retries >= this.config.maxRetries) {
          this.pendingQueue.delete(key);
        }
      }
    }

    return { processed, succeeded, failed };
  }

  getQueueSize(): number {
    return this.pendingQueue.size;
  }

  private async generateSignature(payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.config.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export function createWebhookIntegrationFromEnv(): WebhookIntegration | null {
  const url = process.env.WEBHOOK_URL;
  const secret = process.env.WEBHOOK_SECRET;
  
  if (!url || !secret) {
    return null;
  }

  return new WebhookIntegration({
    url,
    secret,
    timeoutMs: 10000,
    maxRetries: 3,
  });
}