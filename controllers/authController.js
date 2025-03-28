import asyncHandler from "express-async-handler";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import {
  createOTP,
  dotsToHyphens,
  hyphensToDots,
  isEmail,
  isPhone,
} from "../helpers/helpers.js";

import { sendSMS } from "../messenger/src/utils/sendSMS.js";
import { AccountActivate } from "../mails/AccountActivate.js";
import { cloudUpload } from "../utils/cloudinary.js";

/**
 * @DESC User Login
 * @ROUTE /api/v1/auth/login
 * @method POST
 * @access public
 */
export const login = asyncHandler(async (req, res) => {
  const { auth, password } = req.body;

  // validation
  if (!auth || !password)
    return res.status(404).json({ message: "All fields are required" });

  //find login user
  let loginUserData = null;

  if (isPhone(auth)) {
    loginUserData = await User.findOne({ phone: auth });

    if (!loginUserData)
      return res.status(404).json({ message: "User not found" });
  } else if (isEmail(auth)) {
    loginUserData = await User.findOne({ email: auth });

    if (!loginUserData)
      return res.status(404).json({ message: "User not found" });
  } else {
    return res
      .status(404)
      .json({ message: "User must have a valid Email or Phone number" });
  }

  // password check
  const passwordCheck = await bcrypt.compare(password, loginUserData.password);

  // password check
  if (!passwordCheck)
    return res.status(404).json({ message: "Wrong password" });

  // create access token
  const token = jwt.sign({ auth: auth }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRE_IN,
  });

  res.cookie("accessToken", token, {
    httpOnly: true,
    secure: process.env.APP_ENV == "Development" ? false : true,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({
    token,
    user: loginUserData,
    message: "User Login Successful",
  });
});

/**
 * @DESC User Login
 * @ROUTE /api/v1/auth/login
 * @method POST
 * @access public
 */
export const logout = asyncHandler(async (req, res) => {
  res.clearCookie("accessToken");
  res.status(200).json({ message: "Logout successful" });
});

/**
 * @DESC Create new User
 * @ROUTE /api/v1/user
 * @method POST
 * @access public
 */
export const register = asyncHandler(async (req, res) => {
  const { name, auth, password } = req.body;

  if (!name || !auth || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  //auth validation
  let authEmail = null;
  let authPhone = null;

  //create access token
  const activationToken = createOTP();

  if (isPhone(auth)) {
    authPhone = auth;

    // check user phone
    const isPhoneExist = await User.findOne({ phone: auth });
    if (isPhoneExist) {
      return res.status(400).json({ message: "Phone number already exists" });
    }

    //create verification token
    const verifyToken = jwt.sign(
      { auth: auth, otp: activationToken },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "10m",
      }
    );

    res.cookie("verifyToken", verifyToken);

    //send OTP
    await sendSMS(
      auth,
      `Hello ${name}, Your account activation code is ${activationToken}`
    );
  } else if (isEmail(auth)) {
    authEmail = auth;

    // check user email
    const userEmailCheck = await User.findOne({ email: auth });

    if (userEmailCheck) {
      return res.status(400).json({ message: "Email already exists" });
    }

    //create verification token
    const verifyToken = jwt.sign(
      { auth: auth, otp: activationToken },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "10m",
      }
    );

    res.cookie("verifyToken", verifyToken);

    //activation link
    // const activationLink = `http://localhost:3000/activation/${dotsToHyphens(
    //   verifyToken
    // )}`;

    const tokenOnly = dotsToHyphens(verifyToken);

    //send activation link to email
    await AccountActivate(auth, {
      name,
      code: activationToken,
      token: tokenOnly,
    });
  } else {
    return res.status(400).json({ message: "Invalid email or phone number" });
  }

  // password hash
  const hashPass = await bcrypt.hash(password, 10);

  // create new user
  const user = await User.create({
    name,
    email: authEmail,
    phone: authPhone,
    password: hashPass,
    accessToken: activationToken,
  });

  res.status(200).json({
    user,
    message: "User Created successful",
  });
});

