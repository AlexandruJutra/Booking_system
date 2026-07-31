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
const AUTH_TOKEN = process.env.AUTH_TOKEN || "demo-secret-token";

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
  const header = getHeader(event, "authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  return token !== null && token === AUTH_TOKEN;
}

// --- Route handlers ------------------------------------------------

// GET /slots (public)
async function getSlots() {
  const result = await ddb.send(
    new ScanCommand({
      TableName: SLOTS_TABLE,
      FilterExpression: "available = :true",
      ExpressionAttributeValues: { ":true": true },
    })
  );

  const slots = (result.Items || []).sort((a, b) => {
    if (a.date === b.date) return a.time.localeCompare(b.time);
    return a.date.localeCompare(b.date);
  });

  return response(200, { slots });
}

// POST /bookings (requires auth token)
async function createBooking(event) {
  if (!isAuthorized(event)) {
    return response(401, {
      error: "Unauthorized. A valid Bearer token is required.",
    });
  }

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
    id: randomUUID(),
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
    if (method === "POST" && path.endsWith("/bookings")) {
      return await createBooking(event);
    }
    return response(404, { error: "Not found." });
  } catch (err) {
    console.error("Unhandled error:", err);
    return response(500, { error: "Internal server error." });
  }
};
