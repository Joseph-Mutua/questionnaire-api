import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import * as pug from "pug";
import { EmailTemplateData } from "../types";

dotenv.config({ path: "./config/.env" });

const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE,
  auth: {
    user: process.env.SMTP_MAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendEmail(to: string, subject: string, html: string) {
  const mailOptions = {
    from: process.env.SMTP_MAIL,
    to,
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
  console.log(`Email sent successfully to ${to}`);
}

export function loadEmailTemplate(
  templateName: string,
  data: EmailTemplateData
) {
  const templatePath = path.resolve(
    __dirname,
    ".",
    "templates",
    `${templateName}.pug`
  );
  const templateContent = fs.readFileSync(templatePath, "utf8");
  const compiledFunction = pug.compile(templateContent);

  return compiledFunction(data);
}
