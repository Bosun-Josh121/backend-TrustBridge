// PaymentRepository.ts
import prisma from "../config/prisma";
import { IPayment } from "../interfaces/IPayment";

class PaymentRepository {
  /**
   * Retrieves a user's payment history, ordered by payment date in descending order.
   *
   * @param {string} userId - The ID of the user whose payment history is to be retrieved.
   * @returns {Promise<IPayment[]>} A list of payments associated with the user, ordered from most recent to oldest.
   *
   * - This function queries the database for payments linked to the specified user.
   * - Payments are returned in descending order based on `paymentDate` (most recent first).
   */
  async getPaymentsByUserId(userId: string): Promise<IPayment[]> {
    return prisma.payment.findMany({
      where: {
        loan: {
          userId: userId
        }
      },
      orderBy: { paymentDate: "desc" },
    });
  }
}

export default new PaymentRepository();