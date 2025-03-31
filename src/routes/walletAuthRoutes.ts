import express, { Router } from 'express';
import { initiateWallet2FA, verifyWalletOTP } from '../controllers/walletAuthController';
import { validateWalletInit, validateWalletVerify, checkValidationResult } from '../middleware/validation';

const router: Router = express.Router();

router.post("/init",
    validateWalletInit,
    checkValidationResult,
    initiateWallet2FA 
);

// Route to verify the OTP and get JWTs
router.post("/verify",
    validateWalletVerify,
    checkValidationResult,
    verifyWalletOTP
);

export default router;