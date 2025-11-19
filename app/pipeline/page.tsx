'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Book {
  id: string
  title: string
  safe_title: string
  chapter_count: number
  status: string
}

export default function PipelineManagement() {
  const router = useRouter()
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<Record<string, { success: boolean; message: string }>>({})

  useEffect(() => {
    loadBooks()
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
    } catch (error) {
      console.error('Error loading books:', error)
      alert('Failed to load books')
    } finally {
      setLoading(false)
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
        setResults(prev => ({
          ...prev,
          [bookSafeTitle]: {
            success: true,
            message: data.message || 'Pipeline triggered successfully',
          },
        }))
        alert(`✅ ${action === 'content' ? 'Content regeneration' : 'Illustration regeneration'} triggered successfully!`)
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
            Available Books
          </h2>

          {books.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-lg">No books found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {books.map((book) => {
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

                      <div className="flex gap-3">
                        {/* Audiobook Pipeline Button */}
                        <button
                          onClick={() => triggerPipeline(book.safe_title, 'content')}
                          disabled={isProcessing}
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
                          disabled={isProcessing}
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
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

