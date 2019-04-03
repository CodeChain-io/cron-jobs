import * as sgMail from "@sendgrid/mail";

export class EmailClient {
  private from: string;
  private publicUrl: string;

  public constructor(publicUrl: string) {
    if (process.env.SENDGRID_API_KEY == null) {
      if (process.env.NODE_ENV === "production") {
        throw Error(`SENDGRID_API_KEY not found`);
      } else {
        console.log("SENDGRID_API_KEY is null");
      }
    }
    sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
    this.from = "no-reply@kodebox.io";
    this.publicUrl = publicUrl;
  }

  public sendInvitation(
    email: string,
    token: string,
    inviter: string,
    role: string,
    orgName: string
  ): void {
    // FIXME: Is tokenType=member necessary?
    const link = `${this.publicUrl}/signup?token=${token}&tokenType=member`;
    const content = `'${inviter}' invited you as a '${role}' on '${orgName}' in CodeChain Console\n\n${link}`;
    this.send(
      email,
      `[CodeChain Console] ${inviter} invited you to ${orgName}`,
      content
    );
  }

  public async sendAnnouncement(
    email: string,
    title: string,
    content: string
  ): Promise<void> {
    // FIXME:
    await this.send(email, title, content);
  }

  public async resetPassword(email: string, token: string): Promise<void> {
    // FIXME: address is not fixed
    const link = `${this.publicUrl}/reset?token=${token}`;
    this.send(email, "[CodeChain Console] Password reset", link);
  }

  private async send(to: string, subject: string, text: string) {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    console.log(` Send an email to ${to}`);
    console.log(` subject: ${subject}`);
    console.log(` text: ${text}`);

    const { from } = this;
    return sgMail.send({
      from,
      to,
      subject,
      text
    });
  }
}
