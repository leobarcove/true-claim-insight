import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { EXTRACTION_PROMPTS } from './prompts/index';
import { DocumentType } from '@tci/shared-types';

/**
 * Automate testing for document extraction using the GPU API.
 * This script reads hardcoded files from the 'test-files' directory.
 */

// Configuration - adjust as needed
const GPU_SERVICE_URL =
  process.env.GPU_SERVICE_URL || 'https://thirty-clearly-pillow-considering.trycloudflare.com';
const TEST_FILES_DIR = path.join(__dirname, 'test-files');
const OUTPUT_DIR = path.join(__dirname, 'test-results');
const PROCESSED_DIR = path.join(__dirname, 'test-processed');

// Hardcoded files to DocumentType mapping
const TEST_FILES = [
  { filename: 'voc_1.jpg', type: DocumentType.VEHICLE_REG_CARD },
  { filename: 'voc_2.jpg', type: DocumentType.VEHICLE_REG_CARD },
  { filename: 'nric.jpg', type: DocumentType.NRIC },
  { filename: 'nric_2.jpg', type: DocumentType.NRIC },
  { filename: 'police_report_1.jpg', type: DocumentType.POLICE_REPORT },
  { filename: 'police_report_2.jpg', type: DocumentType.POLICE_REPORT },
  { filename: 'damaged_vehicle_1.jpg', type: DocumentType.DAMAGE_PHOTO },
  { filename: 'damaged_vehicle_2.jpg', type: DocumentType.DAMAGE_PHOTO },
  { filename: 'workshop_repair_1.jpg', type: DocumentType.REPAIR_QUOTATION },
  { filename: 'workshop_repair_2.jpg', type: DocumentType.REPAIR_QUOTATION },
  { filename: 'insurance_document.jpg', type: DocumentType.POLICY_DOCUMENT },
];

async function postToGpu(endpoint: string, formData: any) {
  const response = await fetch(`${GPU_SERVICE_URL}${endpoint}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GPU API Error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function preprocessImage(
  buffer: Buffer,
  filename: string,
  docType: DocumentType
): Promise<Buffer> {
  let pipeline = sharp(buffer);
  const metadata = await pipeline.metadata();
  const originalWidth = metadata.width || 1024;
  const originalHeight = metadata.height || 1024;

  const MAX_PIXELS = 800000;
  const scale = Math.min(1.0, Math.sqrt(MAX_PIXELS / (originalWidth * originalHeight)));

  // Round to multiple of 56 (2 * 28-pixel patch size)
  // This ensures BOTH dimensions have an even number of patches,
  // preventing GGML/VLM sequence alignment errors (e.g. 27x37 patches = 999 tokens).
  const roundTo56 = (n: number) => Math.max(56, Math.round(n / 56) * 56);
  const targetWidth = roundTo56(originalWidth * scale);
  const targetHeight = roundTo56(originalHeight * scale);

  console.log(
    `  [~] Preprocessing ${filename}: ${originalWidth}x${originalHeight} -> ${targetWidth}x${targetHeight}`
  );

  // Enhance document text readability
  if (
    [
      DocumentType.NRIC,
      DocumentType.MYKAD_FRONT,
      DocumentType.DRIVING_LICENCE,
      DocumentType.VEHICLE_REG_CARD,
    ].includes(docType)
  ) {
    console.log(`  [~] Enhancing document text readability...`);
    pipeline = pipeline
      .grayscale()
      .normalise()
      .linear(1.2, -10)
      .modulate({ brightness: 1.2 })
      .sharpen();
  }

  return pipeline.resize({ width: targetWidth, height: targetHeight, fit: 'fill' }).toBuffer();
}

async function testFile(filename: string, docType: DocumentType) {
  const filePath = path.join(TEST_FILES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`  [!] Skipping ${filename}: File not found in ${TEST_FILES_DIR}`);
    return;
  }

  const ext = path.extname(filename).toLowerCase();
  console.log(`\n>>> Testing ${filename} as ${docType}...`);

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

    let result: any;
    const prompt = EXTRACTION_PROMPTS[docType] || 'Extract key info in JSON.';

    if (isImage) {
      console.log(`  [~] Sending to Vision API (qwen2.5vl:7b)...`);
      const optimizedBuffer = await preprocessImage(fileBuffer, filename, docType);

      // Save preprocessed file
      if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR);
      fs.writeFileSync(path.join(PROCESSED_DIR, filename), optimizedBuffer);

      const formData = new FormData();
      const blob = new Blob([optimizedBuffer]);
      formData.append('file', blob, filename);
      formData.append('prompt', prompt);
      formData.append('model', 'qwen2.5vl:7b');
      formData.append('format', 'json');

      result = await postToGpu('/v3/llm/vision', formData);
    } else {
      console.log(`  [~] Performing OCR first...`);
      const ocrFormData = new FormData();
      const ocrBlob = new Blob([fileBuffer]);
      ocrFormData.append('file', ocrBlob, filename);
      ocrFormData.append('engine', 'surya');

      const ocrResult = await postToGpu('/v3/ocr', ocrFormData);
      const rawText = (ocrResult as any).text || '';

      console.log(`  [~] Sending to LLM API (qwen2.5:7b)...`);
      const llmPrompt = `${prompt}\n\nDOCUMENT TEXT:\n${rawText}`;
      const llmFormData = new FormData();
      llmFormData.append('prompt', llmPrompt);
      llmFormData.append('model', 'qwen2.5:7b');
      llmFormData.append('format', 'json');

      result = await postToGpu('/v3/llm/generate', llmFormData);
    }

    const finalData = result.output || result;

    // Save Result
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
    const resultPath = path.join(OUTPUT_DIR, `${filename}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(finalData, null, 2));

    console.log(`  [+] Success! Result saved to ${path.relative(process.cwd(), resultPath)}`);
  } catch (error: any) {
    console.error(`  [x] Failed to process ${filename}:`, error.message);
  }
}

async function main() {
  console.log('=== Extraction Automation Test Script (Hardcoded Files) ===');
  console.log(`GPU URL: ${GPU_SERVICE_URL}`);
  console.log(`Test Files Dir: ${TEST_FILES_DIR}`);

  if (!fs.existsSync(TEST_FILES_DIR)) {
    console.error(`Error: Directory ${TEST_FILES_DIR} does not exist.`);
    process.exit(1);
  }

  console.log(`Processing ${TEST_FILES.length} hardcoded files...\n`);

  for (const test of TEST_FILES) {
    await testFile(test.filename, test.type);
  }

  console.log('\n=== All tests completed ===');
}

main().catch(err => {
  console.error('Fatal error in test script:', err);
});
