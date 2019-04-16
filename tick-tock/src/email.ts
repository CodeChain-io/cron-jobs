import * as mail from "@sendgrid/mail";

export async function sendEMail(
    sendgridApiKey: string | null,
    to: string | null,
    networkId: string,
    value: string,
    date: string
): Promise<void> {
    if (sendgridApiKey == null) {
        return;
    }
    if (to == null) {
        throw Error("to is not specified");
    }
    mail.setApiKey(sendgridApiKey);
    const from = "no-reply+tck-tock@devop.codechain.io";
    const subject = `[info][${networkId}][tick-tock] is working - ${date}`;
    await mail.send({
        from,
        to,
        subject,
        content: [
            {
                value,
                type: "text/html"
            }
        ]
    });
}
