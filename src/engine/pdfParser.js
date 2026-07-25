/**
 * pdfParser.js
 *
 * Extracts cart items from an uploaded PDF using pdfjs-dist (client-side only).
 * Reconstructs table columns using each text fragment's x-position, since PDFs
 * don't reliably preserve whitespace as literal space characters — a wide gap
 * between two text fragments means a new column, not just a bigger space.
 */

import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

const COLUMN_GAP_THRESHOLD = 10 // points; gap wider than this = new column
const WORD_SPACE_THRESHOLD = 1.5
/**
 * Extracts rows of column-separated text from a PDF File object.
 * Returns an array of strings, one per row, with columns joined by '\t'.
 */
async function extractRowsFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const allRows = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    // Group text fragments by their vertical position (y) to reconstruct rows
    const rowsByY = {}
    content.items.forEach((item) => {
      const y = Math.round(item.transform[5])
      if (!rowsByY[y]) rowsByY[y] = []
      rowsByY[y].push({
        x: item.transform[4],
        width: item.width || 0,
        text: item.str,
      })
    })

    const sortedY = Object.keys(rowsByY).sort((a, b) => b - a) // top to bottom

    sortedY.forEach((y) => {
      const fragments = rowsByY[y]
        .filter((f) => f.text.trim().length > 0)
        .sort((a, b) => a.x - b.x)

      if (fragments.length === 0) return

      // Merge fragments into columns based on x-gap
      const columns = []
      let currentColumn = fragments[0].text
      let prevEndX = fragments[0].x + fragments[0].width

      for (let i = 1; i < fragments.length; i++) {
        const frag = fragments[i]
        const gap = frag.x - prevEndX

        if (gap > COLUMN_GAP_THRESHOLD) {
          columns.push(currentColumn.trim())
          currentColumn = frag.text
        } else if (gap > WORD_SPACE_THRESHOLD) {
          currentColumn += ' ' + frag.text
        } else {
          currentColumn += frag.text
        }
        prevEndX = frag.x + frag.width
      }
      columns.push(currentColumn.trim())

      allRows.push(columns.join('\t'))
    })
  }

  return allRows
}

/**
 * Parses one tab-separated row into a CartItem, or returns null if
 * the row doesn't look like a valid data row (header, separator, malformed).
 */
function parseRow(rowText, index) {
  const trimmed = rowText.trim()
  if (!trimmed) return null
  if (/^-+$/.test(trimmed.replace(/\t/g, ''))) return null
  if (/^(order|date|product)\b/i.test(trimmed)) return null

  let parts = trimmed.split('\t').map((p) => p.trim()).filter(Boolean)

  // Fallback: if column-gap detection didn't produce enough columns,
  // try splitting on the raw text as if it were space-delimited instead.
  if (parts.length < 4) {
    const collapsed = trimmed.replace(/\t/g, ' ')
    const spaceSplit = collapsed.split(/\s{2,}/).filter(Boolean)
    if (spaceSplit.length >= 4) {
      parts = spaceSplit
    }
  }

  if (parts.length < 4) return null

  const [product, brand, platform, priceRaw] = parts

  const priceMatch = priceRaw.match(/Rs\.?\s?([\d,]+(?:\.\d+)?)/i)
  if (!priceMatch) return null

  const basePrice = parseFloat(priceMatch[1].replace(/,/g, ''))
  if (isNaN(basePrice) || basePrice <= 0) return null

  return {
    itemId: `ITEM-PDF-${index + 1}`,
    product,
    brand,
    platform,
    basePrice: Math.round(basePrice),
  }
}

/**
 * Main entry point: takes a File object, returns { data, skippedRows, error }.
 */
export async function parseCartPdf(file) {
  const rows = await extractRowsFromPdf(file)

  const data = []
  const skippedRows = []
  let itemIndex = 0

  rows.forEach((rowText) => {
    const parsed = parseRow(rowText, itemIndex)
    if (parsed) {
      data.push(parsed)
      itemIndex++
    } else if (/\d/.test(rowText) && !/^(order|date)/i.test(rowText.trim())) {
      skippedRows.push(rowText.replace(/\t/g, '  ').trim())
    }
  })

  if (data.length === 0) {
    return { data: [], skippedRows, error: 'No valid item rows found in this PDF.' }
  }

  return { data, skippedRows, error: null }
}