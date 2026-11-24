/**
 * Reads a prescription image / PDF with Google Gemini and returns structured medicines + tests.
 * Needs GEMINI_API_KEY in the environment (optional GEMINI_MODEL).
 */

export type GeminiConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface GeminiMedicine {
  medicineName: string;
  writtenAs?: string;
  strength?: string;
  dosage?: string;
  duration?: string;
  quantity?: string;
  instructions?: string;
  confidence: GeminiConfidence;
}

export interface GeminiTest {
  testName: string;
  writtenAs?: string;
  confidence: GeminiConfidence;
}

export interface GeminiPrescriptionExtract {
  isPrescription: boolean;
  doctorName?: string;
  patientName?: string;
  prescriptionDate?: string;
  diagnosis?: string;
  advice?: string;
  medicines: GeminiMedicine[];
  tests: GeminiTest[];
  unreadableNotes?: string;
}

export const GEMINI_SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

const PROMPT = `You are reading a doctor's prescription from India (printed or handwritten; may mix English and Hindi).
Extract ONLY what is actually written. Never invent medicines or tests that are not on the page.

Rules:
- medicines: every prescribed drug. medicineName = brand/generic name with form if written (e.g. "Tab Dolo 650").
  writtenAs = the text exactly as it appears on the page. strength = e.g. "650 mg".
  dosage = frequency as written or normalised (e.g. "1-0-1", "BD", "TDS", "SOS"). duration = e.g. "5 days".
  quantity = total count if written. instructions = e.g. "after food".
- tests: every lab test / investigation / scan advised (e.g. CBC, HbA1c, LFT, X-ray chest, USG abdomen).
- confidence per line: HIGH = clearly readable; MEDIUM = mostly readable; LOW = guessed or partly unreadable.
  If a name is hard to read, still include it with your best reading, keep writtenAs, and mark LOW.
- Do not list vitals, diagnosis, complaints, doctor registration numbers or clinic details as medicines/tests.
- diagnosis = provisional diagnosis / complaints if written. advice = follow-up or general advice if written.
- unreadableNotes: briefly mention any part you could not read.
- isPrescription = false if the image is not a prescription.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    isPrescription: { type: "BOOLEAN" },
    doctorName: { type: "STRING" },
    patientName: { type: "STRING" },
    prescriptionDate: { type: "STRING" },
    diagnosis: { type: "STRING" },
    advice: { type: "STRING" },
    medicines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          medicineName: { type: "STRING" },
          writtenAs: { type: "STRING" },
          strength: { type: "STRING" },
          dosage: { type: "STRING" },
          duration: { type: "STRING" },
          quantity: { type: "STRING" },
          instructions: { type: "STRING" },
          confidence: { type: "STRING", enum: ["HIGH", "MEDIUM", "LOW"] },
        },
        required: ["medicineName", "confidence"],
      },
    },
    tests: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          testName: { type: "STRING" },
          writtenAs: { type: "STRING" },
          confidence: { type: "STRING", enum: ["HIGH", "MEDIUM", "LOW"] },
        },
        required: ["testName", "confidence"],
      },
    },
    unreadableNotes: { type: "STRING" },
  },
  required: ["isPrescription", "medicines", "tests"],
};

export function getGeminiModel(): string {
  return (process.env.GEMINI_MODEL ?? "").trim() || "gemini-2.5-flash";
}

export function isGeminiConfigured(): boolean {
  return (process.env.GEMINI_API_KEY ?? "").trim().length > 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function extractPrescriptionWithGemini(
  file: Buffer,
  mimeType: string
): Promise<GeminiPrescriptionExtract> {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server");

  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: file.toString("base64") } }],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    getGeminiModel()
  )}:generateContent`;

  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
      signal: AbortSignal.timeout(90_000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(2000 * attempt);
      continue;
    }
    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}: ${json?.error?.message ?? "unknown error"}`);
    }
    const text: string | undefined = json?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("");
    if (!text) {
      const reason = json?.promptFeedback?.blockReason ?? json?.candidates?.[0]?.finishReason ?? "empty response";
      throw new Error(`No output from Gemini (${reason})`);
    }
    const parsed = JSON.parse(text) as GeminiPrescriptionExtract;
    parsed.medicines = Array.isArray(parsed.medicines) ? parsed.medicines : [];
    parsed.tests = Array.isArray(parsed.tests) ? parsed.tests : [];
    return parsed;
  }
}
