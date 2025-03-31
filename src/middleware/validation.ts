import { Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';

// Validation for the register route
const validateRegister = [
  body('walletAddress')
    .isString()
    .withMessage('Wallet address is required')
    .isLength({ min: 1 })
    .withMessage('Wallet address cannot be empty'),
  // Add any other validations as necessary
];

// Validation for the verify email route
const validateVerifyEmail = [
  body('token')
    .isString()
    .withMessage('Token is required')
    .isLength({ min: 1 })
    .withMessage('Token cannot be empty'),
  // Add any other validations as necessary
];

// Middleware to check for validation errors
const checkValidationResult = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  next();
};

// Validates the body of POST /auth/wallet/init
const validateWalletInit = [
  body('wallet_address')
    .isString().withMessage('Wallet address must be a string')
    .notEmpty().withMessage('Wallet address is required'),
  body('signed_message')
    .isString().withMessage('Signed message must be a string')
    .notEmpty().withMessage('Signed message is required'),
];

// Validates the body of POST /auth/wallet/verify
const validateWalletVerify = [
  body('wallet_address')
    .isString().withMessage('Wallet address must be a string')
    .notEmpty().withMessage('Wallet address is required'),
  //Validate OTP code format (e.g., 6 digits)
  body('otp_code')
    .isString().withMessage('OTP code must be a string')
    .isLength({ min: 6, max: 6 }).withMessage('OTP code must be 6 digits')
    .isNumeric().withMessage('OTP code must contain only numbers'),
];

export { validateRegister, validateVerifyEmail, checkValidationResult, validateWalletInit, validateWalletVerify};