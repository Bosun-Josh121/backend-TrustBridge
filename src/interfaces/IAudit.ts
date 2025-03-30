import { Decimal } from "@prisma/client/runtime/library";

export interface IAudit {
  id: string;
  userId: string | null;
  action: string;
  details?: string;
  createdAt: Date;
  updatedAt: Date;
}