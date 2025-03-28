import multer from "multer";

// multer storage
const storage = multer.diskStorage({
  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() + Math.round(Math.random() * 1000000) + "-" + file.fieldname
    );
  },
});

// multer for brand logo
// export const brandLogo = multer({ storage }).single("logo");
// export const catgoryPhoto = multer({ storage }).single("catPhoto");
// export const productPhoto = multer({ storage }).array("productPhoto");
export const userProfilePhoto = multer({ storage }).single("profile-photo");
export const chatUserPhoto = multer({ storage }).single("chat-image");
