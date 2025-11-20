'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface BookFile {
  filename: string
  book_title: string
  chapter_count: number
}

export default function Home() {
  const [books, setBooks] = useState<BookFile[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})

  const loadBooks = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/books')
      const data = await response.json()
      
      if (!response.ok) {
        console.error('API Error:', data)
        throw new Error(data.error || 'Failed to load books')
      }
      
      console.log(`📚 Loaded ${data.books?.length || 0} books from ${data.source || 'unknown source'}`)
      setBooks(data.books || [])
      
      if (data.books && data.books.length === 0) {
        console.log('ℹ️ No books found. Books will appear here after processing.')
      }
    } catch (error: any) {
      console.error('Error loading books:', error)
      // Don't show alert, just log - books might not exist yet
      setBooks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBooks()
  }, [])

  const handleDeleteBook = async (filename: string, bookTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${bookTitle}"? This will delete the book, all chapters, pages, and processing steps. This action cannot be undone.`)) {
      return
    }

    try {
      setDeleting(prev => ({ ...prev, [filename]: true }))
      const response = await fetch(`/api/books/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        alert(`✅ ${data.message}`)
        // Reload books list
        await loadBooks()
      } else {
        throw new Error(data.error || 'Failed to delete book')
      }
    } catch (error: any) {
      console.error('Error deleting book:', error)
      alert(`❌ Error: ${error.message || 'Failed to delete book'}`)
    } finally {
      setDeleting(prev => ({ ...prev, [filename]: false }))
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
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
                📚 Tiny Tales Admin
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Manage your children's storybooks, chapters, and illustrations
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/pipeline/run"
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-lg transition-colors shadow-lg"
              >
                🚀 Run New Book
              </Link>
              <Link
                href="/pipeline"
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-colors shadow-lg"
              >
                🔄 Pipeline Management
              </Link>
              <Link
                href="/firestore"
                className="px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-semibold rounded-lg transition-colors shadow-lg"
              >
                🔥 Firestore Viewer
              </Link>
            </div>
          </div>
        </header>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">
              Storybooks
            </h2>
            <button
              onClick={loadBooks}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Loading...
                </>
              ) : (
                <>
                  🔄 Refresh
                </>
              )}
            </button>
          </div>
          
          {books.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-lg">No storybooks found.</p>
              <p className="text-sm mt-2">
                Books are stored in Firestore after processing. Use "Run New Book" to process a new book.
              </p>
              <Link
                href="/pipeline/run"
                className="mt-4 inline-block px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
              >
                🚀 Process Your First Book
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {books.map((book) => (
                <div
                  key={book.filename}
                  className="relative p-6 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900 dark:to-blue-900 rounded-lg hover:shadow-xl transition-shadow duration-200 border-2 border-transparent hover:border-purple-400"
                >
                  <Link
                    href={`/books/${encodeURIComponent(book.filename)}`}
                    className="block"
                  >
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
                      {book.book_title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 text-sm">
                      {book.chapter_count} {book.chapter_count === 1 ? 'chapter' : 'chapters'}
                    </p>
                    <div className="mt-4 text-purple-600 dark:text-purple-400 text-sm font-medium">
                      Edit →
                    </div>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleDeleteBook(book.filename, book.book_title)
                    }}
                    disabled={deleting[book.filename]}
                    className="absolute top-2 right-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Delete book"
                  >
                    {deleting[book.filename] ? 'Deleting...' : '🗑️'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">
            ℹ️ About the System
          </h3>
          <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
            <li>
              <strong>Two Independent Pipelines:</strong> Audiobook Pipeline (content + audio) and Picture Book Pipeline (illustrations)
            </li>
            <li>
              <strong>No Pre-registration Required:</strong> You can process any book title directly
            </li>
            <li>
              <strong>Data Storage:</strong> Books are stored in Firestore and Cloud Storage after processing
            </li>
            <li>
              <strong>Flexible Processing:</strong> Process entire books or individual chapters
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

