export interface Notifier {
  send(message: string): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async send(message: string): Promise<void> {
    console.log(`[notify] ${message}`);
  }
}

export class SlackNotifier implements Notifier {
  constructor(private webhookUrl: string) {}

  async send(message: string): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    if (!res.ok) {
      throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
    }
  }
}