import prisma from "../config/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { ILoan } from "../interfaces/ILoan";

class LoanRepository {
  /**
   * Retrieves a user's loan history, ordered by creation date in descending order.
   *
   * @param {string} userId - The ID of the user whose loan history is to be retrieved.
   * @returns {Promise<ILoan[]>} A list of loans associated with the user, ordered from most recent to oldest.
   *
   * - This function queries the database for loans linked to the specified user.
   * - Loans are returned in descending order based on `createdAt` (most recent first).
   */
  async getLoansByUserId(userId: string): Promise<ILoan[]> {
    return prisma.loan.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        payments: true // Include the associated payments
      }
    });
  }

  /**
   * Creates a new loan for a user.
   * 
   * @param {string} userId - The ID of the user taking the loan.
   * @param {number | Decimal} amount - The loan amount.
   * @returns {Promise<ILoan>} The created loan record.
   */
  async createLoan(userId: string, amount: number | Decimal): Promise<ILoan> {
    return prisma.loan.create({
      data: {
        userId,
        amount: typeof amount === 'number' ? new Decimal(amount) : amount,
        status: 'active',
        startDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  }

  /**
   * Updates the status of a loan.
   * 
   * @param {string} loanId - The ID of the loan to update.
   * @param {('active' | 'completed' | 'defaulted')} status - The new status.
   * @returns {Promise<ILoan>} The updated loan record.
   */
  async updateLoanStatus(loanId: string, status: 'active' | 'completed' | 'defaulted'): Promise<ILoan> {
    const data: any = {
      status,
      updatedAt: new Date()
    };
    
    // If the loan is being marked as completed or defaulted, set the end date
    if (status === 'completed' || status === 'defaulted') {
      data.endDate = new Date();
    }
    
    return prisma.loan.update({
      where: { id: loanId },
      data,
      include: {
        payments: true
      }
    });
  }

  /**
   * Retrieves a specific loan by its ID.
   * 
   * @param {string} loanId - The ID of the loan to retrieve.
   * @returns {Promise<ILoan | null>} The loan record or null if not found.
   */
  async getLoanById(loanId: string): Promise<ILoan | null> {
    return prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        payments: true
      }
    });
  }
}

export default new LoanRepository();