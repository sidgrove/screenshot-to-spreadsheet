import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const GENERIC_PROMPT = 'Look at this image and extract any data that could be useful in a spreadsheet. Return it as a JSON array of arrays where the first array contains column headers and subsequent arrays contain the data rows. Return ONLY the JSON array, no other text. Format: [["Header1","Header2"],["Data1","Data2"]]'

const XERO_BATCH_PAYMENT_PROMPT = `This is a Xero batch payment screenshot. It has a header area showing payment metadata (bank account, "Paid on" date, payment type, etc.) and a table of payees below.

Extract the data as a JSON array of arrays. The columns MUST be in this exact order:
["Payee", "Bill ref", "Payee ref", "Status", "Paid on", "Amount"]

IMPORTANT:
- The "Paid on" date is shown in the header area at the top of the screenshot (e.g. "Paid on 16 Mar 2026"). Extract this date and apply it to EVERY row in the table as the "Paid on" column value. Format the date as DD/MM/YYYY.
- The Amount should include the currency symbol (e.g. £5,448.00).
- If a cell is empty, use an empty string "".

Return ONLY the JSON array, no other text. Format: [["Payee","Bill ref","Payee ref","Status","Paid on","Amount"],["...","...","...","...","...","..."]]`

const DETECT_TEMPLATE_PROMPT = `Look at this image quickly. Is this a Xero batch payment screen? It would show:
- A bank account name at the top left (e.g. "Starling Business Account")
- A "Paid on" date in the header
- Payment type "Supplier"
- A table with columns like Payee, Bill ref, Payee ref, Status, Amount

Reply with ONLY "xero_batch_payment" if it matches, or "generic" if it does not. Nothing else.`

type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

async function detectTemplate(base64: string, type: string): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 32,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: type as MediaType, data: base64 } },
        { type: 'text', text: DETECT_TEMPLATE_PROMPT }
      ]
    }]
  })
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text).join('').trim().toLowerCase()
  return text.includes('xero_batch_payment') ? 'xero_batch_payment' : 'generic'
}

function getPromptForTemplate(template: string): string {
  if (template === 'xero_batch_payment') return XERO_BATCH_PAYMENT_PROMPT
  return GENERIC_PROMPT
}

export async function POST(req: NextRequest) {
  try {
    const { images } = await req.json()
    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 })
    }

    const allRows: string[][] = []
    let headers: string[] | null = null

    for (let i = 0; i < images.length; i++) {
      const { base64, type } = images[i]

      // Detect template per image so each screenshot gets the right prompt
      const template = await detectTemplate(base64, type)
      const prompt = getPromptForTemplate(template)

      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: type as MediaType, data: base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })

      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('')

      const parsed: string[][] = JSON.parse(text.replace(/```json|```/g, '').trim())
      if (!Array.isArray(parsed) || parsed.length === 0) continue

      const imgHeaders = parsed[0]
      const imgRows = parsed.slice(1)

      if (!headers) {
        // First image sets the canonical headers
        headers = imgHeaders
        allRows.push(...imgRows)
      } else {
        // Subsequent images: align columns to match the first image's headers
        // This handles mixing Xero (with Paid on) and generic screenshots,
        // or multiple Xero screenshots each with their own Paid on date
        const colMap = imgHeaders.map(h => headers!.indexOf(h))
        for (const row of imgRows) {
          const aligned = headers.map((_, ci) => {
            const srcIdx = colMap.indexOf(ci)
            if (srcIdx !== -1 && srcIdx < row.length) return row[srcIdx]
            // Check by header name match
            const matchIdx = imgHeaders.findIndex(h => h === headers![ci])
            if (matchIdx !== -1 && matchIdx < row.length) return row[matchIdx]
            return ''
          })
          allRows.push(aligned)
        }
      }
    }

    if (!headers || allRows.length === 0) {
      return NextResponse.json({ error: 'No table data found in images' }, { status: 422 })
    }
    return NextResponse.json({ table: [headers, ...allRows] })
  } catch (err: unknown) {
    console.error('[extract] error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
