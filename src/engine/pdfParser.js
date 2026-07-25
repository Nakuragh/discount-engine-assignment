/**
 * pdfParser.js
 *
 * Extracts cart items from an uploaded PDF using pdfjs-dist (client-side only).
 * Instead of a fixed gap-size threshold, this reconstructs the 4 table columns
 * per row by finding that row's 3 largest horizontal gaps between text
 * fragments — those gaps are the column boundaries, regardless of how any
 * given PDF happens to encode spacing.
 */

import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

const EXPECTED_COLUMNS = 4

/**
 * Groups a page's text items into rows by vertical (y) position.
 */
function groupIntoRows(items) {
  const rowsByY = {}
  items.forEach((item) => {
    const y = Math.round(item.transform[5])
    if (!rowsByY[y]) rowsByY[y] = []
    rowsByY[y].push({
      x: item.transform[4],
      width: item.width || 0,
      text: item.str,
    })
  })
  return rowsByY
}

/**
 * Splits one row's text fragments into columns using the largest gaps
 * between fragments as column boundaries. Falls back to a single column
 * (whole row joined) if there aren't enough fragments to split meaningfully.
 */
function splitRowIntoColumns(fragments) {
  const sorted = fragments
    .filter((f) => f.text.trim().length > 0)
    .sort((a, b) => a.x - b.x)

  if (sorted.length === 0) return []
  function splitRowIntoColumns(fragments) {
  const sorted = fragments
    .filter((f) => f.text.trim().length > 0)
    .sort((a, b) => a.x - b.x)

  if (sorted.length === 0) return []
  if (sorted.length === 1) {
    // Single fragment — the whole row came through as one string.
    // Fall back to splitting on 2+ literal space characters inside it.
    const spaceSplit = sorted[0].text.trim().split(/\s{2,}/).filter(Boolean)
    return spaceSplit.length >= EXPECTED_COLUMNS ? spaceSplit : [sorted[0].text.trim()]
  }

  // ... rest of the function stays exactly the same (gap computation, etc.)

  // Compute the gap before each fragment (except the first)
  const gaps = []
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width)
    gaps.push({ index: i, gap })
  }

  // Pick the (EXPECTED_COLUMNS - 1) largest gaps as column-break points
  const breakCount = Math.min(EXPECTED_COLUMNS - 1, gaps.length)
  const sortedGaps = [...gaps].sort((a, b) => b.gap - a.gap)
  const breakIndices = new Set(
    sortedGaps.slice(0, breakCount).map((g) => g.index)
  )

  // Rebuild columns, inserting a space for small gaps that are just word spacing
  const columns = []
  let current = sorted[0].text
  for (let i = 1; i < sorted.length; i++) {
    const gapInfo = gaps[i - 1]
    if (breakIndices.has(i)) {
      columns.push(current.trim())
      current = sorted[i].text
    } else if (gapInfo.gap > 1.5) {
      current += ' ' + sorted[i].text
    } else {
      current += sorted[i].text
    }
  }
  columns.push(current.trim())

  return columns
}

/**
 * Extracts an array of column-arrays, one per row, from a PDF File object.
 */
async function extractRowsFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const allRows = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const rowsByY = groupIntoRows(content.items)

    const sortedY = Object.keys(rowsByY).sort((a, b) => b - a) // top to bottom
    sortedY.forEach((y) => {
      const columns = splitRowIntoColumns(rowsByY[y])
      if (columns.length > 0) allRows.push(columns)
    })
  }

  return allRows
}

/**
 * Parses one row's columns into a CartItem, or returns null if it doesn't
 * look like a valid data row (header, separator, order metadata, malformed).
 */
function parseRow(columns, index) {
  if (!columns || columns.length < EXPECTED_COLUMNS) return null

  const joined = columns.join(' ')
  if (/^-+$/.test(joined.replace(/\s/g, ''))) return null
  if (/^(order|date|product)\b/i.test(joined.trim())) return null

  const [product, brand, platform, priceRaw] = columns

  const priceMatch = priceRaw.match(/Rs\.?\s?([\d,]+(?:\.\d+)?)/i)
  if (!priceMatch) return null

  const basePrice = parseFloat(priceMatch[1].replace(/,/g, ''))
  if (isNaN(basePrice) || basePrice <= 0) return null
  if (!product || !brand || !platform) return null

  return {
    itemId: `ITEM-PDF-${index + 1}`,
    product: product.trim(),
    brand: brand.trim(),
    platform: platform.trim(),
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

  rows.forEach((columns) => {
    const joined = columns.join(' ').trim()
    if (!joined) return

    const parsed = parseRow(columns, itemIndex)
    if (parsed) {
      data.push(parsed)
      itemIndex++
    } else if (/\d/.test(joined) && !/^(order|date)/i.test(joined)) {
      skippedRows.push(joined)
    }
  })

  if (data.length === 0) {
    return { data: [], skippedRows, error: 'No valid item rows found in this PDF.' }
  }

  return { data, skippedRows, error: null }
}