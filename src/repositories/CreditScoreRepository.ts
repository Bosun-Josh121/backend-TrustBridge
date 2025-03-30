// repository.ts
import prisma from "../config/prisma";
import { ICreditScore } from "../interfaces/ICreditScore"; // Import the interface

class CreditScoreRepository {
  async upsertCreditScore(userId: string, score: number): Promise<ICreditScore> {
    // Determine the category based on score
    const category = this.determineCategory(score);
    
    return await prisma.creditScore.upsert({
      where: { userId },
      update: { 
        score, 
        category,
        updatedAt: new Date() 
      },
      create: { 
        userId, 
        score, 
        category,
        createdAt: new Date(),
        updatedAt: new Date() 
      },
    });
  }
  
  async getUserCreditScore(userId: string): Promise<ICreditScore | null> {
    return await prisma.creditScore.findUnique({ where: { userId } });
  }
  
  private determineCategory(score: number): 'Poor' | 'Fair' | 'Good' | 'Very Good' | 'Excellent' {
    if (score < 580) return 'Poor';
    if (score < 670) return 'Fair';
    if (score < 740) return 'Good';
    if (score < 800) return 'Very Good';
    return 'Excellent';
  }
}

export default new CreditScoreRepository();