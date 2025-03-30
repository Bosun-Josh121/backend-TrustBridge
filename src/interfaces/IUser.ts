import { Decimal } from "@prisma/client/runtime/library";
import { ILoan } from "./ILoan";
import { ICreditScore } from "./ICreditScore";

export interface IUser {
  id: string;
  name: string;
  email: string;
  walletAddress?: string;
  nonce?: string;
  monthlyIncome?: Decimal | null;
  isEmailVerified: boolean;
  lastLogin?: Date;
  loans?: ILoan[];
  creditScore?: ICreditScore;
  reputation?: {
    reputationScore: number;
  };
  createdAt: Date;
  updatedAt: Date;
}