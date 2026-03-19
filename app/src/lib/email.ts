import nodemailer from "nodemailer";
import { env } from "./env";
import { runtimeConfig } from "./config";

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  if (env.SMTP_HOST && env.SMTP_PORT) {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
    });
    await transporter.sendMail({
      from: env.SMTP_FROM ?? runtimeConfig.auth.resetEmailFromDefault,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    });
  } else {
    console.warn(`[Email] SMTP not configured — would send "${subject}" to ${to}`);
  }
}
