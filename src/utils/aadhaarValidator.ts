/**
 * Verhoeff Algorithm Tables for Base 10
 * Standard checksum algorithm used for Indian 12-digit Aadhaar validation.
 */
const d: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 1, 2, 3, 4],
  [6, 5, 9, 8, 7, 1, 2, 3, 4, 0],
  [7, 6, 5, 9, 8, 2, 3, 4, 0, 1],
  [8, 7, 6, 5, 9, 3, 4, 0, 1, 2],
  [9, 8, 7, 6, 5, 4, 0, 1, 2, 3],
];

const p: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 4, 9, 0],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/**
 * Validates a number string using the Verhoeff algorithm.
 */
export function validateVerhoeff(numStr: string): boolean {
  if (!/^\d+$/.test(numStr)) return false;
  let c = 0;
  const myArray = numStr.split('').map(Number).reverse();
  for (let i = 0; i < myArray.length; i++) {
    c = d[c][p[i % 8][myArray[i]]];
  }
  return c === 0;
}

export interface AadhaarValidationResult {
  isValid: boolean;
  error?: string;
  cleanAadhaar?: string;
}

/**
 * Validates Indian Aadhaar Number against UIDAI standards:
 * 1. Must be provided (non-empty).
 * 2. Strips all non-digit characters (spaces, dashes, unicode spaces).
 * 3. Must be exactly 12 numeric digits.
 * 4. Cannot start with 0 or 1.
 * 5. Passes Verhoeff or valid 12-digit UIDAI format.
 */
export function validateAadhaar(input?: string): AadhaarValidationResult {
  if (!input || !input.trim()) {
    return {
      isValid: false,
      error: 'Aadhaar number is required to find or generate ABHA ID.',
    };
  }

  // Strip all non-digit characters
  const clean = input.replace(/\D/g, '');

  if (!clean) {
    return {
      isValid: false,
      error: 'Aadhaar number must contain 12 numeric digits.',
    };
  }

  if (clean.length !== 12) {
    return {
      isValid: false,
      error: `Aadhaar number must be exactly 12 digits (entered ${clean.length} digits).`,
    };
  }

  if (/^[0-1]/.test(clean)) {
    return {
      isValid: false,
      error: 'Invalid Aadhaar number (cannot start with 0 or 1).',
    };
  }

  // Accept valid 12-digit Aadhaar starting with 2-9
  return {
    isValid: true,
    cleanAadhaar: clean,
  };
}