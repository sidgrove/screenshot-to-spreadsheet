import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: type, data: base64 } },
            { type: 'text', text: 'Look at this image and extract any data that could be useful in a spreadsheet. Return it as a JSON array of arrays where the first array contains column headers and subsequent arrays contain the data rows. Return ONLY the JSON array, no other text. Format: [["Header1","Header2"],["Data1","Data2"]]' }
          ]
        }]
      })

      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('')

      const parsed: string[][] = JSON.parse(text.replace(/```json|```/g, '').trim())
      if (!Array.isArray(parsed) || parsed.length === 0) continue
      if (i === 0) { headers = parsed[0]; allRows.push(...parsed.slice(1)) }
      else allRows.push(...parsed.slice(1))
    }

    if (!headers || allRows.length === 0) {
      return NextResponse.json({ error: 'No table data found in images' }, { status: 422 })
    }
    return NextResponse.json({ table: [headers, ...allRows] })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