/**
 * @DESC Create new User
 * @ROUTE /api/v1/user
 * @method POST
 * @access public
 */
export const loggedInUser = asyncHandler(async (req, res) => {
  res.status(200).json(req.me);
});

/**
 * @DESC Create new User
 * @ROUTE /api/v1/user
 * @method POST
 * @access public
 */
export const makeHashPass = asyncHandler(async (req, res) => {
  const { password } = req.body;
  // password hash
  const hashPass = await bcrypt.hash(password, 10);
  res.status(200).json({ hashPass });
});

/**
 *
 *  Account activate by OTP
 *
 */
export const accountActivateByOtp = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { otp } = req.body;

  if (!token)
    return res.status(400).json({ message: "Invalid token || Not found" });

  if (!otp) return res.status(400).json({ message: "OTP is required" });

  const verifyToken = hyphensToDots(token);

  const tokenCheck = jwt.verify(verifyToken, process.env.ACCESS_TOKEN_SECRET);

  if (tokenCheck.otp !== otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }
  console.log(tokenCheck);

  res.status(200).json({ message: "Account activated" });

  if (!tokenCheck) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  //activate account now
  let activateUser = null;

  if (isPhone(tokenCheck.auth)) {
    activateUser = await User.findOne({ phone: tokenCheck.auth });

    if (!activateUser) {
      return res.status(400).json({ message: "User not found" });
    }
  } else if (isEmail(tokenCheck.auth)) {
    activateUser = await User.findOne({ email: tokenCheck.auth });

    if (!activateUser) {
      return res.status(400).json({ message: "User not found" });
    }
  } else {
    return res.status(400).json({ message: "Invalid email or phone number" });
  }

  if (otp !== activateUser.accessToken) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  activateUser.accessToken = null;
  activateUser.save();

  res.clearCookie("verifyToken");

  return res.status(200).json({ message: "Account activated" });
});

/**
 *
 *  Account activate by Link
 *
 */
export const accountActivateByLink = asyncHandler(async (req, res) => {
  const { token } = req.params;

  if (!token)
    return res.status(400).json({ message: "Invalid token || Not found" });

  const verifyToken = hyphensToDots(token);

  let tokenCheck;
  try {
    tokenCheck = jwt.verify(verifyToken, process.env.ACCESS_TOKEN_SECRET);
  } catch (error) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  console.log("Decoded token:", tokenCheck);

  if (!tokenCheck) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  //activate account now
  let activateUser = null;

  if (isEmail(tokenCheck.auth)) {
    activateUser = await User.findOne({ email: tokenCheck.auth });

    if (!activateUser) {
      return res.status(400).json({ message: "User not found" });
    }
  } else {
    return res.status(400).json({ message: "Invalid email!" });
  }

  if (otp !== activateUser.accessToken) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  activateUser.accessToken = null;
  activateUser.save();

  res.clearCookie("verifyToken");

  return res.status(200).json({ message: "Account activated" });
});

export const resendAccountActivation = asyncHandler(async (req, res) => {
  const { auth } = req.params;

  let authEmail = null;
  let authPhone = null;
  let authUser = null;

  //create access token
  const activationToken = createOTP();

  if (isPhone(auth)) {
    authPhone = auth;

    // check user phone
    authUser = await User.findOne({ phone: auth });

    //create verification token
    const verifyToken = jwt.sign(
      { auth: auth, otp: activationToken },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "10m",
      }
    );

    res.cookie("verifyToken", verifyToken);

    //send OTP
    await sendSMS(
      auth,
      `Hello ${authUser.name}, Your account activation code is ${activationToken}`
    );
  } else if (isEmail(auth)) {
    authEmail = auth;

    // check user email
    authUser = await User.findOne({ email: auth });

    //create verification token
    const verifyToken = jwt.sign(
      { auth: auth, otp: activationToken },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "10m",
      }
    );

    res.cookie("verifyToken", verifyToken);

    //activation link
    // const activationLink = `http://localhost:3000/activation/${dotsToHyphens(
    //   verifyToken
    // )}`;

    const tokenOnly = dotsToHyphens(verifyToken);

    //send activation link to email
    await AccountActivate(auth, {
      name: authUser.name,
      code: activationToken,
      token: tokenOnly,
    });
  }

  authUser.accessToken = activationToken;
  activationToken.save();

  res.status(200).json({
    message: "Activation code send successfully.",
  });
});

