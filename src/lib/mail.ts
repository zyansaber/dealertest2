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
  };

  return emailjs.send(serviceId, templateId, templateParams);
};
