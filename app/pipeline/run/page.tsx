'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface PipelineStatus {
  overallStatus: 'pending' | 'processing' | 'in_progress' | 'completed' | 'failed' | 'unknown'
  isProcessing: boolean
  steps: Array<{
    step_name: string
    status: string
    error_message?: string
    updated_at?: any
  }>
}

export default function RunPipeline() {
  const router = useRouter()
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [statusPolling, setStatusPolling] = useState<NodeJS.Timeout | null>(null)

  // Form state - all free form text
  const [bookTitle, setBookTitle] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [pipelineType, setPipelineType] = useState<'audiobook' | 'picturebook' | 'both'>('audiobook')
  const [processEntireBook, setProcessEntireBook] = useState(true)

  // Check for URL parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const bookParam = searchParams.get('book')
    const chapterParam = searchParams.get('chapter')
    
    if (bookParam) {
      const decodedBook = decodeURIComponent(bookParam)
      setBookTitle(decodedBook)
      console.log('Loaded book from URL:', decodedBook)
      
      if (chapterParam) {
        const decodedChapter = decodeURIComponent(chapterParam)
        setChapterTitle(decodedChapter)
        setProcessEntireBook(false)
        console.log('Loaded chapter from URL:', decodedChapter)
      }
    }
  }, [])

  useEffect(() => {
    // Cleanup polling on unmount
    return () => {
      if (statusPolling) {
        clearInterval(statusPolling)
      }
    }
  }, [statusPolling])

  const loadPipelineStatus = useCallback(async (bookSafeTitle: string) => {
    try {
      const response = await fetch(`/api/pipeline/status?bookSafeTitle=${encodeURIComponent(bookSafeTitle)}`)
      if (!response.ok) return
      
      const data = await response.json()
      setPipelineStatus({
        overallStatus: data.overallStatus || 'unknown',
        isProcessing: data.isProcessing || false,
        steps: data.steps || [],
      })
      
      // Stop polling if not processing
      if (!data.isProcessing) {
        setStatusPolling(prev => {
          if (prev) {
            clearInterval(prev)
          }
          return null
        })
      }
    } catch (error) {
      console.error('Error loading pipeline status:', error)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!bookTitle.trim()) {
      alert('Please enter a book name')
      return
    }

    if (!processEntireBook && !chapterTitle.trim()) {
      alert('Please enter a chapter name or choose to process entire book')
      return
    }

    try {
      setProcessing(true)
      setResult(null)

      // Convert book title to safe title (same logic as backend)
      const bookSafeTitle = bookTitle
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .trim()

      // Determine action based on pipeline type
      const action: 'content' | 'illustrations' | 'both' = 
        pipelineType === 'picturebook' ? 'illustrations' :
        pipelineType === 'both' ? 'both' :
        'content'

      const response = await fetch('/api/pipeline/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookSafeTitle,
          action,
          chapterTitle: processEntireBook ? undefined : chapterTitle.trim(),
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Don't show "triggered successfully" - show actual pipeline status
        setResult({
          success: true,
          message: 'Pipeline started. Monitoring status...',
        })
        
        // Start polling for actual status
        const bookSafeTitle = bookTitle
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .replace(/\s+/g, '_')
          .trim()
        
        // Immediately set status to processing (optimistic update)
        setPipelineStatus({
          overallStatus: 'processing',
          isProcessing: true,
          steps: [],
        })
        
        loadPipelineStatus(bookSafeTitle)
        const interval = setInterval(() => {
          loadPipelineStatus(bookSafeTitle)
        }, 3000) // Poll every 3 seconds
        setStatusPolling(interval)
      } else {
        throw new Error(data.error || 'Failed to trigger pipeline')
      }
    } catch (error: any) {
      console.error('Error triggering pipeline:', error)
      setResult({
        success: false,
        message: error.message || 'Failed to trigger pipeline',
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Header */}
        <header className="mb-6">
          <button
            onClick={() => router.push('/pipeline')}
            className="text-purple-600 dark:text-purple-400 hover:underline mb-2 flex items-center"
          >
            ← Back to Pipeline Management
          </button>
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
            🚀 Run Pipeline
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Configure and run pipeline with custom settings
          </p>
        </header>

        {/* Info Box */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">
            ℹ️ Pipeline Configuration
          </h3>
          <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
            <li>
              <strong>Book Name:</strong> Enter the book title (e.g., "Harry Potter and the Sorcerer's Stone")
            </li>
            <li>
              <strong>Chapter:</strong> Choose to process entire book or enter a specific chapter name
            </li>
            <li>
              <strong>Pipeline Type:</strong> 
              <ul className="ml-4 mt-1 space-y-1">
                <li><strong>Audiobook Pipeline:</strong> Generates content (narration + reading version) and audio files</li>
                <li><strong>Picture Book Pipeline:</strong> Generates illustrations and compiles picture book</li>
                <li><strong>Both:</strong> Runs both pipelines sequentially</li>
              </ul>
            </li>
            <li>Pipeline tasks are submitted to Pub/Sub and processed asynchronously</li>
          </ul>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Book Name Input */}
            <div>
              <label htmlFor="book" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Book Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="book"
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
                placeholder="e.g., Harry Potter and the Sorcerer's Stone"
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Enter the exact book title as it appears in your system
              </p>
            </div>

            {/* Process Entire Book or Single Chapter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Processing Scope
              </label>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={processEntireBook}
                    onChange={() => {
                      setProcessEntireBook(true)
                      setChapterTitle('')
                    }}
                    className="mr-2"
                  />
                  <span className="text-gray-700 dark:text-gray-300">Process Entire Book</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={!processEntireBook}
                    onChange={() => setProcessEntireBook(false)}
                    className="mr-2"
                  />
                  <span className="text-gray-700 dark:text-gray-300">Process Single Chapter</span>
                </label>
              </div>
            </div>

            {/* Chapter Name Input (only if single chapter) */}
            {!processEntireBook && (
              <div>
                <label htmlFor="chapter" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Chapter Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="chapter"
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                  placeholder="e.g., Chapter 1"
                  required={!processEntireBook}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Enter the exact chapter title as it appears in your system
                </p>
              </div>
            )}

            {/* Pipeline Type Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Pipeline Type <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                <label className="flex items-start p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={pipelineType === 'audiobook'}
                    onChange={() => setPipelineType('audiobook')}
                    className="mr-3 mt-1"
                  />
                  <div>
                    <span className="text-gray-700 dark:text-gray-300 font-semibold">
                      🎧 Audiobook Pipeline
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Generates content (narration + reading version) and audio files. Skips illustration generation.
                    </p>
                  </div>
                </label>
                <label className="flex items-start p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={pipelineType === 'picturebook'}
                    onChange={() => setPipelineType('picturebook')}
                    className="mr-3 mt-1"
                  />
                  <div>
                    <span className="text-gray-700 dark:text-gray-300 font-semibold">
                      🖼️ Picture Book Pipeline
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Generates illustrations and compiles picture book. Requires existing content.
                    </p>
                  </div>
                </label>
                <label className="flex items-start p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={pipelineType === 'both'}
                    onChange={() => setPipelineType('both')}
                    className="mr-3 mt-1"
                  />
                  <div>
                    <span className="text-gray-700 dark:text-gray-300 font-semibold">
                      🔄 Both Pipelines
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Runs audiobook pipeline first, then picture book pipeline.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Result Message */}
            {result && (
              <div
                className={`p-4 rounded-lg ${
                  result.success
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}
              >
                <div
                  className={`text-sm ${
                    result.success
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {result.success ? '✅' : '❌'} {result.message}
                </div>
              </div>
            )}

            {/* Pipeline Status */}
            {pipelineStatus && (
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                  Pipeline Execution Status
                  {pipelineStatus.isProcessing && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  )}
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Status:</span>
                    <span className={`px-3 py-1 rounded text-xs font-semibold ${
                      pipelineStatus.overallStatus === 'completed' 
                        ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : pipelineStatus.overallStatus === 'failed'
                        ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                        : pipelineStatus.overallStatus === 'processing' || pipelineStatus.overallStatus === 'in_progress'
                        ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                    }`}>
                      {pipelineStatus.overallStatus === 'processing' || pipelineStatus.overallStatus === 'in_progress' 
                        ? '🔄 Running' 
                        : pipelineStatus.overallStatus === 'completed'
                        ? '✅ Completed'
                        : pipelineStatus.overallStatus === 'failed'
                        ? '❌ Failed'
                        : pipelineStatus.overallStatus}
                    </span>
                  </div>
                  {pipelineStatus.steps.length > 0 && (
                    <div className="space-y-1 mt-2">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Processing Steps:</span>
                      {pipelineStatus.steps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs pl-2">
                          <span className="text-gray-500 dark:text-gray-400 min-w-[120px]">{step.step_name}:</span>
                          <span className={`px-2 py-0.5 rounded ${
                            step.status === 'completed'
                              ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                              : step.status === 'failed'
                              ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                              : step.status === 'in_progress' || step.status === 'processing'
                              ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                          }`}>
                            {step.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {pipelineStatus.steps.some(s => s.status === 'failed' && s.error_message) && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                      <strong>Error:</strong> {pipelineStatus.steps.find(s => s.status === 'failed')?.error_message}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={processing || !bookTitle.trim() || (!processEntireBook && !chapterTitle.trim())}
                className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    🚀 Run Pipeline
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBookTitle('')
                  setChapterTitle('')
                  setPipelineType('audiobook')
                  setProcessEntireBook(true)
                  setResult(null)
                  setPipelineStatus(null)
                  if (statusPolling) {
                    clearInterval(statusPolling)
                    setStatusPolling(null)
                  }
                }}
                className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        {/* Summary */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3">
            Configuration Summary
          </h3>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div>
              <strong>Book:</strong>{' '}
              {bookTitle.trim() || 'Not entered'}
            </div>
            <div>
              <strong>Scope:</strong>{' '}
              {processEntireBook ? 'Entire Book' : `Single Chapter: ${chapterTitle.trim() || 'Not entered'}`}
            </div>
            <div>
              <strong>Pipeline Type:</strong>{' '}
              {pipelineType === 'audiobook' 
                ? 'Audiobook Pipeline (Content + Audio)' 
                : pipelineType === 'picturebook'
                ? 'Picture Book Pipeline (Illustrations)'
                : 'Both Pipelines'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

