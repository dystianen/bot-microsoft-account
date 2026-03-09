const XLSX = require("xlsx");

const EXCEL_FILE = "./accounts.xlsx";

const headers = [
  "Email",
  "Password",
  "First Name",
  "Last Name",
  "Company Name",
  "Company Size",
  "Phone",
  "Job Title",
  "Address",
  "City",
  "State",
  "Postal Code",
  "Country",
  "Card Number",
  "CVV",
  "Exp Month",
  "Exp Year",
  "Status",
  "Domain Email",
  "Log",
];

const data = [
  [
    "ursula.vance@neworleansresearch.us",
    "ResearchUrsula6789@NewOrleans",
    "Ursula",
    "Vance",
    "New Orleans Research Center",
    "1 person",
    "+15045556789",
    "Clinical Researcher",
    "1440 Canal Street",
    "New Orleans",
    "Louisiana",
    "70112",
    "United States",
    "5198939816602718",
    "213",
    "03",
    "30",
    "",
    "",
  ],
  [
    "vesper.grey@tampaport.us",
    "PortVesper1234@Tampa",
    "Vesper",
    "Grey",
    "Tampa Port Authority",
    "1 person",
    "+18135551234",
    "Port Operations Manager",
    "1101 Channelside Drive",
    "Tampa",
    "Florida",
    "33602",
    "United States",
    "5198939816602718",
    "213",
    "03",
    "30",
    "",
    "",
  ],
  [
    "wilder.ash@pittsburghrobotics.us",
    "RoboticsWilder8901@Pittsburgh",
    "Wilder",
    "Ash",
    "Pittsburgh Robotics Lab",
    "1 person",
    "+14125558901",
    "Robotics Engineer",
    "4516 Henry Street",
    "Pittsburgh",
    "Pennsylvania",
    "15213",
    "United States",
    "5198939816602718",
    "213",
    "03",
    "30",
    "",
    "",
  ],
  [
    "xanthe.cross@clevelandclinic.us",
    "MedicalXanthe6789@Cleveland",
    "Xanthe",
    "Cross",
    "Cleveland Clinic",
    "1 person",
    "+12165556789",
    "Medical Researcher",
    "9500 Euclid Avenue",
    "Cleveland",
    "Ohio",
    "44195",
    "United States",
    "5198939816602718",
    "213",
    "03",
    "30",
    "",
    "",
  ],
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

// SET LEBAR KOLOM (WCH = Width Character)
// Ini yang bikin file kelihatan "Rapi" karena kolomnya pas dengan isi
ws["!cols"] = [
  { wch: 35 }, // Email
  { wch: 35 }, // Password
  { wch: 15 }, // First Name
  { wch: 15 }, // Last Name
  { wch: 30 }, // Company Name
  { wch: 15 }, // Company Size
  { wch: 15 }, // Phone
  { wch: 25 }, // Job Title
  { wch: 30 }, // Address
  { wch: 15 }, // City
  { wch: 15 }, // State
  { wch: 12 }, // Postal Code
  { wch: 15 }, // Country
  { wch: 20 }, // Card Number
  { wch: 8 }, // CVV
  { wch: 10 }, // Exp Month
  { wch: 10 }, // Exp Year
  { wch: 12 }, // Status
  { wch: 40 }, // Domain Email
  { wch: 50 }, // Log
];

XLSX.utils.book_append_sheet(wb, ws, "Accounts");
XLSX.writeFile(wb, EXCEL_FILE);

console.log(
  "✅ accounts.xlsx has been recreated and it is now neat (with proper column widths)!",
);
