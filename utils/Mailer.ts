import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

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

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${to}`);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error; 
  }
}

export function loadEmailTemplate(templateName: string) {
  const templatePath = path.resolve(
    __dirname,
    ".",
    "templates",
    `${templateName}.html`
  );
  const templateContent = fs.readFileSync(templatePath, "utf8");
  return templateContent;
}