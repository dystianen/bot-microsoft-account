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
    port: process.env.PROXY_PORT || "1050",
    username: process.env.PROXY_USERNAME || "268df409e8182d6a0ef5__cr.fi__rotate",
    password: process.env.PROXY_PASSWORD || "c8e20650556608e3",
    type: "socks5",
  },

  microsoftAccount: {
    email: "uriah.blackwood@duluthminnesota.us",
    firstName: "Uriah",
    lastName: "Blackwood",
    companyName: "Duluth Port & Logistics Authority",
    companySize: "1 person",
    phone: "+12185551234",
    jobTitle: "Great Lakes Shipping Coordinator",
    address: "500 W Superior Street",
    city: "Duluth",
    state: "Minnesota",
    postalCode: "55802",
    country: "United States",
    password: "PortUriah1234@Duluth",
  },
  payment: {
    cardNumber: "",
    cvv: "",
    expMonth: "",
    expYear: "",
    nameOnCard: "Uriah Blackwood",
  },
};
