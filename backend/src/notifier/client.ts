export interface Notifier {
  send(message: string): Promise<void>;
  sendWithApproval?(params: {
    message: string;
    incidentId: string;
    requiresApproval: boolean;
  }): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async send(message: string): Promise<void> {
    console.log(`[notify] ${message}`);
  }
}

export class SlackNotifier implements Notifier {
  constructor(private webhookUrl: string) { }

  async send(message: string): Promise<void> {
    await this.post({ text: message });
  }

  async sendWithApproval(params: {
    message: string;
    incidentId: string;
    requiresApproval: boolean;
  }): Promise<void> {
    if (!params.requiresApproval) {
      await this.send(params.message);
      return;
    }

    await this.post({
      text: params.message,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: params.message } },
        {
          type: "actions",
          block_id: `incident_actions_${params.incidentId}`,
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Approve" },
              style: "primary",
              action_id: "approve_incident",
              value: params.incidentId,
              confirm: {
                title: { type: "plain_text", text: "Approve this action?" },
                text: { type: "mrkdwn", text: "This will execute the proposed remediation." },
                confirm: { type: "plain_text", text: "Approve" },
                deny: { type: "plain_text", text: "Cancel" },
              },
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Reject" },
              style: "danger",
              action_id: "reject_incident",
              value: params.incidentId,
            },
          ],
        },
      ],
    });
  }

  private async post(payload: Record<string, unknown>): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
  }
}