// ILoan.ts
import { Decimal } from "@prisma/client/runtime/library";
import { IPayment } from "./IPayment";

export interface ILoan {
  id: string;
  userId: string;
  amount: Decimal;
  status: 'active' | 'completed' | 'defaulted';
  startDate: Date;
  endDate?: Date;
  payments?: IPayment[];
  createdAt: Date;
  updatedAt: Date;
}