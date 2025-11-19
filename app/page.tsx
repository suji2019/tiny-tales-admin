import Link from 'next/link'
import { getFirestoreClient } from '@/lib/firestore'

interface BookFile {
  filename: string
  book_title: string
  chapter_count: number
}

async function getBooks(): Promise<BookFile[]> {
  try {
    const firestore = getFirestoreClient()
    const books = await firestore.getAllBooks()
    
    return books.map(book => ({
      filename: book.safe_title,
      book_title: book.title,
      chapter_count: book.chapter_count || 0,
    }))
  } catch (error) {
    console.error('Error fetching books from Firestore:', error)
    return []
  }
}

export default async function Home() {
  const books = await getBooks()

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
            </div>
          </div>
        </header>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
            Storybooks
          </h2>
          
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
                <Link
                  key={book.filename}
                  href={`/books/${encodeURIComponent(book.filename)}`}
                  className="block p-6 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900 dark:to-blue-900 rounded-lg hover:shadow-xl transition-shadow duration-200 border-2 border-transparent hover:border-purple-400"
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

