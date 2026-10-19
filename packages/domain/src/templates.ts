/**
 * Rafiq's approved customer templates, English and Arabic (Turkish for the
 * Türkiye edition falls back to English in this prototype and is labelled).
 * Rafiq fills them; it never writes free text to a customer.
 */
export type TemplateKey = 'CREDIT_POSTED' | 'CREDIT_REVERSED' | 'ROAMING_RESTRICTED' | 'OFFER_PRESENTED' | 'FIX_PRESENTED' | 'COMPLAINT_RESOLVED' | 'COMPLAINT_HANDED' | 'ORDER_ACTIVE';
export type Lang = 'en' | 'ar' | 'tr';

const T: Record<TemplateKey, { en: string; ar: string }> = {
  CREDIT_POSTED: {
    en: 'Dear {name}, we reviewed the charge of {disputed} you queried on invoice {invoice}. We found {finding}. A credit of {credit} has been applied to your account and will show on your next bill. Reference {ref}. Dhow Telecom.',
    ar: 'عزيزي {name}، راجعنا الرسم البالغ {disputed} الذي استفسرت عنه في الفاتورة {invoice}. وجدنا {finding}. تم تطبيق رصيد بقيمة {credit} على حسابك وسيظهر في فاتورتك القادمة. المرجع {ref}. ضو للاتصالات.',
  },
  CREDIT_REVERSED: {
    en: 'Dear {name}, after a further check of the partner records for invoice {invoice}, the two sessions on {date} were separate sessions and the credit of {credit} applied on {creditedOn} was not due. It has been reversed. We are sorry for the confusion; the evidence is available on request. Reference {ref}. Dhow Telecom.',
    ar: 'عزيزي {name}، بعد تدقيق إضافي لسجلات الشريك للفاتورة {invoice}، تبيّن أن الجلستين بتاريخ {date} كانتا منفصلتين وأن الرصيد البالغ {credit} المطبّق في {creditedOn} لم يكن مستحقاً، وقد تم عكسه. نعتذر عن الالتباس؛ الأدلة متاحة عند الطلب. المرجع {ref}. ضو للاتصالات.',
  },
  ROAMING_RESTRICTED: {
    en: 'Dear {name}, unusual roaming activity was confirmed on your line on {date} with {partner}. To protect you, roaming on this line is restricted. If this activity was yours, call 800-DHOW and the restriction is lifted the same day. Reference {ref}. Dhow Telecom.',
    ar: 'عزيزي {name}، تم تأكيد نشاط تجوال غير معتاد على خطك بتاريخ {date} مع {partner}. لحمايتك، تم تقييد التجوال على هذا الخط. إن كان هذا النشاط من جانبك، اتصل بـ 800-DHOW وسيُرفع التقييد في اليوم نفسه. المرجع {ref}. ضو للاتصالات.',
  },
  OFFER_PRESENTED: {
    en: 'Dear {name}, we have fixed {cause} and, as an apology, added {offer} to your line at no cost for {term}. Nothing else on your plan changes. Reply STOP to receive no further offers. Reference {ref}. Dhow Telecom.',
    ar: 'عزيزي {name}، أصلحنا {cause}، واعتذاراً منا أضفنا {offer} إلى خطك دون تكلفة لمدة {term}. لا يتغير أي شيء آخر في باقتك. أرسل STOP لعدم استلام عروض أخرى. المرجع {ref}. ضو للاتصالات.',
  },
  FIX_PRESENTED: {
    en: 'Dear {name}, the problem you reported, {cause}, has been fixed on {date}. Please tell us if it returns. Reference {ref}. Dhow Telecom.',
    ar: 'عزيزي {name}، تم إصلاح المشكلة التي أبلغت عنها، {cause}، بتاريخ {date}. أخبرنا إن عادت. المرجع {ref}. ضو للاتصالات.',
  },
  COMPLAINT_RESOLVED: {
    en: 'Dear {name}, about your complaint {complaint}: {finding}. {action} If this does not resolve it, reply to this message and a person will take it up with the full history. Reference {ref}. Dhow Telecom.',
    ar: 'عزيزي {name}، بخصوص شكواك {complaint}: {finding}. {action} إن لم يُحلّ الأمر، ردّ على هذه الرسالة وسيتابعها أحد موظفينا مع كامل السجل. المرجع {ref}. ضو للاتصالات.',
  },
  COMPLAINT_HANDED: {
    en: 'Dear {name}, your complaint {complaint} has been passed to {person}, who has the full history and will contact you by {due}. You will not need to repeat it. Reference {ref}. Dhow Telecom.',
    ar: 'عزيزي {name}، تمت إحالة شكواك {complaint} إلى {person}، ولديه السجل الكامل وسيتواصل معك قبل {due}. لن تحتاج إلى إعادة شرحها. المرجع {ref}. ضو للاتصالات.',
  },
  ORDER_ACTIVE: {
    en: 'Dear {name}, {service} for {sites} sites is active as of {date}, as quoted on {quoteDate}. Billing starts on {billingStart}. Your delivery reference is {ref}. Dhow Telecom Business.',
    ar: 'عزيزي {name}، خدمة {service} لـ {sites} مواقع أصبحت فعّالة اعتباراً من {date} وفق عرض السعر بتاريخ {quoteDate}. تبدأ الفوترة في {billingStart}. مرجع التسليم {ref}. ضو للاتصالات للأعمال.',
  },
};

export function fill(key: TemplateKey, lang: Lang, vars: Record<string, string | number>): { text: string; lang: 'en' | 'ar'; note: string | null } {
  const l: 'en' | 'ar' = lang === 'ar' ? 'ar' : 'en';
  const text = T[key][l].replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? `{${k}}`));
  return { text, lang: l, note: lang === 'tr' ? 'Turkish template not in this prototype; English sent.' : null };
}
export const TEMPLATE_KEYS = Object.keys(T) as TemplateKey[];
