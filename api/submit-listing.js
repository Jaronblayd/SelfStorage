
// api/submit-listing.js
// Receives listing form submissions and emails them to the owner

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    name, email, phone, facilityName, city, state,
    price, units, occupancy, noi, capRate,
    climate, driveUp, boat, description, source
  } = req.body ?? {};

  if (!name || !email || !facilityName || !city || !state || !price) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: "RESEND_API_KEY not configured" });

  const emailBody = `
New Self Storage Listing Submission — StorageInvestors.io

CONTACT INFO
Name: ${name}
Email: ${email}
Phone: ${phone || "Not provided"}

PROPERTY DETAILS
Facility Name: ${facilityName}
Location: ${city}, ${state}
Asking Price: $${parseInt(price).toLocaleString()}
Number of Units: ${units || "Not provided"}
Occupancy Rate: ${occupancy || "Not provided"}%
Annual NOI: ${noi ? "$" + parseInt(noi).toLocaleString() : "Not provided"}
Cap Rate: ${capRate || "Not provided"}%

AMENITIES
Climate Controlled: ${climate ? "Yes" : "No"}
Drive-Up Access: ${driveUp ? "Yes" : "No"}
Boat & RV Storage: ${boat ? "Yes" : "No"}

DESCRIPTION
${description || "No description provided"}

SOURCE
How they found us: ${source || "Not provided"}

---
Submitted via StorageInvestors.io
  `.trim();

  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "StorageInvestors <listings@storageinvestors.io>",
        to: ["jaronhodges26@gmail.com"],
        subject: `New Listing: ${facilityName} — ${city}, ${state} — $${parseInt(price).toLocaleString()}`,
        text: emailBody,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.json();
      console.error("Resend error:", err);
      return res.status(502).json({ error: "Failed to send email" });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Submit error:", err);
    return res.status(500).json({ error: err.message ?? "Unexpected error" });
  }
}
