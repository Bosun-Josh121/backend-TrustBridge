
import { Decimal } from "@prisma/client/runtime/library";

export interface IPayment {
  id: string;
  loanId: string;
  amount: Decimal;
  status: 'on_time' | 'late' | 'pending';
  dueDate: Date;
  paymentDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}