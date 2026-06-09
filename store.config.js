const baseConfig = require("./store.config.json");

const reviewPhone = process.env.APP_REVIEW_PHONE;

if (!reviewPhone) {
  throw new Error(
    "Set APP_REVIEW_PHONE with the App Review contact phone number before running EAS metadata commands.",
  );
}

module.exports = {
  ...baseConfig,
  apple: {
    ...baseConfig.apple,
    review: {
      ...baseConfig.apple.review,
      phone: reviewPhone,
    },
  },
};
