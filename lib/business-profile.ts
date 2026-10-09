export const businessProfile={
 name:'Home Retreat Direct',domain:'homeretreatdirect.com',origin:'https://homeretreatdirect.com',
 emails:{info:'info@homeretreatdirect.com',orders:'orders@homeretreatdirect.com',support:'support@homeretreatdirect.com'},
} as const;

/** Public contact addresses supplied by the store owner, with later owner overrides. */
export function businessEmails(values:Record<string,string>={}){
 return {
  generalEmail:values.generalEmail||process.env.INFO_EMAIL||businessProfile.emails.info,
  ordersEmail:values.ordersEmail||process.env.ORDERS_EMAIL||businessProfile.emails.orders,
  supportEmail:values.supportEmail||process.env.SUPPORT_EMAIL||businessProfile.emails.support,
 };
}
