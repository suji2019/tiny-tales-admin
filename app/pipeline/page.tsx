'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Book {
  id: string
  title: string
  safe_title: string
  chapter_count: number
  status: string
}

interface PipelineStatus {
  overallStatus: 'pending' | 'processing' | 'in_progress' | 'completed' | 'failed' | 'unknown'
  isProcessing: boolean
  bookStatus?: string
  steps: Array<{
    id?: string
    step_name: string
    status: string
    error_message?: string
    updated_at?: any
    created_at?: any
  }>
}

export default function PipelineManagement() {
  const router = useRouter()
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<Record<string, { success: boolean; message: string }>>({})
  const [pipelineStatuses, setPipelineStatuses] = useState<Record<string, PipelineStatus>>({})
  const [statusPolling, setStatusPolling] = useState<Record<string, NodeJS.Timeout>>({})
  const [stopping, setStopping] = useState<Record<string, boolean>>({})
  const [removing, setRemoving] = useState<Record<string, boolean>>({})

  const loadPipelineStatus = useCallback(async (bookSafeTitle: string) => {
    try {
      const response = await fetch(`/api/pipeline/status?bookSafeTitle=${encodeURIComponent(bookSafeTitle)}`)
      if (!response.ok) {
        console.error(`Failed to load pipeline status for ${bookSafeTitle}: ${response.status}`)
        return
      }
      
      const data = await response.json()
      
      // Log for debugging
      if (data.steps && data.steps.length > 0) {
        console.log(`Loaded pipeline status for ${bookSafeTitle}: ${data.steps.length} steps, status=${data.overallStatus}`)
      }
      
      setPipelineStatuses(prev => ({
        ...prev,
        [bookSafeTitle]: {
          overallStatus: data.overallStatus || 'unknown',
          isProcessing: data.isProcessing || false,
          bookStatus: data.bookStatus || 'unknown',
          steps: data.steps || [],
        },
      }))
    } catch (error) {
      console.error(`Error loading pipeline status for ${bookSafeTitle}:`, error)
    }
  }, [])

  const loadBooks = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/books')
      if (!response.ok) throw new Error('Failed to load books')
      const data = await response.json()
      
      // Transform to Book format
      const booksList = data.books.map((book: any) => ({
        id: book.filename,
        title: book.book_title,
        safe_title: book.filename,
        chapter_count: book.chapter_count,
        status: 'unknown',
      }))
      setBooks(booksList)
      
      // Load pipeline statuses for all books
      booksList.forEach((book: Book) => {
        loadPipelineStatus(book.safe_title)
      })
    } catch (error) {
      console.error('Error loading books:', error)
      alert('Failed to load books')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBooks()
    
    // Cleanup polling on unmount
    return () => {
      Object.values(statusPolling).forEach(interval => clearInterval(interval))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Start polling for books that are processing or pending
    books.forEach(book => {
      const status = pipelineStatuses[book.safe_title]
      const shouldPoll = status?.isProcessing || 
                        status?.overallStatus === 'processing' || 
                        status?.overallStatus === 'in_progress' ||
                        status?.overallStatus === 'pending' ||
                        status?.bookStatus === 'processing' ||
                        !status // Poll if status not loaded yet
      
      if (shouldPoll && !statusPolling[book.safe_title]) {
        // Start polling
        const interval = setInterval(() => {
          loadPipelineStatus(book.safe_title)
        }, 3000) // Poll every 3 seconds
        setStatusPolling(prev => ({ ...prev, [book.safe_title]: interval }))
      } else if (!shouldPoll && statusPolling[book.safe_title]) {
        // Stop polling if not processing/pending
        clearInterval(statusPolling[book.safe_title])
        setStatusPolling(prev => {
          const newPolling = { ...prev }
          delete newPolling[book.safe_title]
          return newPolling
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, pipelineStatuses, loadPipelineStatus])

  const stopPipeline = async (bookSafeTitle: string) => {
    if (!confirm(`Are you sure you want to stop the pipeline for this book? This will cancel all in-progress processing steps.`)) {
      return
    }

    try {
      setStopping(prev => ({ ...prev, [bookSafeTitle]: true }))
      const response = await fetch('/api/pipeline/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookSafeTitle }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        alert(`✅ ${data.message} (${data.cancelledSteps} steps cancelled)`)
        // Reload pipeline status
        await loadPipelineStatus(bookSafeTitle)
      } else {
        throw new Error(data.error || 'Failed to stop pipeline')
      }
    } catch (error: any) {
      console.error('Error stopping pipeline:', error)
      alert(`❌ Error: ${error.message || 'Failed to stop pipeline'}`)
    } finally {
      setStopping(prev => ({ ...prev, [bookSafeTitle]: false }))
    }
  }

  const removePipeline = async (bookSafeTitle: string) => {
    if (!confirm(`Are you sure you want to remove all pipeline processing steps for this book? This will delete all processing history but keep the book data.`)) {
      return
    }

    try {
      setRemoving(prev => ({ ...prev, [bookSafeTitle]: true }))
      const response = await fetch(`/api/pipeline/${encodeURIComponent(bookSafeTitle)}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Stop polling if active
        if (statusPolling[bookSafeTitle]) {
          clearInterval(statusPolling[bookSafeTitle])
          setStatusPolling(prev => {
            const newPolling = { ...prev }
            delete newPolling[bookSafeTitle]
            return newPolling
          })
        }
        
        // Immediately remove pipeline status (set to empty steps)
        setPipelineStatuses(prev => {
          const newStatuses = { ...prev }
          // Clear steps so the filter will hide it
          if (newStatuses[bookSafeTitle]) {
            newStatuses[bookSafeTitle] = {
              ...newStatuses[bookSafeTitle],
              steps: [],
              overallStatus: 'unknown',
              isProcessing: false,
            }
          }
          return newStatuses
        })
        
        // Remove book from the list immediately
        setBooks(prev => prev.filter(book => book.safe_title !== bookSafeTitle))
        
        // Clean up status completely after removal
        setTimeout(() => {
          setPipelineStatuses(prev => {
            const newStatuses = { ...prev }
            delete newStatuses[bookSafeTitle]
            return newStatuses
          })
        }, 0)
        
        alert(`✅ ${data.message}`)
      } else {
        throw new Error(data.error || 'Failed to remove pipeline steps')
      }
    } catch (error: any) {
      console.error('Error removing pipeline steps:', error)
      alert(`❌ Error: ${error.message || 'Failed to remove pipeline steps'}`)
    } finally {
      setRemoving(prev => ({ ...prev, [bookSafeTitle]: false }))
    }
  }

  const triggerPipeline = async (bookSafeTitle: string, action: 'content' | 'illustrations') => {
    try {
      setProcessing(prev => ({ ...prev, [bookSafeTitle]: true }))
      setResults(prev => ({ ...prev, [bookSafeTitle]: { success: false, message: '' } }))

      const response = await fetch('/api/pipeline/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookSafeTitle,
          action,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Don't show success message - just start polling for actual status
        // The status will show if pipeline is running or completed
        
        // Immediately set status to processing (optimistic update)
        setPipelineStatuses(prev => ({
          ...prev,
          [bookSafeTitle]: {
            overallStatus: 'processing',
            isProcessing: true,
            steps: [],
          },
        }))
        
        // Start polling for actual status
        loadPipelineStatus(bookSafeTitle)
        const interval = setInterval(() => {
          loadPipelineStatus(bookSafeTitle)
        }, 3000)
        setStatusPolling(prev => ({ ...prev, [bookSafeTitle]: interval }))
      } else {
        throw new Error(data.error || 'Failed to trigger pipeline')
      }
    } catch (error: any) {
      console.error('Error triggering pipeline:', error)
      setResults(prev => ({
        ...prev,
        [bookSafeTitle]: {
          success: false,
          message: error.message || 'Failed to trigger pipeline',
        },
      }))
      alert(`❌ Error: ${error.message || 'Failed to trigger pipeline'}`)
    } finally {
      setProcessing(prev => ({ ...prev, [bookSafeTitle]: false }))
    }
  }

  const getStatusBadge = (status: string) => {
    // Normalize status to lowercase for comparison
    const normalizedStatus = (status || '').toLowerCase()
    
    const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
      pending: { label: 'Pending', color: 'text-yellow-700 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/20' },
      processing: { label: 'Processing', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/20' },
      'in_progress': { label: 'In Progress', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/20' },
      inprogress: { label: 'In Progress', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/20' },
      completed: { label: 'Completed', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/20' },
      failed: { label: 'Failed', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/20' },
      cancelled: { label: 'Cancelled', color: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/20' },
      unknown: { label: 'Unknown', color: 'text-gray-700 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-700' },
    }
    
    const config = statusConfig[normalizedStatus] || { 
      label: status || 'Unknown', 
      color: 'text-gray-700 dark:text-gray-400', 
      bgColor: 'bg-gray-100 dark:bg-gray-700' 
    }
    
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${config.bgColor} ${config.color}`}>
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading books...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-6">
          <div className="flex gap-4 mb-2">
            <button
              onClick={() => router.push('/')}
              className="text-purple-600 dark:text-purple-400 hover:underline flex items-center"
            >
              ← Back to Books
            </button>
            <button
              onClick={() => router.push('/pipeline/run')}
              className="text-green-600 dark:text-green-400 hover:underline flex items-center"
            >
              🚀 Run Pipeline →
            </button>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
            🔄 Pipeline Management
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Re-run pipeline to regenerate content or illustrations
          </p>
        </header>

        {/* Info Box */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">
            ℹ️ About Pipeline Operations
          </h3>
          <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
            <li>
              <strong>🎧 Audiobook Pipeline:</strong> Generates content (narration + reading version) and audio files. Skips illustration generation.
            </li>
            <li>
              <strong>🖼️ Picture Book Pipeline:</strong> Generates illustrations and compiles picture book. Requires existing content.
            </li>
            <li>
              <strong>Two Independent Pipelines:</strong> These are separate processes that can be run independently or together
            </li>
            <li>
              <strong>For single chapter processing:</strong> Use the "Run Pipeline" page to configure book name, chapter name, and pipeline type
            </li>
            <li>Pipeline tasks are submitted to Pub/Sub and processed asynchronously</li>
          </ul>
        </div>

        {/* Books List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
            Books with Pipelines
          </h2>

          {(() => {
            // Filter books to only show those with pipeline steps or processing status
            // Show books that either:
            // 1. Have pipeline steps (status loaded and has steps)
            // 2. Are currently processing or pending (even without steps loaded)
            // 3. Have book status indicating processing
            // 4. Status not loaded yet (show while loading - give it time to load)
            const booksWithPipelines = books.filter(book => {
              const status = pipelineStatuses[book.safe_title]
              
              // If status not loaded yet, show the book (might have pipeline data, still loading)
              if (!status) {
                return true
              }
              
              // Show if has steps
              if (status.steps && status.steps.length > 0) {
                return true
              }
              
              // Show if processing or pending (might not have steps yet)
              if (status.isProcessing || 
                  status.overallStatus === 'processing' || 
                  status.overallStatus === 'in_progress' ||
                  status.overallStatus === 'pending') {
                return true
              }
              
              // Show if book status indicates processing
              if (status.bookStatus === 'processing' || 
                  status.bookStatus === 'in_progress' ||
                  status.bookStatus === 'pending') {
                return true
              }
              
              // Hide if status is loaded but has no steps and is not processing/pending
              // This means pipeline was removed or never existed
              return false
            })

            return booksWithPipelines.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <p className="text-lg">No books with pipeline data found.</p>
                <p className="text-sm mt-2">Books will appear here after you trigger a pipeline.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {booksWithPipelines.map((book) => {
                const isProcessing = processing[book.safe_title]
                const result = results[book.safe_title]

                return (
                  <div
                    key={book.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-1">
                          {book.title}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {book.chapter_count} {book.chapter_count === 1 ? 'chapter' : 'chapters'} • Safe Title: {book.safe_title}
                        </p>
                        
                        {/* Pipeline Status */}
                        {pipelineStatuses[book.safe_title] && (
                          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Pipeline Status:</span>
                                {getStatusBadge(pipelineStatuses[book.safe_title].overallStatus)}
                                {pipelineStatuses[book.safe_title].isProcessing && (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                )}
                              </div>
                              {pipelineStatuses[book.safe_title].bookStatus && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  Book: {pipelineStatuses[book.safe_title].bookStatus}
                                </span>
                              )}
                            </div>
                            
                            {/* Progress Indicator */}
                            {pipelineStatuses[book.safe_title].steps.length > 0 && (
                              <div className="mb-2">
                                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                                  <span>Processing Steps</span>
                                  <span>
                                    {pipelineStatuses[book.safe_title].steps.filter(s => 
                                      s.status === 'completed' || s.status === 'COMPLETED'
                                    ).length} / {pipelineStatuses[book.safe_title].steps.length} completed
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                  <div 
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ 
                                      width: `${Math.min(100, (pipelineStatuses[book.safe_title].steps.filter(s => 
                                        s.status === 'completed' || s.status === 'COMPLETED'
                                      ).length / Math.max(1, pipelineStatuses[book.safe_title].steps.length)) * 100)}%` 
                                    }}
                                  ></div>
                                </div>
                              </div>
                            )}
                            
                            {/* Steps Details */}
                            {pipelineStatuses[book.safe_title].steps.length > 0 && (
                              <div className="space-y-1.5 mt-2">
                                {pipelineStatuses[book.safe_title].steps.map((step, idx) => (
                                  <div key={step.id || idx} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2 flex-1">
                                      <span className="text-gray-600 dark:text-gray-400 min-w-[140px]">{step.step_name}:</span>
                                      {getStatusBadge(step.status)}
                                    </div>
                                    {step.updated_at && (
                                      <span className="text-gray-400 dark:text-gray-500 text-[10px]">
                                        {new Date(step.updated_at.seconds * 1000).toLocaleTimeString()}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* Error Messages */}
                            {pipelineStatuses[book.safe_title].steps.some(s => s.status === 'failed' && s.error_message) && (
                              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs">
                                <div className="font-semibold text-red-700 dark:text-red-400 mb-1">⚠️ Error Details:</div>
                                {pipelineStatuses[book.safe_title].steps
                                  .filter(s => s.status === 'failed' && s.error_message)
                                  .map((step, idx) => (
                                    <div key={idx} className="text-red-600 dark:text-red-400">
                                      <strong>{step.step_name}:</strong> {step.error_message}
                                    </div>
                                  ))}
                              </div>
                            )}
                            
                            {/* Last Updated */}
                            {pipelineStatuses[book.safe_title].steps.length > 0 && (
                              <div className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                                Last updated: {new Date().toLocaleTimeString()}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {result && (
                          <div
                            className={`mt-2 text-sm ${
                              result.success
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {result.success ? '✅' : '❌'} {result.message}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="flex gap-3">
                          {/* Audiobook Pipeline Button */}
                          <button
                            onClick={() => triggerPipeline(book.safe_title, 'content')}
                            disabled={isProcessing || stopping[book.safe_title] || removing[book.safe_title]}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                            title="Audiobook Pipeline: Generates content and audio files"
                          >
                            {isProcessing ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Processing...
                              </>
                            ) : (
                              <>
                                🎧 Audiobook Pipeline
                              </>
                            )}
                          </button>

                          {/* Picture Book Pipeline Button */}
                          <button
                            onClick={() => triggerPipeline(book.safe_title, 'illustrations')}
                            disabled={isProcessing || stopping[book.safe_title] || removing[book.safe_title]}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                            title="Picture Book Pipeline: Generates illustrations and compiles picture book"
                          >
                            {isProcessing ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Processing...
                              </>
                            ) : (
                              <>
                                🖼️ Picture Book Pipeline
                              </>
                            )}
                          </button>
                        </div>
                        
                        <div className="flex gap-2">
                          {/* Stop Pipeline Button */}
                          <button
                            onClick={() => stopPipeline(book.safe_title)}
                            disabled={stopping[book.safe_title] || removing[book.safe_title] || !pipelineStatuses[book.safe_title]?.isProcessing}
                            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                            title="Stop running pipeline"
                          >
                            {stopping[book.safe_title] ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                Stopping...
                              </>
                            ) : (
                              <>
                                ⏹️ Stop Pipeline
                              </>
                            )}
                          </button>

                          {/* Remove Pipeline Button */}
                          <button
                            onClick={() => removePipeline(book.safe_title)}
                            disabled={stopping[book.safe_title] || removing[book.safe_title]}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                            title="Remove all pipeline processing steps"
                          >
                            {removing[book.safe_title] ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                Removing...
                              </>
                            ) : (
                              <>
                                🗑️ Remove Pipeline
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

