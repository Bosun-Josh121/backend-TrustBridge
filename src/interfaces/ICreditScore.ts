export interface ICreditScore {
    id: string;
    userId: string;
    score: number;
    category: 'Poor' | 'Fair' | 'Good' | 'Very Good' | 'Excellent';
    createdAt: Date;
    updatedAt: Date;
  }