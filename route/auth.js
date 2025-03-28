import express from "express";
import {
  login,
  logout,
  register,
  loggedInUser,
  makeHashPass,
  accountActivateByOtp,
  accountActivateByLink,
  resendAccountActivation,
  resetPassword,
  resetPasswordAction,
  uploadProfilePhoto,
} from "../controllers/authController.js";
import tokenVerify from "../middlewares/verifyToken.js";
import { userProfilePhoto } from "../utils/multer.js";

const router = express.Router();

// create route
router.route("/login").post(login);
router.route("/logout").post(logout);
router.route("/hash").post(makeHashPass);
router.route("/register").post(register);
router.route("/activation-by-otp/:token").post(accountActivateByOtp);
router.route("/activation-by-link/:token").post(accountActivateByLink);
router.route("/resend-activation/:auth").get(resendAccountActivation);
router.route("/reset-password").post(resetPassword);
router.route("/reset-password-action/:token").post(resetPasswordAction);
router.route("/photo-edit/:id").post(userProfilePhoto, uploadProfilePhoto);

router.get("/me", tokenVerify, loggedInUser);

// export default router
export default router;
