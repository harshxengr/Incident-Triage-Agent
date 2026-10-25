export interface Notifier {
  send(message: string): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async send(message: string): Promise<void> {
    console.log(`[notify] ${message}`);
  }
}