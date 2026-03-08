const dotenv = require("dotenv");
dotenv.config();

module.exports = {
  microsoftUrl:
    "https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-business-basic",
  adsPower: {
    baseUrl: process.env.ADSPOWER_BASE_URL || "http://local.adspower.net:50325",
    apiKey:
      process.env.ADSPOWER_API_KEY ||
      "a74c1696169a859321288618723ac1340051adfbdc2511a1",
    groupId: process.env.ADSPOWER_GROUP_ID || "0",
  },
  proxy: {
    host: process.env.PROXY_HOST || "gw.dataimpulse.com",
    port: process.env.PROXY_PORT || "824",
    username:
      process.env.PROXY_USERNAME || "2028ce76fd49cc77d009__cr.fi_rotate",
    password: process.env.PROXY_PASSWORD || "2daec922ca463aaa",
    type: "socks5",
  },
  microsoftAccount: {
    email: "nova.starling@hamptonva.us",
    firstName: "Nova",
    lastName: "Starling",
    companyName: "Hampton NASA Research Center",
    companySize: "1 person",
    phone: "+17575552345",
    jobTitle: "Aerospace Materials Engineer",
    address: "Franklin Street",
    city: "Hampton",
    state: "Virginia",
    postalCode: "23669",
    country: "United States",
    password: "SpaceNova2345@Hampton",
  },
  payment: {
    cardNumber: "4889506063045078",
    cvv: "674",
    expMonth: "12",
    expYear: "30",
  },
};
