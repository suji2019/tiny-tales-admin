'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface FirestoreData {
  collection: string
  count: number
  data: any[]
}

export default function FirestoreViewer() {
  const router = useRouter()
  const [selectedCollection, setSelectedCollection] = useState<string>('books')
  const [data, setData] = useState<FirestoreData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const collections = [
    { value: 'books', label: 'Books', icon: '📚' },
    { value: 'chapters', label: 'Chapters', icon: '📖' },
    { value: 'sub_stories', label: 'Sub Stories', icon: '📑' },
    { value: 'pages', label: 'Pages', icon: '📄' },
    { value: 'processing_steps', label: 'Processing Steps', icon: '⚙️' },
  ]

  const loadData = async (collection: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/firestore?collection=${collection}&limit=100`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to load data')
      }
      const result = await response.json()
      setData(result)
    } catch (err: any) {
      setError(err.message || 'Failed to load Firestore data')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(selectedCollection)
  }, [selectedCollection])

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) {
      return '<null>'
    }
    if (typeof value === 'boolean') {
      return value.toString()
    }
    if (typeof value === 'number') {
      return value.toString()
    }
    if (typeof value === 'string') {
      // Truncate long strings
      if (value.length > 100) {
        return value.substring(0, 100) + '...'
      }
      return value
    }
    if (Array.isArray(value)) {
      return `[Array(${value.length})]`
    }
    if (typeof value === 'object') {
      return `{Object}`
    }
    return String(value)
  }

  const getTableHeaders = (): string[] => {
    if (!data || data.data.length === 0) return []
    
    // Get all unique keys from all items
    const allKeys = new Set<string>()
    data.data.forEach(item => {
      Object.keys(item).forEach(key => {
        if (key !== 'id') allKeys.add(key)
      })
    })
    
    // Sort keys, putting common fields first
    const commonFields = ['title', 'status', 'created_at', 'updated_at', 'book_id', 'chapter_id', 'sub_story_id', 'page_number', 'order_index']
    const sortedKeys = [
      ...commonFields.filter(k => allKeys.has(k)),
      ...Array.from(allKeys).filter(k => !commonFields.includes(k)).sort()
    ]
    
    return sortedKeys
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
              onClick={() => router.push('/pipeline')}
              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center"
            >
              🔄 Pipeline Management →
            </button>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
            🔥 Firestore Data Viewer
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            View and explore data stored in Firestore
          </p>
        </header>

        {/* Collection Selector */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
            Select Collection
          </h2>
          <div className="flex flex-wrap gap-3">
            {collections.map(collection => (
              <button
                key={collection.value}
                onClick={() => setSelectedCollection(collection.value)}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  selectedCollection === collection.value
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {collection.icon} {collection.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="text-red-700 dark:text-red-400 font-semibold">⚠️ Error</div>
            <div className="text-red-600 dark:text-red-300 mt-1">{error}</div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <div className="text-gray-600 dark:text-gray-400">Loading data...</div>
          </div>
        )}

        {/* Data Table */}
        {!loading && data && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">
                  {collections.find(c => c.value === selectedCollection)?.icon}{' '}
                  {collections.find(c => c.value === selectedCollection)?.label}
                </h2>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Collection: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{data.collection}</code>
                  {' • '}
                  Count: <span className="font-semibold">{data.count}</span>
                </div>
              </div>
            </div>

            {data.data.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                <p className="text-lg">No data found in this collection.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-12">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        ID
                      </th>
                      {getTableHeaders().map(header => (
                        <th
                          key={header}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                        >
                          {header.replace(/_/g, ' ')}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-24">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {data.data.map((item, index) => {
                      const isExpanded = expandedRows.has(item.id)
                      const headers = getTableHeaders()
                      
                      return (
                        <>
                          <tr
                            key={item.id}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                                {item.id}
                              </code>
                            </td>
                            {headers.map(header => (
                              <td
                                key={header}
                                className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300"
                              >
                                {formatValue(item[header])}
                              </td>
                            ))}
                            <td className="px-4 py-3">
                              <button
                                onClick={() => toggleRow(item.id)}
                                className="text-purple-600 dark:text-purple-400 hover:underline text-xs"
                              >
                                {isExpanded ? '▼ Collapse' : '▶ Expand'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-gray-50 dark:bg-gray-900/50">
                              <td colSpan={headers.length + 3} className="px-4 py-4">
                                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                                  <h4 className="font-semibold text-sm mb-2 text-gray-800 dark:text-white">
                                    Full Document Data
                                  </h4>
                                  <pre className="text-xs overflow-x-auto text-gray-700 dark:text-gray-300">
                                    {JSON.stringify(item, null, 2)}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Refresh Button */}
        {!loading && data && (
          <div className="mt-6 text-center">
            <button
              onClick={() => loadData(selectedCollection)}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            >
              🔄 Refresh Data
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

