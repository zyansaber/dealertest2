import emailjs from "emailjs-com";
import type { ShowOrder } from "@/types/showOrder";
import type { ShowRecord } from "@/types/show";
import type { TeamMember } from "@/types/teamMember";

interface DealerConfirmationParams {
  teamMember: TeamMember;
  order: ShowOrder;
  show?: ShowRecord;
  dealerName: string;
  pdfAttachment: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const buildDealerConfirmationEmailHtml = ({
  teamMember,
  order,
  show,
  dealerName,
}: Omit<DealerConfirmationParams, "pdfAttachment">) => {
  const showName = escapeHtml(show?.name || order.showId || "Show");
  const salesperson = escapeHtml(order.salesperson || teamMember.memberName);
  const dealer = escapeHtml(dealerName);
  const orderId = escapeHtml(order.orderId || "Order ID");
  const status = escapeHtml(order.status || "Pending");
  const model = escapeHtml(order.model || "Not set");
  const orderType = escapeHtml(order.orderType || "Not set");
  const date = escapeHtml(order.date || "Not set");
  const chassis = escapeHtml(order.chassisNumber || "Not recorded");

  return `
    <div style="font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; background:#f7f9fb; padding:32px; color:#0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 10px 50px rgba(15,23,42,0.08);">
        <tr>
          <td style="padding:32px 32px 12px; background:linear-gradient(135deg, #0f172a, #0ea5e9); color:#e2e8f0;">
            <div style="font-size:14px; text-transform:uppercase; letter-spacing:0.08em; opacity:0.8;">Dealer Confirmation</div>
            <div style="font-size:28px; font-weight:700; margin-top:8px;">${dealer}</div>
            <div style="margin-top:12px; font-size:16px; color:#cbd5e1;">Show: ${showName}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="font-size:16px; margin:0 0 12px;">Hi ${escapeHtml(teamMember.memberName)},</p>
            <p style="font-size:15px; line-height:1.6; margin:0 0 18px; color:#475569;">
              The dealer has confirmed the following order. A PDF summary is attached for your records.
            </p>
            <div style="border:1px solid #e2e8f0; border-radius:14px; overflow:hidden;">
              <div style="background:#0ea5e9; color:#0b1f33; padding:14px 18px; font-weight:700; font-size:14px; letter-spacing:0.03em;">Order Snapshot</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tbody>
                  <tr style="background:#f8fafc;">
                    <td style="padding:12px 18px; width:42%; font-weight:600;">Order ID</td>
                    <td style="padding:12px 18px; color:#0f172a;">${orderId}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 18px; font-weight:600; background:#ffffff;">Status</td>
                    <td style="padding:12px 18px; background:#ffffff; color:#059669; font-weight:700;">${status}</td>
                  </tr>
                  <tr style="background:#f8fafc;">
                    <td style="padding:12px 18px; font-weight:600;">Model</td>
                    <td style="padding:12px 18px; color:#0f172a;">${model}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 18px; font-weight:600; background:#ffffff;">Order Type</td>
                    <td style="padding:12px 18px; background:#ffffff; color:#0f172a;">${orderType}</td>
                  </tr>
                  <tr style="background:#f8fafc;">
                    <td style="padding:12px 18px; font-weight:600;">Date</td>
                    <td style="padding:12px 18px; color:#0f172a;">${date}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 18px; font-weight:600; background:#ffffff;">Chassis</td>
                    <td style="padding:12px 18px; background:#ffffff; color:#0f172a;">${chassis}</td>
                  </tr>
                  <tr style="background:#f8fafc;">
                    <td style="padding:12px 18px; font-weight:600;">Salesperson</td>
                    <td style="padding:12px 18px; color:#0f172a;">${salesperson}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style="margin:22px 0 8px; font-size:15px; line-height:1.6; color:#475569;">
              If you have any questions, reply directly to this email and our team will assist you.
            </p>
            <div style="margin-top:18px;">
              <a href="mailto:${escapeHtml(teamMember.email)}" style="display:inline-block; background:#0f172a; color:#e2e8f0; text-decoration:none; padding:12px 18px; border-radius:10px; font-weight:600; font-size:14px;">Contact Dealer Support</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#0f172a; color:#cbd5e1; padding:16px 32px; font-size:12px; letter-spacing:0.03em; text-transform:uppercase; text-align:center;">
            Snowy River Caravan Show Team
          </td>
        </tr>
      </table>
    </div>
  `;
};

const redactForLog = (pdfAttachment: string | undefined) => {
  if (!pdfAttachment) return "[none]";
  const preview = pdfAttachment.slice(0, 24);
  return `${preview}... (length: ${pdfAttachment.length})`;
};

const extractEmailJsErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const maybeStatus = (error as { status?: unknown }).status;
    const maybeText = (error as { text?: unknown }).text;

    if (maybeStatus || maybeText) {
      const statusPart =
        typeof maybeStatus === "number" || typeof maybeStatus === "string"
          ? `status ${maybeStatus}`
          : "unknown status";
      const textPart = typeof maybeText === "string" ? maybeText : "no message";
      return `EmailJS responded with ${statusPart}: ${textPart}`;
    }

    const json = JSON.stringify(error);
    if (json && json !== "{}") {
      return json;
    }
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown EmailJS error";
};

export const sendDealerConfirmationEmail = async ({
  teamMember,
  order,
  show,
  dealerName,
  pdfAttachment,
}: DealerConfirmationParams) => {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
  const templateId = "template_7780rdu";

  if (!serviceId || !publicKey) {
    throw new Error("EmailJS service is not configured. Please set VITE_EMAILJS_SERVICE_ID and VITE_EMAILJS_PUBLIC_KEY.");
  }

  if (!teamMember.email) {
    throw new Error("EmailJS payload missing recipient email");
  }

  if (!order.orderId) {
    throw new Error("EmailJS payload missing order ID");
  }

  emailjs.init(publicKey);

  const templateParams = {
    to_name: teamMember.memberName,
    to_email: teamMember.email,
    order_id: order.orderId,
    order_status: order.status || "",
    show_name: show?.name || order.showId || "",
    dealer_name: dealerName,
    salesperson: order.salesperson || teamMember.memberName,
    pdf_attachment: pdfAttachment,
    html_content: buildDealerConfirmationEmailHtml({ teamMember, order, show, dealerName }),
  };

  try {
    return await emailjs.send(serviceId, templateId, templateParams);
  } catch (error) {
    const message = extractEmailJsErrorMessage(error);

    // Surface enough context to debug payload issues without leaking the PDF content in logs.
    console.error("EmailJS send failed", {
      serviceId,
      templateId,
      to_email: templateParams.to_email,
      to_name: templateParams.to_name,
      order_id: templateParams.order_id,
      order_status: templateParams.order_status,
      show_name: templateParams.show_name,
      dealer_name: templateParams.dealer_name,
      salesperson: templateParams.salesperson,
      pdf_attachment: redactForLog(pdfAttachment),
      error,
      message,
    });
    throw new Error(`Failed to send confirmation email: ${message}`);
  }
};
