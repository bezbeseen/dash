export type QboEntityOperation = 'Create' | 'Update' | 'Delete' | string;

export type QboWebhookEntity = {
  name: string;
  id: string;
  operation: QboEntityOperation;
  lastUpdated?: string;
};

export type QboWebhookNotification = {
  realmId: string;
  dataChangeEvent?: {
    entities?: QboWebhookEntity[];
  };
};

export type QboWebhookPayload = {
  eventNotifications: QboWebhookNotification[];
};

export type EstimateSnapshot = {
  id: string;
  customerId?: string;
  customerName: string;
  projectName: string;
  totalAmtCents: number;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';
  txnDate?: string;
  acceptedAt?: string;
  /** MetaData.CreateTime from QBO (when the estimate was created in QuickBooks). */
  metaCreateTime?: string;
};

/** Bank account row from QBO Account query (widget + cash page). */
export type BankAccountBalance = {
  id: string;
  name: string;
  /** QBO AccountType, e.g. Bank */
  accountType?: string;
  /** QBO AccountSubType, e.g. Checking, Savings */
  accountSubType?: string;
  balanceCents: number;
};

export type InvoiceSnapshot = {
  id: string;
  linkedEstimateId?: string;
  customerId?: string;
  customerName: string;
  totalAmtCents: number;
  balanceCents: number;
  amountPaidCents: number;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID';
  /** From QBO when returned by GET Invoice / useful for PDF naming & ticket UI */
  docNumber?: string;
  txnDate?: string;
  dueDate?: string;
  /** Invoice “send to” email (customer-facing billing email on the invoice) */
  billEmail?: string;
  billEmailCc?: string;
  customerMemo?: string;
  privateNote?: string;
  /** MetaData.CreateTime from QBO (when the invoice was created in QuickBooks). */
  metaCreateTime?: string;
};
