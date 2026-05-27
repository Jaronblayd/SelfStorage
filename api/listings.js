
// api/listings.js
// Scrapes real self storage listings from Crexi via Apify
// Runs on demand and returns live listings

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) return res.status(500).json({ error: "APIFY_TOKEN not configured" });

  // Build Crexi search URL — self storage for sale nationwide
  const crexiUrl = "https://www.crexi.com/properties?types=SelfStorage&statuses=ForSale&sortOrder=NewestFirst";

  try {
    // 1. Start the Apify actor run
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/delectable_incubator~crexi-scraper-low-cost/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [{ url: crexiUrl }],
          maxResults: 20,
        }),
      }
    );

    if (!runRes.ok) {
      const text = await runRes.text();
      return res.status(502).json({ error: `Apify start failed: ${runRes.status}`, detail: text });
    }

    const runData = await runRes.json();
    const runId = runData.data?.id;
    const datasetId = runData.data?.defaultDatasetId;
    if (!runId) return res.status(502).json({ error: "No run ID from Apify" });

    // 2. Poll until finished (max ~55s)
    let status = "RUNNING";
    let attempts = 0;
    while (["RUNNING", "READY", "STARTED"].includes(status) && attempts < 17) {
      await sleep(3000);
      attempts++;
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
      );
      const statusData = await statusRes.json();
      status = statusData.data?.status ?? "FAILED";
    }

    if (status !== "SUCCEEDED") {
      return res.status(502).json({ error: `Actor ended with status: ${status}` });
    }

    // 3. Fetch results
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=20`
    );
    if (!itemsRes.ok) return res.status(502).json({ error: "Failed to fetch dataset" });

    const items = await itemsRes.json();

    // 4. Normalize to our schema
    const listings = items
      .filter(p => p.name && p.types?.includes("Self Storage"))
      .map(p => ({
        id: p.id,
        name: p.name,
        description: p.description ?? "",
        city: extractCity(p.description, p.name),
        state: extractState(p.urlSlug),
        price: p.askingPrice !== "N/A" ? p.askingPrice : null,
        priceStr: p.askingPrice !== "N/A" ? formatPrice(p.askingPrice) : "Price Upon Request",
        sqft: p.squareFootage !== "N/A" ? p.squareFootage : null,
        investmentType: p.investmentType !== "N/A" ? p.investmentType : null,
        status: p.status,
        thumbnailUrl: p.thumbnailUrl ?? null,
        brokerageName: p.brokerageName !== "N/A" ? p.brokerageName : null,
        crexiUrl: `https://www.crexi.com/properties/${p.urlSlug}`,
        isNew: p.isNew,
        hasOM: p.hasOM,
        opportunityZone: p.isInOpportunityZone,
        types: p.types,
        // Parse cap rate from description if mentioned
        capRate: parseCapRate(p.description),
      }));

    return res.status(200).json({ listings, count: listings.length });

  } catch (err) {
    console.error("Listings error:", err);
    return res.status(500).json({ error: err.message ?? "Unexpected error" });
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatPrice(p) {
  if (!p || p === "N/A") return "Price Upon Request";
  if (p >= 1000000) return `$${(p / 1000000).toFixed(1)}M`;
  if (p >= 1000) return `$${(p / 1000).toFixed(0)}K`;
  return `$${p.toLocaleString()}`;
}

function parseCapRate(desc) {
  if (!desc) return null;
  const match = desc.match(/(\d+\.?\d*)\s*%\s*CAP/i);
  return match ? parseFloat(match[1]) : null;
}

function extractState(urlSlug) {
  if (!urlSlug) return "US";
  const parts = urlSlug.split("-");
  const stateMap = {
    "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA",
    "colorado":"CO","connecticut":"CT","delaware":"DE","florida":"FL","georgia":"GA",
    "hawaii":"HI","idaho":"ID","illinois":"IL","indiana":"IN","iowa":"IA",
    "kansas":"KS","kentucky":"KY","louisiana":"LA","maine":"ME","maryland":"MD",
    "massachusetts":"MA","michigan":"MI","minnesota":"MN","mississippi":"MS",
    "missouri":"MO","montana":"MT","nebraska":"NE","nevada":"NV","new-hampshire":"NH",
    "new-jersey":"NJ","new-mexico":"NM","new-york":"NY","north-carolina":"NC",
    "north-dakota":"ND","ohio":"OH","oklahoma":"OK","oregon":"OR","pennsylvania":"PA",
    "rhode-island":"RI","south-carolina":"SC","south-dakota":"SD","tennessee":"TN",
    "texas":"TX","utah":"UT","vermont":"VT","virginia":"VA","washington":"WA",
    "west-virginia":"WV","wisconsin":"WI","wyoming":"WY"
  };
  return stateMap[parts[0]] ?? parts[0].toUpperCase().slice(0,2);
}

function extractCity(desc, name) {
  if (!desc && !name) return "";
  // Try to find city from description patterns like "Houston, TX" or "Boise, ID"
  const match = (desc + " " + name).match(/([A-Z][a-zA-Z\s]+),\s*[A-Z]{2}/);
  return match ? match[1].trim() : "";
}
