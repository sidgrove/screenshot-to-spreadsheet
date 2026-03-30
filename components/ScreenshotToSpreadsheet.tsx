'use client'
import React, { useState } from 'react'
import { Copy, CheckCircle2, RotateCcw, Sparkles, X, Play } from 'lucide-react'

interface FileData { name: string; type: string; base64: string; preview: string; isDuplicate: boolean }

export default function ScreenshotToSpreadsheet() {
  const [files, setFiles] = useState<FileData[]>([])
  const [loading, setLoading] = useState(false)
  const [tableData, setTableData] = useState<string[][] | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasteReady, setPasteReady] = useState(true)
  const [ignoreHeaders, setIgnoreHeaders] = useState(true)
  const [isDragging, setIsDragging] = useState(false)

  const readFileAsBase64 = (file: File): Promise<FileData> => new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const res = r.result as string; resolve({ name: file.name, type: file.type, base64: res.split(',')[1], preview: res, isDuplicate: false }) }
    r.onerror = () => reject(new Error(`Could not read ${file.name}`))
    r.readAsDataURL(file)
  })

  const checkForDuplicates = (newFiles: FileData[], cur: FileData[]) =>
    newFiles.map((f, i) => ({ ...f, isDuplicate: cur.some(c => c.base64 === f.base64) || newFiles.slice(0, i).some(c => c.base64 === f.base64) }))

  const handlePaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault()
        const blob = items[i].getAsFile()
        if (blob) {
          try { const fd = await readFileAsBase64(blob); setFiles(p => [...p, ...checkForDuplicates([fd], p)]); setError(null) }
          catch (err) { setError((err as Error).message) }
        }
        break
      }
    }
  }

  React.useEffect(() => {
    window.addEventListener('paste', handlePaste as unknown as EventListener)
    return () => window.removeEventListener('paste', handlePaste as unknown as EventListener)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    const imgs = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (imgs.length > 0) {
      try { const arr = await Promise.all(imgs.map(readFileAsBase64)); setFiles(p => [...p, ...checkForDuplicates(arr, p)]); setError(null) }
      catch (err) { setError((err as Error).message) }
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const imgs = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
    if (imgs.length === 0) { setError('Please upload image files'); return }
    try { const arr = await Promise.all(imgs.map(readFileAsBase64)); setFiles(p => [...p, ...checkForDuplicates(arr, p)]); setError(null) }
    catch (err) { setError((err as Error).message) }
  }

  const removeFile = (idx: number) => setFiles(p => p.filter((_, i) => i !== idx))

  const triggerConfetti = () => {
    const el = document.createElement('div')
    Object.assign(el.style, { position:'fixed', top:'0', left:'0', width:'100%', height:'100%', pointerEvents:'none', zIndex:'9999', overflow:'hidden' })
    document.body.appendChild(el)
    const colors = ['#ddd6fe','#fce7f3','#dbeafe','#fef3c7','#d1fae5']
    for (let i = 0; i < 100; i++) {
      const c = document.createElement('div')
      Object.assign(c.style, { position:'absolute', width:'8px', height:'8px', backgroundColor: colors[Math.floor(Math.random()*colors.length)], left:`${Math.random()*100}%`, top:'-20px', borderRadius:'2px' })
      const dur = 2 + Math.random()*1.5, delay = Math.random()*0.5, sway = (Math.random()-0.5)*100
      c.animate([{ transform:'translate(0,0) rotate(0deg)', opacity:'1' },{ transform:`translate(${sway}px,100vh) rotate(${Math.random()*720}deg)`, opacity:'0.8' }], { duration: dur*1000, delay: delay*1000, easing:'cubic-bezier(0.25,0.46,0.45,0.94)' })
      el.appendChild(c)
    }
    setTimeout(() => document.body.removeChild(el), 4000)
  }

  const processAllImages = async () => {
    const unique = files.filter(f => !f.isDuplicate)
    if (unique.length === 0) return
    setLoading(true); setError(null); setPasteReady(false)
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: unique.map(f => ({ base64: f.base64, type: f.type })) })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setTableData(data.table)
      triggerConfetti()
    } catch (err) {
      setError((err as Error).message || 'Failed to process images.')
      setPasteReady(true)
    } finally { setLoading(false) }
  }

  const copyTable = () => {
    if (!tableData) return
    const fmt = (cell: string) => { if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) { const [y,m,d] = cell.split('-'); return `${d}/${m}/${y}` } return cell }
    const rows = ignoreHeaders ? tableData.slice(1) : tableData
    const csv = rows.map(r => r.map(c => fmt(String(c))).join('\t')).join('\n')
    const ta = document.createElement('textarea')
    ta.value = csv; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const resetApp = () => { setFiles([]); setTableData(null); setError(null); setPasteReady(true); setIgnoreHeaders(true) }

  const dupCount = files.filter(f => f.isDuplicate).length
  const uniCount = files.filter(f => !f.isDuplicate).length

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="min-h-screen flex items-center justify-center p-4 md:p-8 py-16">
        <div className="w-full max-w-4xl">

          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 bg-violet-50 rounded-full border border-violet-100 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-violet-500 animate-pulse" strokeWidth={2.5} />
              <span className="text-xs font-semibold text-violet-600">AI-Powered</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-black text-slate-900 mb-2 tracking-tight">
              Screenshot to{' '}
              <span className="relative inline-block">
                <span className="relative z-10 bg-gradient-to-r from-violet-400/95 via-rose-400/90 to-blue-400/95 bg-clip-text text-transparent">Spreadsheet</span>
              </span>
            </h1>
            <p className="text-lg text-slate-600">Paste or drag screenshots, extract to a table, copy to a spreadsheet</p>
          </div>

          <div className="bg-gradient-to-br from-violet-200/60 via-rose-200/50 to-blue-200/60 rounded-3xl p-1 shadow-2xl">
            <div className="bg-white rounded-3xl overflow-hidden">

              {pasteReady && !loading && !tableData && (
                <div className={`px-16 md:px-24 ${files.length > 0 ? 'py-12 md:py-16' : 'py-28 md:py-36'} ${isDragging ? 'bg-violet-50/50' : ''} transition-colors`}
                  onDragOver={handleDragOver} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                  <div className="text-center space-y-7">
                    <div className="flex justify-center">
                      <div className="relative">
                        <div className="absolute inset-0 bg-violet-200/40 rounded-full blur-xl" />
                        <div className="relative w-20 h-20 bg-gradient-to-br from-violet-100 to-rose-100 rounded-full flex items-center justify-center border-2 border-white shadow-lg">
                          <span className="text-3xl">📋</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-xl font-bold text-slate-900">{isDragging ? 'Drop your screenshots here' : 'Paste or drag screenshots here'}</h2>
                      <div className="flex items-center justify-center gap-2 text-slate-500">
                        <kbd className="px-3 py-1.5 bg-white border border-slate-300/60 rounded-lg text-xs font-mono shadow-sm">⌘V</kbd>
                        <span className="text-slate-300">or</span>
                        <kbd className="px-3 py-1.5 bg-white border border-slate-300/60 rounded-lg text-xs font-mono shadow-sm">Ctrl+V</kbd>
                      </div>
                    </div>

                    {files.length > 0 && (
                      <div className="bg-slate-50 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-700">{files.length} image{files.length > 1 ? 's' : ''} ready</p>
                            {dupCount > 0 && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">⚠ {dupCount} duplicate{dupCount > 1 ? 's' : ''}</span>}
                          </div>
                          <button onClick={() => setFiles([])} className="text-xs text-slate-500 hover:text-slate-700">Clear all</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {files.map((fd, idx) => (
                            <div key={idx} className="relative group">
                              <div className={`w-20 h-20 rounded-lg overflow-hidden border-2 shadow-sm ${fd.isDuplicate ? 'border-amber-400 opacity-60' : 'border-slate-300'}`}>
                                <img src={fd.preview} alt="" className="w-full h-full object-cover" />
                              </div>
                              {fd.isDuplicate && <div className="absolute top-0 left-0 right-0 bg-amber-500 text-white text-[9px] font-bold px-1 py-0.5 text-center rounded-t-md">DUPLICATE</div>}
                              <button onClick={() => removeFile(idx)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button onClick={processAllImages} className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 bg-violet-50 hover:bg-violet-100 text-slate-800 text-sm font-bold rounded-xl border border-violet-200 transition-all">
                          <Play className="w-4 h-4" />
                          Extract{uniCount !== files.length ? ` (${uniCount} unique)` : ''}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-4"><div className="flex-1 h-px bg-slate-200" /><span className="text-sm text-slate-400">{files.length > 0 ? 'or add more' : 'or'}</span><div className="flex-1 h-px bg-slate-200" /></div>

                    <label className="inline-block cursor-pointer">
                      <div className="px-8 py-3.5 bg-gradient-to-b from-slate-100 to-white hover:from-slate-50 rounded-2xl shadow-md hover:shadow-lg transition-all border border-slate-300/60">
                        <span className="text-sm font-semibold text-slate-900">{files.length > 0 ? 'Add More Files' : 'Choose Files'}</span>
                      </div>
                      <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileChange} />
                    </label>
                  </div>
                </div>
              )}

              {loading && (
                <div className="px-16 py-28 md:py-36 flex flex-col items-center justify-center space-y-6">
                  <div className="w-16 h-16 border-4 border-slate-200 border-t-violet-600 rounded-full animate-spin" />
                  <div className="text-center">
                    <p className="text-lg font-semibold text-slate-900">Analyzing {uniCount} screenshot{uniCount > 1 ? 's' : ''}</p>
                    <p className="text-slate-500 text-sm mt-1">Extracting data...</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-16 bg-red-50 text-center space-y-4">
                  <p className="text-red-800 font-medium">{error}</p>
                  <button onClick={resetApp} className="px-6 py-2.5 bg-violet-50 hover:bg-violet-100 text-slate-800 text-sm font-semibold rounded-xl border border-violet-200">Try Again</button>
                </div>
              )}

              {tableData && !loading && (
                <div className="p-8 md:p-12">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-200">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Table Extracted</h2>
                      <p className="text-slate-500 text-sm mt-0.5">Ready to copy to your spreadsheet</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div onClick={() => setIgnoreHeaders(!ignoreHeaders)} className="flex items-center gap-3 cursor-pointer px-4 py-2 bg-slate-50 hover:bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className={`w-10 h-6 rounded-full transition-all duration-300 relative ${ignoreHeaders ? 'bg-violet-400' : 'bg-slate-300'}`}>
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-md ${ignoreHeaders ? 'left-5' : 'left-1'}`} />
                        </div>
                        <span className="text-sm font-medium text-slate-700">Ignore headers</span>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={copyTable} className="flex items-center gap-2 px-6 py-2.5 bg-violet-50 hover:bg-violet-100 text-slate-800 text-sm font-bold rounded-xl border border-violet-200 transition-all">
                          {copied ? <><CheckCircle2 className="w-4 h-4" />Copied!</> : <><Copy className="w-4 h-4" />Copy Table</>}
                        </button>
                        <button onClick={resetApp} className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl border border-slate-200 shadow-sm">
                          <RotateCcw className="w-4 h-4" />New
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-md">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>{tableData[0].map((h, i) => <th key={i} className="px-4 py-2 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">{h}</th>)}</tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {tableData.slice(1).map((row, ri) => (
                          <tr key={ri} className="hover:bg-violet-50/30 transition-colors">
                            {row.map((cell, ci) => <td key={ci} className="px-4 py-2 text-[11px] text-slate-900">{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-6 bg-amber-50 border border-amber-200/60 rounded-2xl p-4">
                    <p className="text-sm text-amber-900/80">💡 <strong>Tip:</strong> Click &quot;Copy Table&quot; then paste directly into your spreadsheet</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="text-center mt-10 text-sm text-slate-400">Powered by Claude AI</div>
        </div>
      </div>
    </div>
  )
}