/**
 * Password Reset
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { auth } = req.body;

  //reset User data
  let resetUser = null;

  //create access token
  const activationToken = createOTP();

  if (isPhone(auth)) {
    authPhone = auth;

    // check user phone
    resetUser = await User.findOne({ phone: auth });
    if (!resetUser) {
      return res.status(400).json({ message: "Phone number does not exist." });
    }

    //create verification token
    const verifyToken = jwt.sign(
      { auth: auth, otp: activationToken },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "10m",
      }
    );

    res.cookie("verifyToken", verifyToken);

    //send OTP
    await sendSMS(
      auth,
      `Hello ${resetUser.name}, Your account activation code is ${activationToken}`
    );
  } else if (isEmail(auth)) {
    // check user email
    resetUser = await User.findOne({ email: auth });

    if (!resetUser) {
      return res.status(400).json({ message: "Email does not exist." });
    }

    //create verification token
    const verifyToken = jwt.sign(
      { auth: auth, otp: activationToken },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "10m",
      }
    );

    res.cookie("verifyToken", verifyToken);

    const tokenOnly = dotsToHyphens(verifyToken);

    //send activation link to email
    await AccountActivate(auth, {
      name: resetUser.name,
      code: activationToken,
      token: tokenOnly,
    });
  } else {
    return res.status(400).json({ message: "Invalid email or phone number" });
  }

  resetUser.accessToken = activationToken;
  resetUser.save();

  res.status(200).json({
    message: "Now reset your Password.",
  });
});

/**
 * Reset Password Action
 */

export const resetPasswordAction = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { newPassword, confPassword, otp } = req.body;

  if (!newPassword) {
    return res.status(400).json({ message: "New Password required" });
  }
  if (!confPassword) {
    return res.status(400).json({ message: "Confirm Password required" });
  }
  if (!token) {
    return res.status(400).json({ message: "Invalid token || Not found" });
  }
  if (!otp) {
    return res.status(400).json({ message: "OTP is required" });
  }
  if (confPassword !== newPassword) {
    return res
      .status(400)
      .json({ message: "Password does not match the new password" });
  }

  const verifyToken = hyphensToDots(token);

  const tokenCheck = jwt.verify(verifyToken, process.env.ACCESS_TOKEN_SECRET);

  if (tokenCheck.otp !== otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  if (!tokenCheck) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  //activate account now
  let resetUser = null;

  if (isPhone(tokenCheck.auth)) {
    resetUser = await User.findOne({ phone: tokenCheck.auth });

    if (!resetUser) {
      return res.status(400).json({ message: "User not found" });
    }
  } else if (isEmail(tokenCheck.auth)) {
    resetUser = await User.findOne({ email: tokenCheck.auth });

    if (!resetUser) {
      return res.status(400).json({ message: "User not found" });
    }
  } else {
    return res.status(400).json({ message: "Invalid email or phone number" });
  }

  if (otp !== resetUser.accessToken) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  // password hash
  const hashPass = await bcrypt.hash(newPassword, 10);

  resetUser.password = hashPass;
  resetUser.accessToken = null;
  resetUser.save();

  return res.status(200).json({ message: "Password reset done" });
});

export const uploadProfilePhoto = asyncHandler(async (req, res) => {
  const { id } = req.params;

  //upload file
  const file = await cloudUpload(req);

  //find user
  const user = await User.findByIdAndUpdate(
    id,
    {
      photo: file.secure_url,
    },
    { new: true }
  );

  res.status(200).json({ message: "Profile photo updated.", user });
});
