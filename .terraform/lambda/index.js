// Lambda handler for the family-doctor booking API.
// Routes two endpoints through API Gateway:
//   GET  /slots     (public)          -> list available appointment slots
//   POST /bookings  (requires token)  -> reserve a slot
//
// Runtime: nodejs24.x (AWS SDK v3 is bundled — no node_modules needed).
// Written as CommonJS so it runs from a single-file zip (no package.json).

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SLOTS_TABLE = process.env.SLOTS_TABLE || "Slots";
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || "Bookings";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Small helpers -------------------------------------------------

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // CORS: allow the CloudFront-hosted page to call the API.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

// Works with both API Gateway HTTP API (v2) and REST API (v1) events.
function getMethod(event) {
  return event.requestContext?.http?.method || event.httpMethod || "";
}

function getPath(event) {
  return event.rawPath || event.path || "";
}

function getHeader(event, name) {
  const headers = event.headers || {};
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return headers[key];
  }
  return undefined;
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return null; // signals malformed JSON
  }
}

function isAuthorized(event) {
  // POST /bookings is protected by an API Gateway Cognito JWT authorizer, so a
  // request only reaches this Lambda when a valid ID token was supplied. As a
  // defence-in-depth check we confirm the authorizer added user claims.
  return Boolean(getUserClaims(event));
}

// Cognito claims injected by the API Gateway JWT authorizer.
function getUserClaims(event) {
  return event.requestContext?.authorizer?.jwt?.claims || null;
}

// --- Route handlers ------------------------------------------------

// Seed 8 slots each day for the upcoming working week (Mon-Fri, 8 per day)
async function seedDefaultSlots() {
  const slotsToCreate = [];
  const today = new Date();
  
  // Find the date of the next Monday
  const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);

  const times = [
    "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
    "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM"
  ];
  for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
    const slotDate = new Date(nextMonday);
    slotDate.setDate(nextMonday.getDate() + dayOffset);
    const dateString = slotDate.toISOString().split("T")[0];

    for (const time of times) {
      slotsToCreate.push({
        id: `slot-${dateString}-${time.replace(/[:\s]/g, "-").toLowerCase()}`,
        date: dateString,
        time: time,
        available: true
      });
    }
  }

  for (const slot of slotsToCreate) {
    await ddb.send(
      new PutCommand({
        TableName: SLOTS_TABLE,
        Item: slot
      })
    );
  }
  return slotsToCreate;
}

// GET /slots (public)
async function getSlots() {
  const result = await ddb.send(
    new ScanCommand({
      TableName: SLOTS_TABLE,
      FilterExpression: "available = :true",
      ExpressionAttributeValues: { ":true": true },
    })
  );

  let items = result.Items || [];

  // If no slots exist in the database, seed 8 default ones
  if (items.length === 0) {
    items = await seedDefaultSlots();
  }

  const slots = items.sort((a, b) => {
    if (a.date === b.date) return a.time.localeCompare(b.time);
    return a.date.localeCompare(b.date);
  });

  return response(200, { slots });
}

// POST /bookings (public — anyone can reserve a slot)
async function createBooking(event) {
  const body = parseBody(event);
  if (body === null) {
    return response(400, { error: "Request body must be valid JSON." });
  }

  const { slotId, name, email, reason } = body;

  if (!slotId || !name || !email) {
    return response(400, {
      error: "Fields 'slotId', 'name' and 'email' are required.",
    });
  }
  if (!EMAIL_PATTERN.test(String(email))) {
    return response(400, { error: "A valid email address is required." });
  }

  // Atomically claim the slot: only succeeds if it currently exists and is
  // available. This prevents two people from booking the same slot.
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: SLOTS_TABLE,
        Key: { id: String(slotId) },
        UpdateExpression: "SET available = :false",
        ConditionExpression: "attribute_exists(id) AND available = :true",
        ExpressionAttributeValues: { ":false": false, ":true": true },
        ReturnValues: "ALL_NEW",
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return response(409, {
        error: "That slot is not available (already booked or does not exist).",
      });
    }
    throw err;
  }

  const booking = {
    BookingId: randomUUID(),
    slotId: String(slotId),
    name: String(name),
    email: String(email),
    reason: reason ? String(reason) : "",
    createdAt: new Date().toISOString(),
  };

  await ddb.send(
    new PutCommand({ TableName: BOOKINGS_TABLE, Item: booking })
  );

  return response(201, { message: "Appointment booked.", booking });
}

// GET /bookings (requires a signed-in Cognito user)
async function getBookings(event) {
  if (!isAuthorized(event)) {
    return response(401, {
      error: "Unauthorized. Please sign in to view bookings.",
    });
  }

  const result = await ddb.send(
    new ScanCommand({ TableName: BOOKINGS_TABLE })
  );

  const bookings = (result.Items || []).sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );

  return response(200, { bookings });
}

// --- Entry point ---------------------------------------------------

exports.handler = async (event) => {
  const method = getMethod(event).toUpperCase();
  const path = getPath(event);

  // CORS preflight
  if (method === "OPTIONS") {
    return response(204, {});
  }

  try {
    if (method === "GET" && path.endsWith("/slots")) {
      return await getSlots();
    }
    if (method === "GET" && path.endsWith("/bookings")) {
      return await getBookings(event);
    }
    if (method === "POST" && path.endsWith("/bookings")) {
      return await createBooking(event);
    }
    return response(404, { error: "Not found." });
  } catch (err) {
    console.error("Unhandled error:", err);
    return response(500, { error: "Internal server error." });
  }
};
